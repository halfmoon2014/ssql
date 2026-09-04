const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const supportedDatabaseTypes = new Set(["mysql", "mssql"]);

function stripJsonc(text) {
  // JSONC 支持注释和尾逗号；这里用状态机处理，避免误删字符串里的 // 或 /*。
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) {
        output += text[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      index += 1;
      continue;
    }

    output += char;
  }
  return output;
}

function removeJsonTrailingCommas(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }

    if (char === ",") {
      let nextIndex = index + 1;
      while (/\s/.test(text[nextIndex] || "")) nextIndex += 1;
      if (text[nextIndex] === "}" || text[nextIndex] === "]") continue;
    }

    output += char;
  }
  return output;
}

function parseJsonc(text) {
  return JSON.parse(removeJsonTrailingCommas(stripJsonc(text)));
}

// 配置文件不存在时允许用默认值启动，便于本地开发和首次部署。
function readJson(filePath, fallback, options = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  const text = fs.readFileSync(filePath, "utf8");
  return options.jsonc ? parseJsonc(text) : JSON.parse(text);
}

function readAppConfig(fallback) {
  const jsoncPath = path.join(rootDir, "app.config.jsonc");
  const legacyJsonPath = path.join(rootDir, "app.config.json");
  if (fs.existsSync(jsoncPath)) return readJson(jsoncPath, fallback, { jsonc: true });
  return readJson(legacyJsonPath, fallback);
}

function normalizeDataSource(alias, source) {
  // 数据源对外用 alias 定位，type 决定 SQL 占位符和底层驱动。
  const databaseAlias = String(source.alias || alias || "default").trim();
  const type = String(source.type || source.driver || "mysql").trim().toLowerCase();
  if (!databaseAlias) throw new Error("database alias is required");
  if (!supportedDatabaseTypes.has(type)) throw new Error(`unsupported database type: ${type}`);
  return {
    ...source,
    alias: databaseAlias,
    type,
    host: source.host || source.server,
    server: source.server || source.host
  };
}

function collectDataSources(databaseConfig) {
  const sources = [];

  if (Array.isArray(databaseConfig.connections)) {
    for (const source of databaseConfig.connections) {
      sources.push(normalizeDataSource(source.alias, source));
    }
  }

  if (databaseConfig.sources && typeof databaseConfig.sources === "object" && !Array.isArray(databaseConfig.sources)) {
    for (const [alias, source] of Object.entries(databaseConfig.sources)) {
      sources.push(normalizeDataSource(alias, source));
    }
  }

  if (databaseConfig.mysql) {
    const mysqlAlias = databaseConfig.mysql.alias || databaseConfig.defaultAlias || "default";
    sources.push(normalizeDataSource(mysqlAlias, { ...databaseConfig.mysql, type: "mysql" }));
  }

  if (databaseConfig.type) {
    sources.push(normalizeDataSource(databaseConfig.alias || databaseConfig.defaultAlias || "default", databaseConfig));
  }

  const deduped = new Map();
  for (const source of sources) deduped.set(source.alias, source);
  return [...deduped.values()];
}

function normalizeDatabaseConfig(databaseConfig) {
  // 兼容旧结构 { mysql: {...} }，新结构推荐使用 { defaultAlias, connections: [...] }。
  const sources = collectDataSources(databaseConfig);
  const defaultAlias = String(databaseConfig.defaultAlias || databaseConfig.default || sources[0]?.alias || "default");
  const sourceMap = Object.fromEntries(sources.map((source) => [source.alias, source]));
  const metadata = databaseConfig.metadata || databaseConfig.store || databaseConfig.mysql || sources.find((source) => source.type === "mysql");
  return {
    ...databaseConfig,
    defaultAlias,
    sources,
    sourceMap,
    mysql: metadata ? normalizeDataSource(metadata.alias || "metadata", { ...metadata, type: "mysql" }) : null
  };
}

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  const number = value === undefined || value === "" ? Number(fallback) : Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} config must be number`);
  return number;
}

function stringFromEnv(name, fallback) {
  const value = process.env[name];
  const output = value === undefined || value === "" ? fallback : value;
  if (typeof output !== "string" || !output.trim()) throw new Error(`${name} config is required`);
  return output;
}

function booleanFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return Boolean(fallback);
  return value === "1" || value.toLowerCase() === "true";
}

function listFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") return Array.isArray(fallback) ? fallback : [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function resolveProjectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("config path is required");
  return path.isAbsolute(raw) ? raw : path.join(rootDir, raw);
}

function normalizeAppConfig(appConfig) {
  // 运行配置来自 app.config.jsonc；环境变量只作为部署时覆盖入口，不再承载默认值。
  const server = appConfig.server || {};
  const paths = appConfig.paths || {};
  const timeouts = appConfig.timeouts || {};
  const runtime = appConfig.runtime || {};
  const fileCapabilities = (appConfig.capabilities && appConfig.capabilities.files) || {};

  return {
    port: numberFromEnv("PORT", server.port),
    host: stringFromEnv("HOST", server.host),
    dataDir: resolveProjectPath(paths.dataDir),
    publicDir: resolveProjectPath(paths.publicDir),
    scriptTimeoutMs: numberFromEnv("SCRIPT_TIMEOUT_MS", timeouts.scriptMs),
    sqlTimeoutMs: numberFromEnv("SQL_TIMEOUT_MS", timeouts.sqlMs),
    maxCallDepth: numberFromEnv("MAX_CALL_DEPTH", runtime.maxCallDepth),
    scriptWorker: {
      // Worker 内存限制保护主进程；默认值保持偏保守，可按部署规模在配置文件或环境变量中调整。
      maxOldGenerationSizeMb: numberFromEnv("SCRIPT_WORKER_MAX_OLD_MB", runtime.scriptWorker?.maxOldGenerationSizeMb || 32),
      maxYoungGenerationSizeMb: numberFromEnv("SCRIPT_WORKER_MAX_YOUNG_MB", runtime.scriptWorker?.maxYoungGenerationSizeMb || 8)
    },
    capabilities: {
      files: {
        tempDir: resolveProjectPath(stringFromEnv("FILE_CAPABILITY_TEMP_DIR", fileCapabilities.tempDir)),
        maxBytes: numberFromEnv("FILE_CAPABILITY_MAX_BYTES", fileCapabilities.maxBytes),
        timeoutMs: numberFromEnv("FILE_CAPABILITY_TIMEOUT_MS", fileCapabilities.timeoutMs),
        maxRedirects: numberFromEnv("FILE_CAPABILITY_MAX_REDIRECTS", fileCapabilities.maxRedirects),
        allowedProtocols: listFromEnv("FILE_CAPABILITY_ALLOWED_PROTOCOLS", fileCapabilities.allowedProtocols),
        allowedHosts: listFromEnv("FILE_CAPABILITY_ALLOWED_HOSTS", fileCapabilities.allowedHosts)
          .map((item) => item.toLowerCase()),
        allowPrivateNetwork: booleanFromEnv("FILE_CAPABILITY_ALLOW_PRIVATE_NETWORK", fileCapabilities.allowPrivateNetwork)
      }
    }
  };
}

// 集中读取运行配置，业务模块只依赖这里返回的结构。
function loadConfig() {
  const appConfig = normalizeAppConfig(readAppConfig({}));
  const databaseConfig = normalizeDatabaseConfig(readJson(path.join(rootDir, "database.config.json"), {}));
  return {
    ...appConfig,
    rootDir,
    database: databaseConfig
  };
}

module.exports = {
  loadConfig,
  parseJsonc,
  normalizeAppConfig,
  normalizeDatabaseConfig
};
