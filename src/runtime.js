const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { AppError } = require("./errors");
const { executeCapability } = require("./capabilities");
const { executeSqlWithFields, prepareSqlExecution, resolveDatabaseSource } = require("./sqlExecutor");
const { runScript } = require("./scriptRunner");
const { formatChinaFileTime, formatChinaTime } = require("./time");

function buildParams(requestParams, inputParams) {
  // 根据接口定义补默认值并校验必填项，输出结果供 SQL 和脚本共用。
  const params = { ...(inputParams || {}) };
  for (const definition of requestParams || []) {
    if (params[definition.name] === undefined && definition.defaultValue !== undefined) {
      params[definition.name] = definition.defaultValue;
    }
    if (definition.required && params[definition.name] === undefined) {
      throw new AppError(400, `missing required param: ${definition.name}`);
    }
  }
  return params;
}

function safeJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function safeFilePart(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeApiDebugFile(config, payload) {
  // 每次 API 请求输出一份调试快照，便于复盘入参、SQL 渲染和脚本内容。
  const dir = path.join(config.dataDir, "api-debug");
  ensureDir(dir);
  const timestamp = formatChinaFileTime();
  const filename = `${timestamp}-${safeFilePart(payload.requestId)}.json`;
  fs.writeFileSync(path.join(dir, filename), `${JSON.stringify(payload, null, 2)}\n`);
}

function hasScript(script) {
  return Boolean(String(script || "").trim());
}

function applyParamScriptResult(result, currentParams) {
  // 参数处理脚本返回 { directReturn: true, data } 时直接结束 API；否则返回对象作为新 params。
  if (result && typeof result === "object" && result.directReturn === true) {
    const nextParams = result.params && typeof result.params === "object" && !Array.isArray(result.params)
      ? result.params
      : currentParams;
    return {
      directReturn: true,
      params: nextParams,
      data: result.data === undefined ? null : result.data
    };
  }
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const nextParams = result.params && typeof result.params === "object" && !Array.isArray(result.params)
      ? result.params
      : result;
    return {
      directReturn: false,
      params: nextParams
    };
  }
  return {
    directReturn: false,
    params: currentParams
  };
}

function normalizeCallApiMethod(options) {
  const raw = typeof options === "string" ? options : options && typeof options === "object" ? options.method : "";
  const method = String(raw || "").trim().toUpperCase();
  return method || null;
}

function buildAuthContext(options) {
  const user = options.securityUser || {};
  return {
    username: options.username || user.username || null,
    displayName: options.displayName || user.displayName || "",
    authType: options.authType || (options.securityUser ? "user_token" : null)
  };
}

class ApiRuntime {
  constructor({ store, config, security = null }) {
    this.store = store;
    this.config = config;
    this.security = security;
  }

  async executeById(id, options = {}) {
    const api = await this.store.getApi(id);
    return this.executeApi(api, options);
  }

  async executeByPath(apiPath, method, options = {}) {
    // 对外动态接口按 path + method 定位配置。
    const api = await this.store.findByPathAndMethod(apiPath, method);
    if (!api) throw new AppError(404, "api not found");
    return this.executeApi(api, options);
  }

  async executeCallApi(apiPath, params, callOptions, runtimeOptions) {
    const requestedMethod = normalizeCallApiMethod(callOptions);
    if (requestedMethod) {
      return this.executeCallApiWithMethod(apiPath, requestedMethod, runtimeOptions).then((response) => response.data);
    }

    try {
      return await this.executeCallApiWithMethod(apiPath, "POST", runtimeOptions).then((response) => response.data);
    } catch (error) {
      // 未显式传 method 的内部调用兜底：先按历史 POST 查找，再尝试常见 GET。
      if (error.statusCode !== 404) throw error;
      return this.executeCallApiWithMethod(apiPath, "GET", runtimeOptions).then((response) => response.data);
    }
  }

  async executeCallApiWithMethod(apiPath, method, runtimeOptions = {}) {
    const api = await this.store.findByPathAndMethod(apiPath, method);
    if (!api) throw new AppError(404, "api not found");
    if (typeof runtimeOptions.authorizeCallApi === "function") {
      // 管理端测试允许调用草稿 API，但不能借 callApi 绕过目标 API 的开发测试权限。
      await runtimeOptions.authorizeCallApi(api, { apiPath, method });
    }
    return this.executeApi(api, {
      ...runtimeOptions,
      method
    });
  }

  executeScriptCapability(api, context, name, args) {
    // 脚本能力统一从主线程代理执行；这里按 API 授权并输出审计日志。
    return executeCapability({
      name,
      args,
      api,
      context,
      config: this.config,
      logger: this.store.logger
    });
  }

  async runParamScript(api, params, options = {}) {
    if (!hasScript(api.paramScriptText)) {
      return {
        params,
        paramScriptResult: null,
        directReturn: false,
        data: null
      };
    }

    const requestId = options.requestId || randomUUID();
    const callChain = Array.isArray(options.callChain) ? [...options.callChain] : [];
    const nextCallChain = Array.isArray(options.nextCallChain) ? [...options.nextCallChain] : [...callChain, api.id];
    const allowDraft = Boolean(options.allowDraft);
    const authContext = buildAuthContext(options);
    const paramScriptResult = await runScript({
      script: api.paramScriptText,
      params,
      headers: options.headers || {},
      rows: [],
      context: {
        requestId,
        userId: options.userId,
        roles: options.roles || [],
        username: authContext.username,
        displayName: authContext.displayName,
        authType: authContext.authType,
        callDepth: nextCallChain.length - 1,
        callChain: Array.isArray(options.debugCallChain) ? options.debugCallChain : [...callChain, api.path],
        scriptType: "params"
      },
      timeoutMs: api.scriptTimeoutMs || this.config.scriptTimeoutMs,
      maxCallDepth: this.config.maxCallDepth,
      scriptWorker: this.config.scriptWorker,
      signal: options.signal,
      executeCapability: (name, args) => this.executeScriptCapability(api, {
        requestId,
        userId: options.userId,
        roles: options.roles || [],
        username: authContext.username,
        displayName: authContext.displayName,
        authType: authContext.authType,
        callDepth: nextCallChain.length - 1,
        callChain: Array.isArray(options.debugCallChain) ? options.debugCallChain : [...callChain, api.path],
        scriptType: "params"
      }, name, args),
      callApi: async (apiPath, callParams, callOptions) => {
        return this.executeCallApi(apiPath, callParams, callOptions, {
          params: callParams,
          headers: options.headers || {},
          requestId: randomUUID(),
          parentRequestId: requestId,
          callChain: nextCallChain,
          allowDraft,
          userId: options.userId,
          roles: options.roles || [],
          username: authContext.username,
          displayName: authContext.displayName,
          authType: authContext.authType,
          securityUser: options.securityUser,
          clientIp: options.clientIp,
          userAgent: options.userAgent,
          authorizeCallApi: options.authorizeCallApi
        });
      }
    });

    return {
      paramScriptResult,
      ...applyParamScriptResult(paramScriptResult, params)
    };
  }

  async executeApi(api, options = {}) {
    // executeApi 是动态 API 的主编排：校验状态 -> 参数 JS -> SQL -> 结果 JS -> 日志。
    const startedAt = Date.now();
    const requestId = options.requestId || randomUUID();
    const parentRequestId = options.parentRequestId || null;
    const callChain = Array.isArray(options.callChain) ? [...options.callChain] : [];
    const method = options.method || api.method;
    const allowDraft = Boolean(options.allowDraft);
    const debug = {
      requestId,
      api: {
        id: api.id,
        name: api.name,
        path: api.path,
        method: api.method,
        status: api.status
      },
      params: null,
      paramScriptText: api.paramScriptText || "",
      paramScriptResult: null,
      sql: null,
      sqlRows: null,
      sqlResultSets: [],
      scriptText: api.scriptText || "",
      scriptResult: null,
      callChain: [...callChain, api.path]
    };

    if (!allowDraft && api.status !== "published") {
      throw new AppError(403, "api is not published");
    }

    // callApi 可能形成环或过深链路，这里用接口 id 作为稳定检测键。
    if (callChain.includes(api.id)) {
      throw new AppError(409, "circular api call detected");
    }

    if (callChain.length >= this.config.maxCallDepth) {
      throw new AppError(409, "api call depth exceeded");
    }

    const nextCallChain = [...callChain, api.id];

    let caughtError = null;
    try {
      if (this.security && !allowDraft) {
        await this.security.assertApiAccessForUser(options.securityUser, api, {
          clientIp: options.clientIp,
          userAgent: options.userAgent
        });
      }
      let params = buildParams(api.requestParams, options.params || {});
      debug.params = params;

      if (hasScript(api.paramScriptText)) {
        const authContext = buildAuthContext(options);
        const applied = await this.runParamScript(api, params, {
          requestId,
          headers: options.headers || {},
          callChain,
          nextCallChain,
          debugCallChain: debug.callChain,
          allowDraft,
          userId: options.userId,
          roles: options.roles || [],
          username: authContext.username,
          displayName: authContext.displayName,
          authType: authContext.authType,
          securityUser: options.securityUser,
          clientIp: options.clientIp,
          userAgent: options.userAgent
        });
        debug.paramScriptResult = applied.paramScriptResult;
        if (applied.directReturn) {
          params = applied.params || params;
          debug.params = params;
          debug.scriptResult = applied.data;
          await this.store.addLog({
            requestId,
            parentRequestId,
            apiId: api.id,
            path: api.path,
            method,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
            errorMessage: null,
            callChain: debug.callChain
          });
          return {
            data: applied.data,
            debug
          };
        }
        params = applied.params;
        debug.params = params;
      }

      // SQL 的查询结果作为 rows 注入脚本 main({ rows })。
      const databaseSource = resolveDatabaseSource(this.config.database, api);
      const preparedSql = prepareSqlExecution(api, params, databaseSource.type);
      debug.sql = preparedSql.debug;
      const sqlResult = await executeSqlWithFields(this.config.database, api, params, preparedSql);
      const rows = sqlResult.rows;
      debug.sqlRows = rows;
      debug.sqlResultSets = sqlResult.resultSets || [];
      const authContext = buildAuthContext(options);

      const result = await runScript({
        script: api.scriptText,
        params,
        headers: options.headers || {},
        rows,
        resultSets: debug.sqlResultSets,
        context: {
          requestId,
          userId: options.userId,
          roles: options.roles || [],
          username: authContext.username,
          displayName: authContext.displayName,
          authType: authContext.authType,
          callDepth: nextCallChain.length - 1,
          callChain: debug.callChain,
          scriptType: "result"
        },
        timeoutMs: api.scriptTimeoutMs || this.config.scriptTimeoutMs,
        maxCallDepth: this.config.maxCallDepth,
        scriptWorker: this.config.scriptWorker,
        executeCapability: (name, args) => this.executeScriptCapability(api, {
          requestId,
          userId: options.userId,
          roles: options.roles || [],
          callDepth: nextCallChain.length - 1,
          callChain: debug.callChain,
          scriptType: "result"
        }, name, args),
        callApi: async (apiPath, callParams, callOptions) => {
          // 脚本内 callApi 会再次进入 runtime，并继承调用链用于防环和日志追踪。
          return this.executeCallApi(apiPath, callParams, callOptions, {
            params: callParams,
            headers: options.headers || {},
            requestId: randomUUID(),
            parentRequestId: requestId,
            callChain: nextCallChain,
            allowDraft,
            userId: options.userId,
            roles: options.roles || [],
            username: authContext.username,
            displayName: authContext.displayName,
            authType: authContext.authType,
            securityUser: options.securityUser,
            clientIp: options.clientIp,
            userAgent: options.userAgent,
            authorizeCallApi: options.authorizeCallApi
          });
        }
      });

      debug.scriptResult = result;
      // 成功和失败都写调用日志，便于按 requestId 追踪一次 API 执行。
      await this.store.addLog({
        requestId,
        parentRequestId,
        apiId: api.id,
        path: api.path,
        method,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        errorMessage: null,
        callChain: debug.callChain
      });

      return {
        data: result,
        debug
      };
    } catch (error) {
      caughtError = error;
      await this.store.addLog({
        requestId,
        parentRequestId,
        apiId: api.id,
        path: api.path,
        method,
        statusCode: error.statusCode || 500,
        durationMs: Date.now() - startedAt,
        errorMessage: error.message,
        callChain: debug.callChain
      });
      throw error;
    } finally {
      const payload = {
        requestId,
        parentRequestId,
        createdAt: formatChinaTime(),
        durationMs: Date.now() - startedAt,
        api: debug.api,
        callChain: debug.callChain,
        params: safeJson(debug.params),
        paramScriptText: api.paramScriptText || "",
        paramScriptResult: safeJson(debug.paramScriptResult),
        sql: debug.sql || {
          databaseAlias: api.databaseAlias || this.config.database.defaultAlias || "default",
          databaseType: null,
          mode: api.sqlMode || null,
          originalSql: api.sqlText || "",
          renderedSql: null,
          boundSql: null,
          boundValues: []
        },
        sqlRows: safeJson(debug.sqlRows),
        sqlResultSets: safeJson(debug.sqlResultSets),
        scriptText: api.scriptText || "",
        scriptResult: safeJson(debug.scriptResult),
        error: caughtError ? {
          name: caughtError.name,
          message: caughtError.message,
          statusCode: caughtError.statusCode || 500,
          details: caughtError.details || null
        } : null
      };
      try {
        writeApiDebugFile(this.config, payload);
      } catch (fileError) {
        // 调试文件写入失败不能影响 API 主流程，只记录到服务端日志表之外的 logger。
        if (this.store.logger) this.store.logger.error("api debug file write failed", fileError, { requestId });
      }
    }
  }
}

module.exports = {
  ApiRuntime,
  buildParams,
  applyParamScriptResult,
  normalizeCallApiMethod
};
