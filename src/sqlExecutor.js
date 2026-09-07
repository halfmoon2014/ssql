const mysql = require("mysql2/promise");
const { AppError } = require("./errors");
const { ConcurrencyLimiter } = require("./concurrencyLimiter");

const blockedWords = /\b(truncate|alter|grant|revoke|use|load_file|outfile|infile)\b/i;
const supportedMyBatisTags = new Set(["if", "where", "foreach", "choose", "when", "otherwise"]);
const unsupportedMyBatisTagPattern = /<\s*(set|trim|include|bind)\b/i;
const unsafeMybatisParamPattern = /\$\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}/;
const mysqlBusinessPools = new Map();
const mssqlBusinessPools = new Map();
const datasourceLimiters = new Map();

function decodeXmlEntities(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function hasMyBatisXml(sqlText) {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<\s*(mapper|select)\b/i.test(String(sqlText || ""));
}

function parseXmlAttrs(rawAttrs) {
  const attrs = {};
  const attrPattern = /([a-zA-Z_:][a-zA-Z0-9_:\-.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match = attrPattern.exec(rawAttrs);
  while (match) {
    attrs[match[1]] = decodeXmlEntities(match[2] === undefined ? match[3] : match[2]);
    match = attrPattern.exec(rawAttrs);
  }
  return attrs;
}

function extractMyBatisSelectBody(sqlText) {
  const text = String(sqlText || "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const matches = [...text.matchAll(/<\s*select\b[^>]*>([\s\S]*?)<\s*\/\s*select\s*>/gi)];
  if (matches.length === 0) throw new AppError(400, "mybatis xml must contain select tag");
  if (matches.length > 1) throw new AppError(400, "mybatis xml must contain only one select tag");
  return matches[0][1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseMyBatisFragment(fragment) {
  // 只解析支持的 MyBatis 动态标签；其它 XML 标签会被拒绝，避免静默生成错误 SQL。
  if (unsupportedMyBatisTagPattern.test(fragment)) {
    throw new AppError(400, "unsupported mybatis dynamic tag");
  }
  const root = { type: "tag", name: "root", attrs: {}, children: [] };
  const stack = [root];
  let i = 0;

  function findTagEnd(start) {
    let quote = null;
    for (let j = start; j < fragment.length; j += 1) {
      const char = fragment[j];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "\"" || char === "'") {
        quote = char;
        continue;
      }
      if (char === ">") return j;
    }
    return -1;
  }

  while (i < fragment.length) {
    const current = stack[stack.length - 1];
    const tagStart = fragment.indexOf("<", i);
    if (tagStart === -1) {
      current.children.push({ type: "text", value: fragment.slice(i) });
      break;
    }

    if (tagStart > i) {
      current.children.push({ type: "text", value: fragment.slice(i, tagStart) });
    }

    const tagEnd = findTagEnd(tagStart + 1);
    if (tagEnd === -1) throw new AppError(400, "invalid mybatis xml");
    const rawTag = fragment.slice(tagStart + 1, tagEnd).trim();

    if (rawTag.startsWith("/")) {
      const name = rawTag.slice(1).trim().toLowerCase();
      if (stack.length === 1 || current.name !== name) {
        throw new AppError(400, `invalid mybatis xml tag: ${name}`);
      }
      stack.pop();
      i = tagEnd + 1;
      continue;
    }

    const selfClosing = rawTag.endsWith("/");
    const openTag = selfClosing ? rawTag.slice(0, -1).trim() : rawTag;
    const tagMatch = openTag.match(/^([a-zA-Z][a-zA-Z0-9_-]*)([\s\S]*)$/);
    if (!tagMatch) throw new AppError(400, "invalid mybatis xml tag");
    const name = tagMatch[1].toLowerCase();
    if (name.startsWith("!") || name.startsWith("?")) {
      i = tagEnd + 1;
      continue;
    }

    if (tagMatch) {
      if (!supportedMyBatisTags.has(name)) {
        throw new AppError(400, `unsupported mybatis tag: ${name}`);
      }
      const node = {
        type: "tag",
        name,
        attrs: parseXmlAttrs(tagMatch[2] || ""),
        children: []
      };
      current.children.push(node);
      if (!selfClosing) stack.push(node);
    }

    i = tagEnd + 1;
  }
  if (stack.length !== 1) {
    throw new AppError(400, "invalid mybatis xml");
  }
  return root.children;
}

function getParamValue(params, pathName) {
  if (Object.prototype.hasOwnProperty.call(params, pathName)) return params[pathName];
  const parts = String(pathName).split(".");
  let value = params;
  for (const part of parts) {
    if (part === "size" && (Array.isArray(value) || typeof value === "string")) {
      value = value.length;
      continue;
    }
    if (!value || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, part)) {
      return undefined;
    }
    value = value[part];
  }
  return value;
}

function hasParamValue(params, pathName) {
  return getParamValue(params, pathName) !== undefined;
}

function parseTestLiteral(raw) {
  const value = String(raw).trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return quoted[2];
  throw new AppError(400, `unsupported mybatis test literal: ${raw}`);
}

function compareValues(left, operator, right) {
  if (right === null && operator === "==") return left === null || left === undefined;
  if (right === null && operator === "!=") return left !== null && left !== undefined;
  if (operator === "==") return left === right;
  if (operator === "!=") return left !== right;
  if (operator === ">") return left > right;
  if (operator === "<") return left < right;
  if (operator === ">=") return left >= right;
  if (operator === "<=") return left <= right;
  throw new AppError(400, `unsupported mybatis test operator: ${operator}`);
}

function evaluateTestAtom(atom, params) {
  const text = String(atom).trim();
  if (!text) return false;
  if (text.startsWith("!")) return !evaluateTestAtom(text.slice(1), params);
  const comparison = text.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(==|!=|>=|<=|>|<)\s*(null|true|false|''|""|'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?)$/);
  if (comparison) {
    return compareValues(getParamValue(params, comparison[1]), comparison[2], parseTestLiteral(comparison[3]));
  }
  return Boolean(getParamValue(params, text));
}

function evaluateMyBatisTest(test, params) {
  // 支持常见 test 子集：field、!field、==/!= null、==/!= ''、数字比较，以及 and/or 组合。
  const orParts = String(test || "").split(/\s+or\s+/i);
  return orParts.some((orPart) => {
    const andParts = orPart.split(/\s+and\s+/i);
    return andParts.every((andPart) => evaluateTestAtom(andPart, params));
  });
}

function cleanSqlFragment(value) {
  return String(value).replace(/[ \t]+\n/g, "\n").trim();
}

function renderWhere(children, context) {
  const body = cleanSqlFragment(renderMyBatisNodes(children, context));
  if (!body) return "";
  const cleaned = body.replace(/^(and|or)\b\s*/i, "");
  return ` where ${cleaned} `;
}

function renderChoose(children, context) {
  let otherwise = null;
  for (const child of children) {
    if (child.type !== "tag") continue;
    if (child.name === "when" && evaluateMyBatisTest(child.attrs.test, context.params)) {
      return renderMyBatisNodes(child.children, context);
    }
    if (child.name === "otherwise") otherwise = child;
  }
  return otherwise ? renderMyBatisNodes(otherwise.children, context) : "";
}

function safeGeneratedName(value) {
  return String(value || "item").replace(/[^a-zA-Z0-9_]/g, "_");
}

function rewriteForeachItemParams(sql, itemName, itemValue, context) {
  return sql.replace(/#\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s*,[^}]*)?\s*\}/g, (full, name) => {
    if (name !== itemName && !name.startsWith(`${itemName}.`)) return full;
    const value = name === itemName ? itemValue : getParamValue({ [itemName]: itemValue }, name);
    const generatedName = `__foreach_${safeGeneratedName(itemName)}_${context.generatedIndex}`;
    context.generatedIndex += 1;
    context.params[generatedName] = value;
    return `#{${generatedName}}`;
  });
}

function renderForeach(node, context) {
  const collectionName = node.attrs.collection;
  const itemName = node.attrs.item || "item";
  if (!collectionName) throw new AppError(400, "mybatis foreach collection is required");
  const collection = getParamValue(context.params, collectionName);
  if (collection === undefined || collection === null) return "";
  if (!Array.isArray(collection)) throw new AppError(400, `mybatis foreach collection must be array: ${collectionName}`);
  const open = node.attrs.open || "";
  const close = node.attrs.close || "";
  const separator = node.attrs.separator === undefined ? "," : node.attrs.separator;
  const parts = collection.map((itemValue) => {
    const childContext = {
      ...context,
      params: {
        ...context.params,
        [itemName]: itemValue
      }
    };
    const rendered = renderMyBatisNodes(node.children, childContext);
    return cleanSqlFragment(rewriteForeachItemParams(rendered, itemName, itemValue, context));
  }).filter(Boolean);
  if (parts.length === 0) return "";
  return `${open}${parts.join(separator)}${close}`;
}

function renderMyBatisNode(node, context) {
  if (node.type === "text") return decodeXmlEntities(node.value);
  if (node.name === "if") {
    return evaluateMyBatisTest(node.attrs.test, context.params) ? renderMyBatisNodes(node.children, context) : "";
  }
  if (node.name === "where") return renderWhere(node.children, context);
  if (node.name === "foreach") return renderForeach(node, context);
  if (node.name === "choose") return renderChoose(node.children, context);
  if (node.name === "when" || node.name === "otherwise") {
    throw new AppError(400, `mybatis ${node.name} must be inside choose`);
  }
  throw new AppError(400, `unsupported mybatis tag: ${node.name}`);
}

function renderMyBatisNodes(nodes, context) {
  return nodes.map((node) => renderMyBatisNode(node, context)).join("");
}

function extractMyBatisSelectSql(sqlText, params = {}) {
  const body = extractMyBatisSelectBody(sqlText);
  if (unsafeMybatisParamPattern.test(body)) {
    throw new AppError(400, "mybatis ${} params are not allowed");
  }
  const context = {
    params,
    generatedIndex: 0
  };
  return cleanSqlFragment(renderMyBatisNodes(parseMyBatisFragment(body), context));
}

function normalizeSqlMode(mode, sqlText) {
  if (mode === "sql" || mode === "xml") return mode;
  return hasMyBatisXml(sqlText) ? "xml" : "sql";
}

function normalizeSqlText(sqlText, params = {}, mode = null) {
  // 后端优先按保存的 sqlMode 执行；旧数据没有模式时才自动识别。
  const sqlMode = normalizeSqlMode(mode, sqlText);
  return sqlMode === "xml" ? extractMyBatisSelectSql(sqlText, params) : String(sqlText || "");
}

function stripTrailingSemicolon(sql) {
  // 允许用户习惯性输入结尾分号，但禁止多语句。
  return sql.trim().replace(/;+\s*$/, "");
}

function splitSqlStatements(sql) {
  // 按真实语句分隔符切分，忽略字符串、注释和 MSSQL 方括号标识符中的分号。
  const statements = [];
  let quote = null;
  let bracketIdentifier = false;
  let lineComment = false;
  let blockComment = false;
  let start = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (char === quote) {
        if (sql[i + 1] === quote) {
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (bracketIdentifier) {
      if (char === "]") bracketIdentifier = false;
      continue;
    }

    if (char === "-" && next === "-") {
      lineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "[") {
      bracketIdentifier = true;
      continue;
    }

    if (char === ";") {
      const statement = sql.slice(start, i).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const last = sql.slice(start).trim();
  if (last) statements.push(last);
  return statements;
}

function stripLeadingSqlComments(statement) {
  let text = String(statement || "").trim();
  let changed = true;
  while (changed) {
    changed = false;
    if (text.startsWith("--")) {
      const end = text.indexOf("\n");
      text = end === -1 ? "" : text.slice(end + 1).trim();
      changed = true;
    }
    if (text.startsWith("/*")) {
      const end = text.indexOf("*/");
      text = end === -1 ? "" : text.slice(end + 2).trim();
      changed = true;
    }
  }
  return text;
}

function normalizeSqlIdentifier(value) {
  return String(value || "").replace(/^[`"\[]|[`"\]]$/g, "").toLowerCase();
}

function readTargetTable(statement, pattern) {
  const match = stripLeadingSqlComments(statement).match(pattern);
  return match ? normalizeSqlIdentifier(match[1]) : null;
}

function validateStatement(statement, context) {
  const text = stripLeadingSqlComments(statement);
  if (!text) return;
  if (blockedWords.test(text)) throw new AppError(400, "sql contains blocked keyword");
  if (/^\s*(select|with|show|describe|desc)\b/i.test(text)) return;

  const mysqlTempTable = readTargetTable(text, /^\s*create\s+temporary\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[]?[a-zA-Z_][a-zA-Z0-9_.$#]*[`"\]]?)/i);
  if (mysqlTempTable) {
    context.tempTables.add(mysqlTempTable);
    return;
  }

  const mssqlTempTable = readTargetTable(text, /^\s*create\s+table\s+([`"\[]?#\w+[`"\]]?)/i);
  if (mssqlTempTable) {
    context.tempTables.add(mssqlTempTable);
    return;
  }

  const insertTarget = readTargetTable(text, /^\s*insert\s+into\s+([`"\[]?[#a-zA-Z_][a-zA-Z0-9_.$#]*[`"\]]?)/i);
  if (insertTarget && context.tempTables.has(insertTarget)) return;

  const dropMysqlTemp = readTargetTable(text, /^\s*drop\s+temporary\s+table\s+(?:if\s+exists\s+)?([`"\[]?[a-zA-Z_][a-zA-Z0-9_.$#]*[`"\]]?)/i);
  if (dropMysqlTemp && context.tempTables.has(dropMysqlTemp)) return;

  const dropMssqlTemp = readTargetTable(text, /^\s*drop\s+table\s+(?:if\s+exists\s+)?([`"\[]?#\w+[`"\]]?)/i);
  if (dropMssqlTemp && context.tempTables.has(dropMssqlTemp)) return;

  throw new AppError(400, "only query sql or temporary-table batch sql is allowed");
}

function assertSafeSql(sql) {
  // 动态 API 允许查询和临时表批处理；真实表写入和 DDL 仍然禁止。
  const clean = stripTrailingSemicolon(sql);
  if (!clean) throw new AppError(400, "sql is required");
  const statements = splitSqlStatements(clean);
  if (statements.length === 0) throw new AppError(400, "sql is required");
  const context = { tempTables: new Set() };
  for (const statement of statements) validateStatement(statement, context);
  return clean;
}

function normalizeDatabaseType(type) {
  const value = String(type || "mysql").toLowerCase();
  if (value === "mysql" || value === "mssql") return value;
  throw new AppError(500, `unsupported database type: ${value}`);
}

function buildPlaceholder(index, databaseType) {
  return databaseType === "mssql" ? `@p${index}` : "?";
}

function compileNamedParams(sql, params, databaseType = "mysql") {
  // 将 #{name} 参数转成目标数据库占位符，同时跳过字符串和反引号内容。
  const type = normalizeDatabaseType(databaseType);
  const values = [];
  const parameters = [];
  let output = "";
  let executableOutput = "";
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (quote) {
      output += char;
      executableOutput += char;
      if (char === quote && sql[i - 1] !== "\\") quote = null;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      output += char;
      executableOutput += char;
      continue;
    }

    if (char === "#" && next === "{") {
      let j = i + 2;
      while (j < sql.length && /\s/.test(sql[j])) j += 1;
      const nameStart = j;
      if (!/[a-zA-Z_]/.test(sql[j] || "")) {
        throw new AppError(400, "invalid mybatis sql param");
      }
      while (j < sql.length && /[a-zA-Z0-9_.]/.test(sql[j])) j += 1;
      const name = sql.slice(nameStart, j);
      while (j < sql.length && sql[j] !== "}") j += 1;
      if (sql[j] !== "}") throw new AppError(400, "invalid mybatis sql param");
      if (!hasParamValue(params, name)) {
        throw new AppError(400, `missing sql param: ${name}`);
      }
      const value = getParamValue(params, name);
      const parameterName = `p${values.length}`;
      output += buildPlaceholder(values.length, type);
      executableOutput += type === "mysql" ? mysql.escape(value) : buildPlaceholder(values.length, type);
      values.push(value);
      parameters.push({ name: parameterName, value });
      i = j;
      continue;
    }

    output += char;
    executableOutput += char;
  }

  return { sql: output, executableSql: executableOutput, values, parameters };
}

function resolveDatabaseSource(config, api = {}) {
  // API 通过 databaseAlias 选择业务库；旧配置没有别名时回退到 default / mysql。
  const alias = String(api.databaseAlias || config.defaultAlias || "default");
  const source = config.sourceMap && config.sourceMap[alias]
    ? config.sourceMap[alias]
    : config.sources && config.sources.find((item) => item.alias === alias);
  if (source) return source;
  if (config.mysql && (alias === "default" || alias === config.mysql.alias)) return config.mysql;
  throw new AppError(500, `database alias not found: ${alias}`);
}

function toMysqlConnectionOptions(source) {
  // 数据源元信息只参与路由和日志，不传入 mysql2。
  const { alias, type, server, options, pool, concurrency, ...connectionOptions } = source;
  return connectionOptions;
}

function toPositiveInteger(value, fallback) {
  const number = value === undefined || value === null || value === "" ? Number(fallback) : Number(value);
  if (!Number.isFinite(number) || number < 1) return Number(fallback);
  return Math.floor(number);
}

function toNonNegativeInteger(value, fallback) {
  const number = value === undefined || value === null || value === "" ? Number(fallback) : Number(value);
  if (!Number.isFinite(number) || number < 0) return Number(fallback);
  return Math.floor(number);
}

function getSqlExecutionConfig(config) {
  return config.sqlExecution || {};
}

function getMysqlPoolConfig(config, source) {
  const poolConfig = getSqlExecutionConfig(config).businessPool?.mysql || {};
  const sourcePool = source.pool && typeof source.pool === "object" ? source.pool : {};
  return {
    waitForConnections: sourcePool.waitForConnections ?? poolConfig.waitForConnections ?? true,
    connectionLimit: toPositiveInteger(sourcePool.connectionLimit, poolConfig.connectionLimit || 10),
    queueLimit: toNonNegativeInteger(sourcePool.queueLimit, poolConfig.queueLimit ?? 0),
    connectTimeoutMs: toPositiveInteger(sourcePool.connectTimeoutMs || source.connectTimeout, poolConfig.connectTimeoutMs || 10000)
  };
}

function getMssqlPoolConfig(config, source) {
  const poolConfig = getSqlExecutionConfig(config).businessPool?.mssql || {};
  const sourcePool = source.pool && typeof source.pool === "object" ? source.pool : {};
  return {
    max: toPositiveInteger(sourcePool.max, poolConfig.max || 10),
    min: toNonNegativeInteger(sourcePool.min, poolConfig.min || 0),
    idleTimeoutMillis: toPositiveInteger(sourcePool.idleTimeoutMillis, poolConfig.idleTimeoutMillis || 30000)
  };
}

function getDatasourceConcurrencyConfig(config, source) {
  const execution = getSqlExecutionConfig(config);
  const defaultConfig = execution.datasourceConcurrency?.default || {
    enabled: true,
    max: 10,
    queueLimit: 100,
    queueTimeoutMs: 3000
  };
  const sourceConfig = execution.datasourceConcurrency?.sources?.[source.alias] || source.concurrency || {};
  return {
    enabled: sourceConfig.enabled ?? defaultConfig.enabled ?? true,
    max: toPositiveInteger(sourceConfig.max, defaultConfig.max || 10),
    queueLimit: toNonNegativeInteger(sourceConfig.queueLimit, defaultConfig.queueLimit ?? 100),
    queueTimeoutMs: toNonNegativeInteger(sourceConfig.queueTimeoutMs, defaultConfig.queueTimeoutMs ?? 3000)
  };
}

function getDatasourceLimiter(config, source) {
  const limiterConfig = getDatasourceConcurrencyConfig(config, source);
  const key = `${source.type}:${source.alias}`;
  const existing = datasourceLimiters.get(key);
  if (existing && JSON.stringify(existing.config) === JSON.stringify(limiterConfig)) return existing.limiter;

  const limiter = new ConcurrencyLimiter({
    name: `datasource:${source.alias}`,
    ...limiterConfig
  });
  datasourceLimiters.set(key, {
    config: limiterConfig,
    limiter
  });
  return limiter;
}

function getMysqlPool(config, source) {
  const poolConfig = getMysqlPoolConfig(config, source);
  const key = `${source.alias}:${source.host || ""}:${source.port || ""}:${source.database || ""}`;
  const existing = mysqlBusinessPools.get(key);
  if (existing) return existing;

  const pool = mysql.createPool({
    ...toMysqlConnectionOptions(source),
    multipleStatements: true,
    waitForConnections: poolConfig.waitForConnections,
    connectionLimit: poolConfig.connectionLimit,
    queueLimit: poolConfig.queueLimit,
    connectTimeout: poolConfig.connectTimeoutMs
  });
  mysqlBusinessPools.set(key, pool);
  return pool;
}

function getMssqlPoolKey(source) {
  return `${source.alias}:${source.server || source.host || ""}:${source.port || ""}:${source.database || ""}`;
}

function getMssqlPoolEntry(config, source) {
  const key = getMssqlPoolKey(source);
  const existing = mssqlBusinessPools.get(key);
  if (existing) return existing;

  let mssql = null;
  try {
    mssql = require("mssql");
  } catch (error) {
    throw new AppError(500, "mssql driver is not installed", { reason: "run npm install mssql" });
  }

  const pool = new mssql.ConnectionPool({
    server: source.server || source.host,
    port: source.port ? Number(source.port) : undefined,
    user: source.user,
    password: source.password,
    database: source.database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      ...(source.options || {})
    },
    pool: getMssqlPoolConfig(config, source)
  });
  const entry = {
    key,
    pool,
    connectPromise: null
  };
  mssqlBusinessPools.set(key, entry);
  return entry;
}

async function getConnectedMssqlPool(config, source) {
  const entry = getMssqlPoolEntry(config, source);
  if (!entry.connectPromise) {
    // 同一数据源的并发首批请求共用同一个连接初始化 Promise，避免重复建池。
    entry.connectPromise = entry.pool.connect().catch(async (error) => {
      mssqlBusinessPools.delete(entry.key);
      await entry.pool.close().catch(() => {});
      throw error;
    });
  }
  return entry.connectPromise;
}

function fieldNames(fields) {
  return Array.isArray(fields) ? fields.map((field) => field && field.name).filter(Boolean) : [];
}

function normalizeMysqlResultSets(rows, fields) {
  const multi = Array.isArray(rows)
    && (rows.some((rowSet) => Array.isArray(rowSet)) || Array.isArray(fields && fields[0]));
  if (!multi) {
    return Array.isArray(rows) ? [{ fields: fieldNames(fields), rows }] : [];
  }

  const resultSets = [];
  for (let i = 0; i < rows.length; i += 1) {
    const rowSet = rows[i];
    const fieldSet = Array.isArray(fields) ? fields[i] : null;
    if (Array.isArray(rowSet)) {
      resultSets.push({
        fields: fieldNames(fieldSet),
        rows: rowSet
      });
    }
  }
  return resultSets;
}

function normalizeMssqlResultSets(result) {
  return (result.recordsets || []).map((recordset) => ({
    fields: recordset && recordset.columns ? Object.keys(recordset.columns) : [],
    rows: Array.isArray(recordset) ? recordset : []
  }));
}

function prepareSqlExecution(api, params, databaseType = "mysql") {
  // 生成真正发给数据库的 SQL，同时返回调试信息用于请求级排查。
  const sqlParams = { ...(params || {}) };
  const sqlMode = normalizeSqlMode(api.sqlMode, api.sqlText);
  const renderedSql = normalizeSqlText(api.sqlText, sqlParams, sqlMode);
  const safeSql = assertSafeSql(renderedSql);
  const type = normalizeDatabaseType(databaseType);
  const compiled = compileNamedParams(safeSql, sqlParams, type);

  return {
    sql: compiled.sql,
    executableSql: compiled.executableSql,
    values: compiled.values,
    parameters: compiled.parameters,
    debug: {
      databaseAlias: api.databaseAlias || "default",
      databaseType: type,
      mode: sqlMode,
      originalSql: api.sqlText || "",
      renderedSql: safeSql,
      boundSql: compiled.sql,
      boundValues: compiled.values
    }
  };
}

function throwIfAborted(signal, message = "sql test aborted") {
  if (signal?.aborted) throw new AppError(499, message);
}

async function executeMysql(config, source, api, prepared, options = {}) {
  throwIfAborted(options.signal);
  const pool = getMysqlPool(config, source);
  let connection = null;
  let aborted = false;
  function abortQuery() {
    aborted = true;
    if (connection) connection.destroy();
  }

  try {
    connection = await pool.getConnection();
    if (options.signal) options.signal.addEventListener("abort", abortQuery, { once: true });
    throwIfAborted(options.signal);
    const [rows, fields] = await connection.query({
      sql: prepared.executableSql || prepared.sql,
      timeout: api.sqlTimeoutMs || 5000
    });
    throwIfAborted(options.signal);
    const resultSets = normalizeMysqlResultSets(rows, fields);
    return {
      rows: resultSets[0]?.rows || [],
      fields: resultSets[0]?.fields || [],
      resultSets,
      sqlDebug: prepared.debug
    };
  } catch (error) {
    if (aborted || options.signal?.aborted) throw new AppError(499, "sql test aborted");
    throw new AppError(500, "sql execute failed", { reason: error.message });
  } finally {
    if (options.signal) options.signal.removeEventListener("abort", abortQuery);
    if (!connection) return;
    if (aborted || options.signal?.aborted) {
      connection.destroy();
    } else {
      connection.release();
    }
  }
}

async function executeMssql(config, source, api, prepared, options = {}) {
  throwIfAborted(options.signal);
  const pool = await getConnectedMssqlPool(config, source);
  let request = null;
  function abortQuery() {
    if (request) request.cancel();
  }

  try {
    request = pool.request();
    request.timeout = api.sqlTimeoutMs || 5000;
    if (options.signal) options.signal.addEventListener("abort", abortQuery, { once: true });
    throwIfAborted(options.signal);
    for (const parameter of prepared.parameters || []) {
      request.input(parameter.name, parameter.value);
    }
    const result = await request.query(prepared.sql);
    throwIfAborted(options.signal);
    const resultSets = normalizeMssqlResultSets(result);
    return {
      rows: resultSets[0]?.rows || [],
      fields: resultSets[0]?.fields || [],
      resultSets,
      sqlDebug: prepared.debug
    };
  } catch (error) {
    if (options.signal?.aborted) throw new AppError(499, "sql test aborted");
    throw new AppError(500, "sql execute failed", { reason: error.message });
  } finally {
    if (options.signal) options.signal.removeEventListener("abort", abortQuery);
  }
}

async function executeSqlWithFields(config, api, params, preparedSql = null, options = {}) {
  const source = resolveDatabaseSource(config, api);
  const databaseType = normalizeDatabaseType(source.type);

  // 安全校验和参数编译都在建立连接前完成，失败时不占用连接。
  const prepared = preparedSql || prepareSqlExecution(api, params, databaseType);
  const limiter = getDatasourceLimiter(config, source);
  const release = await limiter.acquire({
    signal: options.signal,
    abortMessage: "sql test aborted"
  });
  try {
    if (databaseType === "mysql") return await executeMysql(config, source, api, prepared, options);
    if (databaseType === "mssql") return await executeMssql(config, source, api, prepared, options);
    throw new AppError(500, `unsupported database type: ${databaseType}`);
  } finally {
    release();
  }
}

async function executeSql(config, api, params) {
  const result = await executeSqlWithFields(config, api, params);
  return result.rows;
}

async function closeBusinessSqlPools() {
  const mysqlPools = [...mysqlBusinessPools.values()];
  const mssqlPools = [...mssqlBusinessPools.values()].map((entry) => entry.pool);
  mysqlBusinessPools.clear();
  mssqlBusinessPools.clear();
  datasourceLimiters.clear();
  await Promise.allSettled([
    ...mysqlPools.map((pool) => pool.end()),
    ...mssqlPools.map((pool) => pool.close())
  ]);
}

function getBusinessSqlPoolStats() {
  return {
    mysqlPools: mysqlBusinessPools.size,
    mssqlPools: mssqlBusinessPools.size,
    datasourceLimiters: [...datasourceLimiters.values()].map((entry) => entry.limiter.stats())
  };
}

module.exports = {
  closeBusinessSqlPools,
  compileNamedParams,
  executeSql,
  executeSqlWithFields,
  extractMyBatisSelectSql,
  evaluateMyBatisTest,
  getBusinessSqlPoolStats,
  normalizeSqlMode,
  normalizeSqlText,
  normalizeMysqlResultSets,
  prepareSqlExecution,
  resolveDatabaseSource
};
