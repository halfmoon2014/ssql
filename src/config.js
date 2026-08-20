const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const supportedDatabaseTypes = new Set(["mysql", "mssql"]);

// 配置文件不存在时允许用默认值启动，便于本地开发和首次部署。
function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

// 集中读取运行配置，业务模块只依赖这里返回的结构。
function loadConfig() {
  const databaseConfig = normalizeDatabaseConfig(readJson(path.join(rootDir, "database.config.json"), {}));
  return {
    port: Number(process.env.PORT || 3010),
    host: process.env.HOST || "0.0.0.0",
    rootDir,
    dataDir: path.join(rootDir, "data"),
    publicDir: path.join(rootDir, "public"),
    database: databaseConfig,
    scriptTimeoutMs: Number(process.env.SCRIPT_TIMEOUT_MS || 1000),
    sqlTimeoutMs: Number(process.env.SQL_TIMEOUT_MS || 5000),
    maxCallDepth: Number(process.env.MAX_CALL_DEPTH || 5)
  };
}

module.exports = {
  loadConfig,
  normalizeDatabaseConfig
};
