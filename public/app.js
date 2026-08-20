const state = {
  // 页面级状态集中保存，避免多个控件各自维护重复数据。
  apis: [],
  current: null,
  databaseSources: [],
  defaultDatabaseAlias: "default",
  list: {
    name: "",
    sql: "",
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  },
  rowFields: [],
  scriptType: "result",
  scriptDrafts: {
    params: "",
    result: ""
  },
  editors: {
    params: null,
    sql: null,
    script: null
  }
};

const sqlResultCachePrefix = "ssql.sqlResult.";

function getAppBasePath() {
  // 反向代理挂在 /ssql/ 这类子路径时，app.js 的实际地址会带前缀。
  // 用当前脚本地址反推出前缀，后续 /admin/* 请求才能走同一个 Nginx location。
  const script = document.currentScript || document.querySelector('script[src$="app.js"]');
  if (!script) return "";
  const scriptPath = new URL(script.getAttribute("src"), window.location.href).pathname;
  return scriptPath.endsWith("/app.js") ? scriptPath.slice(0, -"/app.js".length) : "";
}

const appBasePath = getAppBasePath();

const els = {
  // DOM 引用只在启动时获取一次，后续逻辑通过 els 访问页面控件。
  apiList: document.getElementById("apiList"),
  newApiBtn: document.getElementById("newApiBtn"),
  apiSearchForm: document.getElementById("apiSearchForm"),
  nameSearchInput: document.getElementById("nameSearchInput"),
  sqlSearchInput: document.getElementById("sqlSearchInput"),
  pageSizeInput: document.getElementById("pageSizeInput"),
  resetSearchBtn: document.getElementById("resetSearchBtn"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  saveBtn: document.getElementById("saveBtn"),
  publishBtn: document.getElementById("publishBtn"),
  disableBtn: document.getElementById("disableBtn"),
  pageTitle: document.getElementById("pageTitle"),
  statusText: document.getElementById("statusText"),
  statusBadge: document.getElementById("statusBadge"),
  nameInput: document.getElementById("nameInput"),
  pathInput: document.getElementById("pathInput"),
  methodInput: document.getElementById("methodInput"),
  databaseAliasInput: document.getElementById("databaseAliasInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  paramsInput: document.getElementById("paramsInput"),
  sqlModeInput: document.getElementById("sqlModeInput"),
  sqlHelpBtn: document.getElementById("sqlHelpBtn"),
  rawSqlHelpBtn: document.getElementById("rawSqlHelpBtn"),
  xmlSqlHelpBtn: document.getElementById("xmlSqlHelpBtn"),
  sqlHelpBox: document.getElementById("sqlHelpBox"),
  sqlHelpCloseBtn: document.getElementById("sqlHelpCloseBtn"),
  sqlHelpContent: document.getElementById("sqlHelpContent"),
  runSqlBtn: document.getElementById("runSqlBtn"),
  logBox: document.getElementById("logBox"),
  rowFieldsInfo: document.getElementById("rowFieldsInfo"),
  sqlInput: document.getElementById("sqlInput"),
  scriptTypeInput: document.getElementById("scriptTypeInput"),
  scriptHelpBtn: document.getElementById("scriptHelpBtn"),
  scriptHelpBox: document.getElementById("scriptHelpBox"),
  scriptHelpCloseBtn: document.getElementById("scriptHelpCloseBtn"),
  scriptInput: document.getElementById("scriptInput")
};

const defaultParamScript = "";

const defaultResultScript = `async function main({ params, resultSets, callApi }) {
  return resultSets;
}`;

const sqlHelpText = {
  raw: `select *
from students
where id = #{id}

-- 参数从示例参数或请求入参读取:
-- { "id": 1 }

-- 多结果集和临时表示例:
create temporary table tmp_students (id int);
insert into tmp_students values (#{id});
select * from tmp_students;
select count(*) as total from tmp_students;
drop temporary table tmp_students;`,
  xml: `<select>
  select *
  from students
  <where>
    <if test="id != null">
      and id = #{id}
    </if>
    <if test="name != null and name != ''">
      and name like #{name}
    </if>
  </where>
</select>`
};

function showStatus(message) {
  els.statusText.textContent = message;
}

function showLog(value) {
  els.logBox.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function setSqlHelpType(type) {
  // SQL 帮助只切换示例文本，不改变当前 SQL 编辑模式和用户输入。
  const helpType = type === "xml" ? "xml" : "raw";
  els.sqlHelpContent.textContent = sqlHelpText[helpType];
  els.rawSqlHelpBtn.classList.toggle("active", helpType === "raw");
  els.xmlSqlHelpBtn.classList.toggle("active", helpType === "xml");
}

function sqlResultCacheKey(api) {
  // SQL 结果缓存按 API 名称隔离，用于刷新页面后保留 rows 字段提示。
  const name = String(api && api.name || "").trim();
  return name ? `${sqlResultCachePrefix}${encodeURIComponent(name)}` : null;
}

function loadCachedSqlResult(api) {
  const key = sqlResultCacheKey(api);
  if (!key) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    // 名称不一致时丢弃缓存，避免重名变更或旧数据污染当前编辑器。
    if (!cached || cached.apiName !== String(api.name || "").trim()) return null;
    return cached;
  } catch (error) {
    return null;
  }
}

function saveCachedSqlResult(api, result) {
  const key = sqlResultCacheKey(api);
  if (!key) return;
  // 只缓存前 50 行，字段补全足够使用，同时避免 localStorage 写入过大。
  const rows = Array.isArray(result.rows) ? result.rows.slice(0, 50) : [];
  const cache = {
    apiName: String(api.name || "").trim(),
    apiId: api.id || null,
    path: api.path || "",
    method: api.method || "",
    params: result.params || {},
    total: Number(result.total || 0),
    rowFields: Array.isArray(result.rowFields) ? result.rowFields : [],
    rows,
    updatedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch (error) {
    showStatus(`SQL 结果缓存失败: ${error.message}`);
  }
}

function applyCachedSqlResult(api) {
  const cached = loadCachedSqlResult(api);
  if (!cached) {
    updateRowFields([]);
    showLog("等待执行 SQL");
    return;
  }

  const fields = Array.isArray(cached.rowFields) && cached.rowFields.length > 0
    ? cached.rowFields
    : collectRowFields(cached.rows || []);
  // 缓存字段会驱动 JS 编辑器中 row/rows 的属性提示。
  updateRowFields(fields);
  showLog({
    cached: true,
    updatedAt: cached.updatedAt,
    apiName: cached.apiName,
    params: cached.params,
    total: cached.total,
    rowFields: fields,
    rows: cached.rows
  });
}

function formatStatus(status) {
  const map = {
    draft: "草稿",
    published: "已发布",
    disabled: "已停用"
  };
  return map[status] || status || "草稿";
}

function parseJsonEditor(editor, fallback) {
  const text = editor.getValue().trim();
  if (!text) return fallback;
  return JSON.parse(text);
}

function validateParamsEditor() {
  // 参数编辑器实时校验 JSON 合法性，并要求顶层必须是对象。
  try {
    const params = parseJsonEditor(state.editors.params, {});
    const valid = params && typeof params === "object" && !Array.isArray(params);
    return {
      valid,
      error: valid ? "" : "params 必须是 JSON 对象"
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

function updateParamsEditorValidity() {
  const result = validateParamsEditor();
  const wrapper = state.editors.params.getWrapperElement();
  wrapper.classList.toggle("CodeMirror-invalid", !result.valid);
  wrapper.title = result.valid ? "" : `示例参数 JSON 无效: ${result.error}`;
  return result.valid;
}

function readParamsEditor() {
  const params = parseJsonEditor(state.editors.params, {});
  // 示例参数必须是对象，因为后端会把它作为 SQL 命名参数来源。
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("params 必须是 JSON 对象");
  }
  return params;
}

function detectSqlMode(sql) {
  // SQL 模式只影响编辑器提示；后端执行时仍会自动识别纯 SQL 或 MyBatis XML。
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<\s*(mapper|select)\b/i.test(String(sql || ""))
    ? "xml"
    : "sql";
}

function applySqlMode(api) {
  // 新数据使用后端保存的 sqlMode；旧数据没有该字段时才按内容自动识别。
  els.sqlModeInput.value = api.sqlMode === "xml" || api.sqlMode === "sql"
    ? api.sqlMode
    : detectSqlMode(api.sqlText || "");
  applySqlEditorMode();
}

function getDefaultDatabaseAlias() {
  return state.defaultDatabaseAlias || state.databaseSources[0]?.alias || "default";
}

function renderDatabaseOptions(selectedAlias) {
  // 数据源列表来自后端脱敏配置，API 只保存 alias，不保存连接密码。
  const selected = selectedAlias || getDefaultDatabaseAlias();
  const sources = state.databaseSources.length > 0
    ? state.databaseSources
    : [{ alias: selected, type: "mysql", label: `${selected} (mysql)` }];
  els.databaseAliasInput.innerHTML = "";
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source.alias;
    option.textContent = source.label || `${source.alias} (${source.type})`;
    els.databaseAliasInput.appendChild(option);
  }
  els.databaseAliasInput.value = sources.some((source) => source.alias === selected) ? selected : getDefaultDatabaseAlias();
}

function collectRowFields(rows) {
  // 根据 SQL 结果行推断字段，用于 JS 编辑器的 rows[0].xxx 补全。
  const fields = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields].sort();
}

function updateRowFields(fields) {
  state.rowFields = fields;
  els.rowFieldsInfo.textContent = `rows: ${fields.length} 个字段`;
}

function getParamFields() {
  try {
    return Object.keys(readParamsEditor()).sort();
  } catch (error) {
    return [];
  }
}

function isIdentifierStart(char) {
  return /[a-zA-Z_$]/.test(char || "");
}

function isIdentifierPart(char) {
  return /[a-zA-Z0-9_$]/.test(char || "");
}

function isKeywordAt(code, index, keyword) {
  const before = code[index - 1];
  const after = code[index + keyword.length];
  return code.slice(index, index + keyword.length) === keyword
    && !isIdentifierPart(before)
    && !isIdentifierPart(after);
}

function skipQuoted(code, index, quote) {
  let i = index + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
      continue;
    }
    if (code[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipLineComment(code, index) {
  let i = index + 2;
  while (i < code.length && code[i] !== "\n") i += 1;
  return i;
}

function skipBlockComment(code, index) {
  const end = code.indexOf("*/", index + 2);
  return end === -1 ? code.length : end + 2;
}

function skipIgnored(code, index) {
  // 对象补全扫描器需要跳过空白和注释，避免把注释里的代码当成真实声明。
  let i = index;
  while (i < code.length) {
    if (/\s/.test(code[i])) {
      i += 1;
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    break;
  }
  return i;
}

function readIdentifier(code, index) {
  if (!isIdentifierStart(code[index])) return null;
  let i = index + 1;
  while (isIdentifierPart(code[i])) i += 1;
  return {
    name: code.slice(index, i),
    end: i
  };
}

function readStringKey(code, index) {
  const quote = code[index];
  let i = index + 1;
  let value = "";
  while (i < code.length) {
    if (code[i] === "\\") {
      if (i + 1 < code.length) value += code[i + 1];
      i += 2;
      continue;
    }
    if (code[i] === quote) {
      return {
        name: value,
        end: i + 1
      };
    }
    value += code[i];
    i += 1;
  }
  return null;
}

function skipNested(code, index, open, close) {
  // 跳过成对括号内容，防止对象属性值中的数组/函数/对象打断外层解析。
  let i = index + 1;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    i += 1;
  }
  return i;
}

function skipObjectValue(code, index) {
  let i = index;
  while (i < code.length) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    if (char === "{") {
      i = skipNested(code, i, "{", "}");
      continue;
    }
    if (char === "[") {
      i = skipNested(code, i, "[", "]");
      continue;
    }
    if (char === "(") {
      i = skipNested(code, i, "(", ")");
      continue;
    }
    if (char === "," || char === "}") break;
    i += 1;
  }
  return i;
}

function parseObjectLiteral(code, index) {
  // 轻量解析对象字面量，只记录属性名和嵌套对象，不求值也不执行代码。
  const node = { properties: {} };
  let i = index + 1;

  while (i < code.length) {
    i = skipIgnored(code, i);
    if (code[i] === "}") {
      return {
        node,
        end: i + 1
      };
    }

    if (code[i] === "." && code[i + 1] === "." && code[i + 2] === ".") {
      i = skipObjectValue(code, i + 3);
    } else {
      let key = null;
      if (code[i] === "\"" || code[i] === "'") {
        key = readStringKey(code, i);
      } else {
        key = readIdentifier(code, i);
      }

      if (!key) {
        i = skipObjectValue(code, i);
      } else {
        i = skipIgnored(code, key.end);
        if (code[i] === ":") {
          i = skipIgnored(code, i + 1);
          if (code[i] === "{") {
            const child = parseObjectLiteral(code, i);
            node.properties[key.name] = child.node;
            i = child.end;
          } else {
            node.properties[key.name] = null;
            i = skipObjectValue(code, i);
          }
        } else {
          node.properties[key.name] = null;
          if (code[i] === "(") i = skipNested(code, i, "(", ")");
          i = skipObjectValue(code, i);
        }
      }
    }

    i = skipIgnored(code, i);
    if (code[i] === ",") i += 1;
  }

  return {
    node,
    end: i
  };
}

function collectObjectLiteralVariables(code) {
  // 收集光标前 const/let/var name = { ... }，为 name.xxx 提供本地属性提示。
  const variables = {};
  let i = 0;

  while (i < code.length) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }

    const keyword = ["const", "let", "var"].find((item) => isKeywordAt(code, i, item));
    if (!keyword) {
      i += 1;
      continue;
    }

    i += keyword.length;
    while (i < code.length) {
      i = skipIgnored(code, i);
      const variable = readIdentifier(code, i);
      if (!variable) break;
      i = skipIgnored(code, variable.end);
      if (code[i] === "=") {
        i = skipIgnored(code, i + 1);
        if (code[i] === "{") {
          const parsed = parseObjectLiteral(code, i);
          variables[variable.name] = parsed.node;
          i = parsed.end;
        } else {
          i = skipObjectValue(code, i);
        }
      }
      i = skipIgnored(code, i);
      if (code[i] !== ",") break;
      i += 1;
    }
  }

  return variables;
}

function resolveObjectPath(variables, objectPath) {
  // 支持 obj.child.deep 这种嵌套路径，找不到时交给 CodeMirror 原生补全。
  const parts = objectPath.split(".");
  let node = variables[parts[0]];
  for (const part of parts.slice(1)) {
    if (!node || !node.properties || !node.properties[part]) return null;
    node = node.properties[part];
  }
  return node;
}

function localObjectPropertyHint(editor, cursor, line) {
  // 当光标位于 obj. 或 obj.prefix 后面时，返回对象字面量中的属性列表。
  const propertyMatch = line.match(/([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)?$/);
  if (!propertyMatch) return null;

  const objectPath = propertyMatch[1];
  const prefix = propertyMatch[2] || "";
  const codeBeforeCursor = editor.getRange(CodeMirror.Pos(0, 0), cursor);
  const variables = collectObjectLiteralVariables(codeBeforeCursor);
  const objectNode = resolveObjectPath(variables, objectPath);
  if (!objectNode) return null;

  return {
    list: Object.keys(objectNode.properties).filter((field) => field.startsWith(prefix)).sort(),
    from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
    to: cursor
  };
}

async function request(path, options = {}) {
  // 管理端接口统一使用 { code, message, data }，这里拆出 data 并抛出错误信息。
  const requestPath = path.startsWith("/") ? `${appBasePath}${path}` : path;
  const response = await fetch(requestPath || path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.message || `request failed: ${response.status}`);
  }
  return data.data;
}

function createCodeMirror(input, options) {
  // 所有编辑器共用基础快捷键和样式，具体语言配置由调用方覆盖。
  const extraKeys = {
    Tab: (editor) => {
      if (editor.somethingSelected()) {
        editor.indentSelection("add");
        return;
      }
      editor.replaceSelection("  ", "end");
    },
    "Shift-Tab": (editor) => editor.indentSelection("subtract"),
    "Ctrl-Space": (editor) => editor.showHint(),
    ...(options.extraKeys || {})
  };

  return CodeMirror.fromTextArea(input, {
    theme: "eclipse",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    smartIndent: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    viewportMargin: Infinity,
    ...options,
    extraKeys
  });
}

function registerSqlParamMode() {
  // MySQL mode 会把 # 当成注释开头；这里先识别 #{param}，再交回原生 MySQL 高亮。
  CodeMirror.defineMode("ssql-mysql", (config) => {
    const baseMode = CodeMirror.getMode(config, "text/x-mysql");
    const paramPattern = /^#\{\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s*,[^}]*)?\s*\}/;
    const isBaseTokenizer = (state) => state.base && state.base.tokenize && state.base.tokenize.name === "tokenBase";

    return {
      startState: () => ({
        base: CodeMirror.startState(baseMode)
      }),
      copyState: (state) => ({
        base: CodeMirror.copyState(baseMode, state.base)
      }),
      token: (stream, state) => {
        if (isBaseTokenizer(state) && stream.match(paramPattern)) return "variable-3 ssql-param";
        return baseMode.token(stream, state.base);
      },
      indent: (state, textAfter) => baseMode.indent ? baseMode.indent(state.base, textAfter) : CodeMirror.Pass,
      blockCommentStart: baseMode.blockCommentStart,
      blockCommentEnd: baseMode.blockCommentEnd,
      lineComment: baseMode.lineComment,
      closeBrackets: baseMode.closeBrackets
    };
  });

  CodeMirror.defineMode("ssql-mybatis-xml", () => {
    const sqlKeywords = /^(select|from|where|and|or|inner|left|right|join|on|group|by|order|having|limit|top|with|as|case|when|then|else|end|in|is|null|not|like|between|exists|desc|show)\b/i;
    const paramPattern = /^#\{\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s*,[^}]*)?\s*\}/;

    return {
      startState: () => ({
        inTag: false,
        inComment: false,
        inCdata: false
      }),
      copyState: (state) => ({ ...state }),
      token: (stream, state) => {
        if (state.inComment) {
          if (stream.skipTo("-->")) {
            stream.match("-->");
            state.inComment = false;
          } else {
            stream.skipToEnd();
          }
          return "comment";
        }

        if (state.inCdata) {
          if (stream.skipTo("]]>")) {
            stream.match("]]>");
            state.inCdata = false;
          } else {
            stream.skipToEnd();
          }
          return null;
        }

        if (stream.match(paramPattern)) return "variable-3 ssql-param";

        if (state.inTag) {
          if (stream.match(/^\s+/)) return null;
          if (stream.match(/^\/?>/)) {
            state.inTag = false;
            return "tag bracket";
          }
          if (stream.match(/^[a-zA-Z_:][a-zA-Z0-9_:.-]*(?=\s*=)/)) return "attribute";
          if (stream.match(/^=/)) return "operator";
          if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
          stream.next();
          return "tag";
        }

        if (stream.match(/^<!--/)) {
          state.inComment = true;
          return "comment";
        }
        if (stream.match(/^<!\[CDATA\[/)) {
          state.inCdata = true;
          return "meta";
        }
        if (stream.match(/^<\/?\s*[a-zA-Z][a-zA-Z0-9_:-]*/)) {
          state.inTag = true;
          return "tag";
        }
        if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
        if (stream.match(/^-?\d+(?:\.\d+)?\b/)) return "number";
        if (stream.match(sqlKeywords)) return "keyword";
        stream.next();
        return null;
      }
    };
  });
}

function applySqlEditorMode() {
  if (!state.editors.sql) return;
  state.editors.sql.setOption("mode", els.sqlModeInput.value === "xml" ? "ssql-mybatis-xml" : "ssql-mysql");
  state.editors.sql.refresh();
}

function customFieldHint(editor) {
  // JS 编辑器补全顺序：SQL 行字段、示例参数、本地对象字面量、运行时全局变量、原生提示。
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line).slice(0, cursor.ch);
  const rowMatch = line.match(/(?:rows\s*\[\s*\d+\s*\]|row)\.([a-zA-Z0-9_]*)$/);
  const paramsMatch = line.match(/params\.([a-zA-Z0-9_]*)$/);
  const wordMatch = line.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);

  if (rowMatch) {
    const prefix = rowMatch[1];
    const list = state.rowFields.filter((field) => field.startsWith(prefix));
    return {
      list,
      from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
      to: cursor
    };
  }

  if (paramsMatch) {
    const prefix = paramsMatch[1];
    const list = getParamFields().filter((field) => field.startsWith(prefix));
    return {
      list,
      from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
      to: cursor
    };
  }

  const objectHint = localObjectPropertyHint(editor, cursor, line);
  if (objectHint) return objectHint;

  if (wordMatch) {
    const prefix = wordMatch[1];
    const globals = ["params", "rows", "resultSets", "row", "headers", "context", "callApi"];
    const list = globals.filter((item) => item.startsWith(prefix));
    if (list.length > 0) {
      return {
        list,
        from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
        to: cursor
      };
    }
  }

  return CodeMirror.hint.javascript(editor);
}

function maybeShowScriptHint(editor, change) {
  // 输入标识符字符时自动弹出提示；点号由 extraKeys 单独处理。
  const text = change.text.join("");
  if (!/^[a-zA-Z0-9_$]$/.test(text)) return;
  if (editor.state.completionActive) return;
  setTimeout(() => editor.showHint({ completeSingle: false }), 0);
}

function syncCurrentScriptDraft() {
  if (!state.editors.script) return;
  state.scriptDrafts[state.scriptType] = state.editors.script.getValue();
}

function setScriptType(type) {
  syncCurrentScriptDraft();
  state.scriptType = type === "params" ? "params" : "result";
  els.scriptTypeInput.value = state.scriptType;
  state.editors.script.setValue(state.scriptDrafts[state.scriptType] || "");
  state.editors.script.refresh();
}

function setupEditors() {
  // 三个 textarea 替换为 CodeMirror，并分别启用 JSON、SQL、JavaScript 模式。
  registerSqlParamMode();

  state.editors.params = createCodeMirror(els.paramsInput, {
    mode: {
      name: "javascript",
      json: true
    }
  });
  state.editors.params.on("change", () => updateParamsEditorValidity());

  state.editors.sql = createCodeMirror(els.sqlInput, {
    mode: "ssql-mysql",
    hintOptions: {
      disableKeywords: false
    }
  });
  els.sqlModeInput.addEventListener("change", () => {
    applySqlEditorMode();
    showStatus(els.sqlModeInput.value === "xml" ? "SQL 输入模式: MyBatis XML" : "SQL 输入模式: 原生 SQL");
  });

  state.editors.script = createCodeMirror(els.scriptInput, {
    mode: "javascript",
    hintOptions: {
      hint: customFieldHint
    },
    extraKeys: {
      ".": (editor) => {
        editor.replaceSelection(".", "end");
        setTimeout(() => editor.showHint({ completeSingle: false }), 0);
      }
    }
  });
  state.editors.script.on("inputRead", maybeShowScriptHint);
  els.scriptTypeInput.addEventListener("change", () => {
    setScriptType(els.scriptTypeInput.value);
    showStatus(state.scriptType === "params" ? "JS 处理类型: 参数处理" : "JS 处理类型: 结果集处理");
  });
  updateParamsEditorValidity();
}

function readForm() {
  // 保存前从普通输入框和 CodeMirror 中读取完整 API 定义。
  syncCurrentScriptDraft();
  return {
    name: els.nameInput.value.trim(),
    path: els.pathInput.value.trim(),
    method: els.methodInput.value,
    databaseAlias: els.databaseAliasInput.value || getDefaultDatabaseAlias(),
    description: els.descriptionInput.value.trim(),
    testParams: readParamsEditor(),
    sqlMode: els.sqlModeInput.value,
    sqlText: state.editors.sql.getValue(),
    paramScriptText: state.scriptDrafts.params,
    scriptText: state.scriptDrafts.result
  };
}

function fillForm(api, options = {}) {
  // 切换 API 或保存后，用服务端返回的数据回填表单，保持前后端状态一致。
  const previousApiId = state.current && state.current.id;
  const previousScriptType = state.scriptType;
  const keepScriptType = Boolean(options.keepScriptType) || Boolean(previousApiId && api.id && previousApiId === api.id);
  state.current = api;
  els.pageTitle.textContent = api.id ? api.name || "未命名 API" : "新建 API";
  els.statusText.textContent = api.id ? `${api.method} ${api.path} · ${api.status}` : "填写配置后保存";
  els.statusBadge.textContent = formatStatus(api.status);
  els.statusBadge.className = `status-badge status-${api.status || "draft"}`;
  els.nameInput.value = api.name || "";
  els.pathInput.value = api.path || "/api/";
  els.methodInput.value = api.method || "GET";
  renderDatabaseOptions(api.databaseAlias || getDefaultDatabaseAlias());
  els.descriptionInput.value = api.description || "";
  state.editors.params.setValue(JSON.stringify(api.testParams || {}, null, 2));
  state.editors.sql.setValue(api.sqlText || "");
  applySqlMode(api);
  state.scriptDrafts = {
    params: api.paramScriptText ?? defaultParamScript,
    result: api.scriptText || defaultResultScript
  };
  state.scriptType = keepScriptType && previousScriptType === "params" ? "params" : "result";
  els.scriptTypeInput.value = state.scriptType;
  state.editors.script.setValue(state.scriptDrafts[state.scriptType]);
  state.editors.params.refresh();
  state.editors.sql.refresh();
  state.editors.script.refresh();
  applyCachedSqlResult(api);
}

function renderList() {
  // 左侧列表只渲染当前分页数据，点击条目后加载完整 API 配置。
  els.apiList.innerHTML = "";
  if (state.apis.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的 API";
    els.apiList.appendChild(empty);
  }
  for (const api of state.apis) {
    const active = state.current && state.current.id === api.id;
    const item = document.createElement("div");
    item.className = `api-item${active ? " active" : ""}`;
    const meta = document.createElement("div");
    meta.className = "api-item-meta";
    const method = document.createElement("span");
    method.className = "method-badge";
    method.textContent = api.method || "GET";
    const status = document.createElement("span");
    status.className = `status-dot status-${api.status || "draft"}`;
    status.textContent = formatStatus(api.status);
    meta.append(method, status);

    const name = document.createElement("strong");
    name.textContent = api.name || "未命名 API";

    const path = document.createElement("span");
    path.className = "api-path";
    path.textContent = api.path || "/api/";

    const children = [meta, name, path];
    if (active) {
      const description = document.createElement("span");
      description.className = "api-description";
      description.textContent = api.description || "暂无说明";
      children.push(description);
    }

    item.append(...children);
    item.addEventListener("click", () => loadApi(api.id));
    els.apiList.appendChild(item);
  }
  els.pageInfo.textContent = `${state.list.page} / ${state.list.totalPages} · 共 ${state.list.total}`;
  els.prevPageBtn.disabled = state.list.page <= 1;
  els.nextPageBtn.disabled = state.list.page >= state.list.totalPages;
}

function buildApiListPath() {
  // 把列表筛选和分页状态序列化成管理端查询参数。
  const params = new URLSearchParams({
    page: String(state.list.page),
    pageSize: String(state.list.pageSize)
  });
  if (state.list.name) params.set("name", state.list.name);
  if (state.list.sql) params.set("sql", state.list.sql);
  return `/admin/apis?${params.toString()}`;
}

async function loadApis(options = {}) {
  // 兼容早期数组返回和当前分页对象返回，便于后端接口平滑演进。
  const data = await request(buildApiListPath());
  if (Array.isArray(data)) {
    state.apis = data;
    state.list.total = data.length;
    state.list.page = 1;
    state.list.totalPages = 1;
  } else {
    state.apis = Array.isArray(data.items) ? data.items : [];
    state.list.total = Number(data.total || 0);
    state.list.page = Number(data.page || state.list.page);
    state.list.pageSize = Number(data.pageSize || state.list.pageSize);
    state.list.totalPages = Number(data.totalPages || 1);
  }
  renderList();
  if ((options.selectFirst || !state.current) && state.apis.length > 0) {
    await loadApi(state.apis[0].id);
  }
}

async function loadApi(id) {
  const api = await request(`/admin/apis/${id}`);
  fillForm(api);
  renderList();
}

async function loadDatabaseSources() {
  const data = await request("/admin/database-sources");
  state.defaultDatabaseAlias = data.defaultAlias || "default";
  state.databaseSources = Array.isArray(data.items) ? data.items : [];
  renderDatabaseOptions(state.current?.databaseAlias || state.defaultDatabaseAlias);
}

async function saveApi() {
  // 已有 id 时更新，否则创建新 API；保存后刷新列表以同步排序和分页信息。
  const payload = readForm();
  const api = state.current && state.current.id
    ? await request(`/admin/apis/${state.current.id}`, { method: "PUT", body: JSON.stringify(payload) })
    : await request("/admin/apis", { method: "POST", body: JSON.stringify(payload) });
  fillForm(api, { keepScriptType: true });
  await loadApis();
  showStatus(`已保存 · ${api.method} ${api.path} · ${api.status}`);
  return api;
}

async function runSql() {
  // 执行 SQL 前先保存当前 API，确保后端测试使用的是最新配置。
  let params = {};
  try {
    params = readParamsEditor();
  } catch (error) {
    showStatus(`示例参数 JSON 无效: ${error.message}`);
    return;
  }

  const api = await saveApi();
  showLog("SQL 执行中...");
  const data = await request(`/admin/apis/${api.id}/test-sql`, {
    method: "POST",
    body: JSON.stringify({ params })
  });
  const fields = Array.isArray(data.fields) && data.fields.length > 0
    ? [...new Set(data.fields)].sort()
    : collectRowFields(data.rows || []);
  updateRowFields(fields);
  const logData = {
    params: data.params,
    processedParams: data.processedParams,
    paramScriptResult: data.paramScriptResult,
    directReturn: Boolean(data.directReturn),
    total: data.total,
    rowFields: fields,
    rows: data.rows,
    resultSets: data.resultSets || []
  };
  saveCachedSqlResult(api, logData);
  showLog(logData);
  if (data.directReturn) {
    showStatus("参数处理脚本已直接返回，未执行 SQL");
  } else {
    showStatus(`SQL 执行完成 · ${data.total} 行 · rows ${fields.length} 个字段`);
  }
}

async function publishApi() {
  // 发布会先保存草稿，再切换状态，避免遗漏编辑器中的未保存修改。
  const api = await saveApi();
  const published = await request(`/admin/apis/${api.id}/publish`, { method: "POST", body: "{}" });
  fillForm(published);
  await loadApis();
  showStatus(`已发布 · ${published.method} ${published.path}`);
}

async function disableApi() {
  if (!state.current || !state.current.id) return;
  const api = await request(`/admin/apis/${state.current.id}/disable`, { method: "POST", body: "{}" });
  fillForm(api);
  await loadApis();
  showStatus(`已停用 · ${api.method} ${api.path}`);
}

function bind(id, fn) {
  // 所有按钮操作统一捕获错误并显示到顶部状态区。
  id.addEventListener("click", async () => {
    try {
      await fn();
    } catch (error) {
      showStatus(`操作失败: ${error.message}`);
    }
  });
}

function setupHelp() {
  setSqlHelpType("raw");
  els.sqlHelpBtn.addEventListener("click", () => {
    els.sqlHelpBox.classList.toggle("hidden");
  });
  els.sqlHelpCloseBtn.addEventListener("click", () => {
    els.sqlHelpBox.classList.add("hidden");
  });
  els.rawSqlHelpBtn.addEventListener("click", () => setSqlHelpType("raw"));
  els.xmlSqlHelpBtn.addEventListener("click", () => setSqlHelpType("xml"));
  els.scriptHelpBtn.addEventListener("click", () => {
    els.scriptHelpBox.classList.toggle("hidden");
  });
  els.scriptHelpCloseBtn.addEventListener("click", () => {
    els.scriptHelpBox.classList.add("hidden");
  });
}

els.newApiBtn.addEventListener("click", () => {
  fillForm({
    name: "",
    path: "/api/",
    method: "GET",
    databaseAlias: getDefaultDatabaseAlias(),
    status: "draft",
    testParams: {},
    sqlMode: "sql",
    sqlText: "",
    paramScriptText: defaultParamScript,
    scriptText: defaultResultScript
  });
  renderList();
});

els.apiSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.list.name = els.nameSearchInput.value.trim();
  state.list.sql = els.sqlSearchInput.value.trim();
  state.list.pageSize = Number(els.pageSizeInput.value) || 20;
  state.list.page = 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

els.resetSearchBtn.addEventListener("click", async () => {
  els.nameSearchInput.value = "";
  els.sqlSearchInput.value = "";
  els.pageSizeInput.value = "20";
  state.list.name = "";
  state.list.sql = "";
  state.list.pageSize = 20;
  state.list.page = 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

els.pageSizeInput.addEventListener("change", async () => {
  state.list.pageSize = Number(els.pageSizeInput.value) || 20;
  state.list.page = 1;
  await loadApis({ selectFirst: true });
});

els.prevPageBtn.addEventListener("click", async () => {
  if (state.list.page <= 1) return;
  state.list.page -= 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

els.nextPageBtn.addEventListener("click", async () => {
  if (state.list.page >= state.list.totalPages) return;
  state.list.page += 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

setupEditors();
setupHelp();

bind(els.saveBtn, saveApi);
bind(els.publishBtn, publishApi);
bind(els.disableBtn, disableApi);
bind(els.runSqlBtn, runSql);

loadDatabaseSources()
  .then(() => loadApis())
  .catch((error) => showStatus(`加载失败: ${error.message}`));
