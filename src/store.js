const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const mysql = require("mysql2/promise");
const { AppError } = require("./errors");
const { normalizeScriptCapabilities } = require("./capabilities");
const { formatChinaTime } = require("./time");

function now() {
  return formatChinaTime();
}

function toJson(value, fallback) {
  if (value === undefined || value === null) return JSON.stringify(fallback);
  return JSON.stringify(value);
}

function fromJson(value, fallback) {
  // MySQL longtext 字段保存 JSON；解析失败时回退，避免坏数据拖垮列表页。
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function escapeLike(value) {
  // 搜索条件使用 LIKE，需要转义通配符，防止用户输入改变匹配范围。
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function detectSqlMode(sqlText) {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<\s*(mapper|select)\b/i.test(String(sqlText || ""))
    ? "xml"
    : "sql";
}

function toMysqlConnectionOptions(source) {
  // alias/type/server/options 是数据源元信息，不传给 mysql2 连接层。
  const { alias, type, server, options, ...connectionOptions } = source;
  return connectionOptions;
}

function normalizeSqlMode(value, sqlText = "") {
  if (value === "sql" || value === "xml") return value;
  return detectSqlMode(sqlText);
}

class Store {
  constructor({ database, dataDir, logger = null }) {
    if (!database.mysql) throw new AppError(500, "metadata mysql config is missing");
    this.database = database.mysql;
    this.defaultDatabaseAlias = database.defaultAlias || "default";
    this.dataDir = dataDir;
    this.logger = logger;
    this.pool = mysql.createPool({
      ...toMysqlConnectionOptions(this.database),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }

  async init() {
    // 启动时保证表结构存在，并兼容早期 JSON 文件数据。
    await this.createTables();
    await this.migrateSchema();
    await this.migrateJsonApis();
  }

  async createTables() {
    // API 定义表存储配置本身，运行时按 path + method 查找已发布接口。
    await this.pool.execute(`
      create table if not exists ssql_api_definitions (
        id varchar(64) primary key,
        name varchar(100) not null,
        path varchar(255) not null,
        method varchar(20) not null,
        status varchar(20) not null default 'draft',
        description text,
        request_params longtext,
        test_params longtext,
        database_alias varchar(100) not null default 'default',
        sql_text mediumtext,
        sql_mode varchar(20) not null default 'sql',
        param_script_text mediumtext,
        script_text mediumtext,
        sql_timeout_ms int not null default 5000,
        script_timeout_ms int not null default 1000,
        script_capabilities longtext,
        deleted_at varchar(32) null,
        created_at varchar(32) not null,
        updated_at varchar(32) not null,
        index idx_ssql_api_path_method (path, method),
        index idx_ssql_api_status (status)
      )
    `);

    // 调用日志表记录主调用和 callApi 子调用，便于追踪链路和失败原因。
    await this.pool.execute(`
      create table if not exists ssql_api_call_logs (
        id varchar(64) primary key,
        request_id varchar(64) not null,
        parent_request_id varchar(64) null,
        api_id varchar(64) null,
        path varchar(255) not null,
        method varchar(20) not null,
        status_code int not null,
        duration_ms int not null,
        error_message text,
        call_chain longtext,
        created_at varchar(32) not null,
        index idx_ssql_log_request_id (request_id),
        index idx_ssql_log_api_id (api_id),
        index idx_ssql_log_created_at (created_at)
      )
    `);
  }

  async migrateSchema() {
    // 兼容旧版本表结构，新增字段只在缺失时执行 alter。
    const [sqlModeRows] = await this.pool.execute(
      `select count(*) as count
       from information_schema.columns
       where table_schema = ? and table_name = 'ssql_api_definitions' and column_name = 'sql_mode'`,
      [this.database.database]
    );
    if (Number(sqlModeRows[0].count) === 0) {
      await this.pool.execute("alter table ssql_api_definitions add column sql_mode varchar(20) not null default 'sql' after sql_text");
      const [apis] = await this.pool.execute("select id, sql_text from ssql_api_definitions");
      for (const api of apis) {
        const sqlMode = detectSqlMode(api.sql_text);
        if (sqlMode === "xml") {
          await this.pool.execute("update ssql_api_definitions set sql_mode = ? where id = ?", [sqlMode, api.id]);
        }
      }
      if (this.logger) this.logger.info("mysql schema migrated", { table: "ssql_api_definitions", column: "sql_mode" });
    }

    const [paramScriptRows] = await this.pool.execute(
      `select count(*) as count
       from information_schema.columns
       where table_schema = ? and table_name = 'ssql_api_definitions' and column_name = 'param_script_text'`,
      [this.database.database]
    );
    if (Number(paramScriptRows[0].count) === 0) {
      await this.pool.execute("alter table ssql_api_definitions add column param_script_text mediumtext after sql_mode");
      if (this.logger) this.logger.info("mysql schema migrated", { table: "ssql_api_definitions", column: "param_script_text" });
    }

    const [databaseAliasRows] = await this.pool.execute(
      `select count(*) as count
       from information_schema.columns
       where table_schema = ? and table_name = 'ssql_api_definitions' and column_name = 'database_alias'`,
      [this.database.database]
    );
    if (Number(databaseAliasRows[0].count) === 0) {
      await this.pool.execute("alter table ssql_api_definitions add column database_alias varchar(100) not null default 'default' after test_params");
      if (this.defaultDatabaseAlias !== "default") {
        await this.pool.execute("update ssql_api_definitions set database_alias = ? where database_alias = 'default'", [this.defaultDatabaseAlias]);
      }
      if (this.logger) this.logger.info("mysql schema migrated", { table: "ssql_api_definitions", column: "database_alias" });
    }

    const [scriptCapabilitiesRows] = await this.pool.execute(
      `select count(*) as count
       from information_schema.columns
       where table_schema = ? and table_name = 'ssql_api_definitions' and column_name = 'script_capabilities'`,
      [this.database.database]
    );
    if (Number(scriptCapabilitiesRows[0].count) === 0) {
      await this.pool.execute("alter table ssql_api_definitions add column script_capabilities longtext after script_timeout_ms");
      if (this.logger) this.logger.info("mysql schema migrated", { table: "ssql_api_definitions", column: "script_capabilities" });
    }

  }

  async migrateJsonApis() {
    // 只有 MySQL 定义表为空时才从旧 apis.json 迁移，避免覆盖线上数据。
    const [rows] = await this.pool.execute("select count(*) as count from ssql_api_definitions");
    if (Number(rows[0].count) > 0) return;

    const apisFile = path.join(this.dataDir, "apis.json");
    if (!fs.existsSync(apisFile)) return;

    const apis = JSON.parse(fs.readFileSync(apisFile, "utf8"));
    if (!Array.isArray(apis) || apis.length === 0) return;

    for (const api of apis) {
      await this.insertApi(this.normalizePayload(api, {
        id: api.id || randomUUID(),
        status: api.status || "draft",
        createdAt: api.createdAt || now()
      }));
    }

    if (this.logger) {
      this.logger.info("json api data migrated to mysql", { count: apis.length });
    }
  }

  mapApi(row) {
    // 数据库字段使用 snake_case，前端和运行时统一消费 camelCase。
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      method: row.method,
      status: row.status,
      description: row.description || "",
      requestParams: fromJson(row.request_params, []),
      testParams: fromJson(row.test_params, {}),
      databaseAlias: row.database_alias || this.defaultDatabaseAlias,
      sqlText: row.sql_text || "",
      sqlMode: normalizeSqlMode(row.sql_mode, row.sql_text || ""),
      paramScriptText: row.param_script_text || "",
      scriptText: row.script_text || "",
      sqlTimeoutMs: Number(row.sql_timeout_ms || 5000),
      scriptTimeoutMs: Number(row.script_timeout_ms || 1000),
      scriptCapabilities: normalizeScriptCapabilities(fromJson(row.script_capabilities, [])),
      deletedAt: row.deleted_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  mapLog(row) {
    // 日志中的 callChain 以 JSON 字符串保存，读取时恢复为数组。
    return {
      id: row.id,
      requestId: row.request_id,
      parentRequestId: row.parent_request_id || null,
      apiId: row.api_id || null,
      path: row.path,
      method: row.method,
      statusCode: Number(row.status_code),
      durationMs: Number(row.duration_ms),
      errorMessage: row.error_message || null,
      callChain: fromJson(row.call_chain, []),
      createdAt: row.created_at
    };
  }

  normalizePayload(payload, existing = {}) {
    // create/update 共用同一套校验和默认值，减少草稿与更新行为差异。
    const apiPath = String(payload.path || existing.path || "").trim();
    const method = String(payload.method || existing.method || "GET").trim().toUpperCase();
    const name = String(payload.name || existing.name || "").trim();

    if (!name) throw new AppError(400, "api name is required");
    if (!apiPath.startsWith("/api/")) throw new AppError(400, "api path must start with /api/");

    return {
      ...existing,
      id: existing.id || payload.id || randomUUID(),
      name,
      path: apiPath,
      method,
      status: payload.status || existing.status || "draft",
      description: String(payload.description || ""),
      requestParams: Array.isArray(payload.requestParams) ? payload.requestParams : existing.requestParams || [],
      testParams: payload.testParams && typeof payload.testParams === "object" ? payload.testParams : existing.testParams || {},
      databaseAlias: String(payload.databaseAlias || existing.databaseAlias || this.defaultDatabaseAlias).trim() || this.defaultDatabaseAlias,
      sqlText: String(payload.sqlText || existing.sqlText || ""),
      sqlMode: normalizeSqlMode(payload.sqlMode || existing.sqlMode, payload.sqlText || existing.sqlText || ""),
      paramScriptText: String(payload.paramScriptText ?? existing.paramScriptText ?? ""),
      scriptText: String(payload.scriptText || existing.scriptText || ""),
      sqlTimeoutMs: Number(payload.sqlTimeoutMs || existing.sqlTimeoutMs || 5000),
      scriptTimeoutMs: Number(payload.scriptTimeoutMs || existing.scriptTimeoutMs || 1000),
      scriptCapabilities: normalizeScriptCapabilities(payload.scriptCapabilities, existing.scriptCapabilities || []),
      deletedAt: payload.deletedAt === undefined ? existing.deletedAt || null : payload.deletedAt,
      createdAt: existing.createdAt || payload.createdAt || now(),
      updatedAt: now()
    };
  }

  async listApis(options = {}) {
    // 列表页支持按名称和 SQL 内容筛选，分页参数在这里做边界限制。
    let page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 20));
    const name = String(options.name || "").trim();
    const sql = String(options.sql || "").trim();
    const where = ["deleted_at is null"];
    const params = [];

    if (name) {
      where.push("name like ? escape '\\\\'");
      params.push(`%${escapeLike(name)}%`);
    }

    if (sql) {
      where.push("sql_text like ? escape '\\\\'");
      params.push(`%${escapeLike(sql)}%`);
    }

    const whereSql = where.join(" and ");
    const [countRows] = await this.pool.execute(
      `select count(*) as total
       from ssql_api_definitions
       where ${whereSql}`,
      params
    );
    const total = Number(countRows[0].total || 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    page = Math.min(page, totalPages);
    const offset = (page - 1) * pageSize;
    const [rows] = await this.pool.execute(
      `select *
       from ssql_api_definitions
       where ${whereSql}
       order by updated_at desc
       limit ${pageSize} offset ${offset}`,
      params
    );

    return {
      items: rows.map((row) => this.mapApi(row)),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  async getApi(id) {
    const [rows] = await this.pool.execute(
      "select * from ssql_api_definitions where id = ? and deleted_at is null",
      [id]
    );
    if (rows.length === 0) throw new AppError(404, "api not found");
    return this.mapApi(rows[0]);
  }

  async findByPathAndMethod(apiPath, method) {
    const [rows] = await this.pool.execute(
      "select * from ssql_api_definitions where path = ? and method = ? and deleted_at is null limit 1",
      [apiPath, method.toUpperCase()]
    );
    return rows.length > 0 ? this.mapApi(rows[0]) : null;
  }

  async assertUniquePath(apiPath, method, ignoreId = null) {
    // 动态接口以 path + method 作为唯一访问入口，发布前后都不能冲突。
    const params = [apiPath, method.toUpperCase()];
    let sql = "select id from ssql_api_definitions where path = ? and method = ? and deleted_at is null";
    if (ignoreId) {
      sql += " and id <> ?";
      params.push(ignoreId);
    }
    sql += " limit 1";
    const [rows] = await this.pool.execute(sql, params);
    if (rows.length > 0) throw new AppError(409, "api path and method already exists");
  }

  async insertApi(api) {
    await this.pool.execute(
      `insert into ssql_api_definitions (
        id, name, path, method, status, description, request_params, test_params,
        database_alias, sql_text, sql_mode, param_script_text, script_text, sql_timeout_ms, script_timeout_ms,
        script_capabilities, deleted_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        api.id,
        api.name,
        api.path,
        api.method,
        api.status,
        api.description,
        toJson(api.requestParams, []),
        toJson(api.testParams, {}),
        api.databaseAlias,
        api.sqlText,
        api.sqlMode,
        api.paramScriptText,
        api.scriptText,
        api.sqlTimeoutMs,
        api.scriptTimeoutMs,
        toJson(api.scriptCapabilities, []),
        api.deletedAt,
        api.createdAt,
        api.updatedAt
      ]
    );
    return api;
  }

  async createApi(payload) {
    const api = this.normalizePayload(payload, {
      id: randomUUID(),
      status: "draft",
      createdAt: now()
    });
    await this.assertUniquePath(api.path, api.method);
    return this.insertApi(api);
  }

  async updateApi(id, payload) {
    const existing = await this.getApi(id);
    const api = this.normalizePayload(payload, existing);
    await this.assertUniquePath(api.path, api.method, id);
    await this.pool.execute(
      `update ssql_api_definitions
       set name = ?,
           path = ?,
           method = ?,
           status = ?,
           description = ?,
           request_params = ?,
           test_params = ?,
           database_alias = ?,
           sql_text = ?,
           sql_mode = ?,
           param_script_text = ?,
           script_text = ?,
           sql_timeout_ms = ?,
           script_timeout_ms = ?,
           script_capabilities = ?,
           deleted_at = ?,
           updated_at = ?
       where id = ?`,
      [
        api.name,
        api.path,
        api.method,
        api.status,
        api.description,
        toJson(api.requestParams, []),
        toJson(api.testParams, {}),
        api.databaseAlias,
        api.sqlText,
        api.sqlMode,
        api.paramScriptText,
        api.scriptText,
        api.sqlTimeoutMs,
        api.scriptTimeoutMs,
        toJson(api.scriptCapabilities, []),
        api.deletedAt,
        api.updatedAt,
        id
      ]
    );
    return api;
  }

  async updateStatus(id, status) {
    const api = await this.getApi(id);
    return this.updateApi(id, { ...api, status });
  }

  async deleteApi(id) {
    // 软删除保留历史配置和调用日志，只在查询时过滤 deleted_at。
    const api = await this.getApi(id);
    return this.updateApi(id, { ...api, deletedAt: now() });
  }

  async addLog(log) {
    // 运行时无论成功失败都会写入调用日志，失败原因由 errorMessage 记录。
    await this.pool.execute(
      `insert into ssql_api_call_logs (
        id, request_id, parent_request_id, api_id, path, method, status_code,
        duration_ms, error_message, call_chain, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        log.requestId,
        log.parentRequestId || null,
        log.apiId || null,
        log.path,
        log.method,
        Number(log.statusCode || 500),
        Number(log.durationMs || 0),
        log.errorMessage || null,
        toJson(log.callChain, []),
        now()
      ]
    );
  }

  async listLogs() {
    const [rows] = await this.pool.execute(`
      select *
      from ssql_api_call_logs
      order by created_at desc
      limit 1000
    `);
    return rows.map((row) => this.mapLog(row));
  }
}

module.exports = {
  Store
};
