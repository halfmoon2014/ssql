const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { loadConfig } = require("./config");
const { AppError, fail, ok } = require("./errors");
const { Store } = require("./store");
const { executeSqlWithFields } = require("./sqlExecutor");
const { runScript } = require("./scriptRunner");
const { ApiRuntime } = require("./runtime");
const { Logger } = require("./logger");
const { formatCode } = require("./formatter");

const config = loadConfig();
const logger = new Logger(config.dataDir);
const store = new Store({ database: config.database, dataDir: config.dataDir, logger });
const runtime = new ApiRuntime({ store, config });

// 静态资源只服务管理端所需的少量文件类型。
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, statusCode, body) {
  // 管理端和动态 API 都返回 JSON，同时开放跨域方便前端调试。
  res.statusCode = statusCode;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization"
  });
  res.end(JSON.stringify(body));
}

function sendOk(res, data) {
  sendJson(res, 200, ok(data));
}

function sendError(res, error) {
  const payload = fail(error);
  sendJson(res, payload.statusCode, payload.body);
}

function parseBody(req) {
  // 当前接口只接受 JSON body，并限制请求体大小，避免占用过多内存。
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new AppError(413, "request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new AppError(400, "invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function getQueryParams(url) {
  const params = {};
  for (const [key, value] of url.searchParams.entries()) {
    params[key] = value;
  }
  return params;
}

function pathParts(urlPath) {
  return urlPath.split("/").filter(Boolean);
}

function serveStatic(req, res, urlPath) {
  const filePath = urlPath === "/" ? "/index.html" : urlPath;
  const fullPath = path.normalize(path.join(config.publicDir, filePath));
  // path.normalize 后仍需校验前缀，防止 ../ 跳出 public 目录。
  if (!fullPath.startsWith(config.publicDir)) {
    throw new AppError(403, "forbidden");
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    throw new AppError(404, "not found");
  }
  const ext = path.extname(fullPath);
  const content = fs.readFileSync(fullPath);
  res.statusCode = 200;
  res.writeHead(200, {
    "content-type": contentTypes[ext] || "application/octet-stream",
    "content-length": content.length
  });
  logger.info("static file served", {
    method: req.method,
    urlPath,
    filePath: fullPath,
    bytes: content.length
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(content);
}

function writeRawHttpResponse(socket, statusLine) {
  // clientError 发生在请求进入路由前，只能手写最小 HTTP 响应。
  if (!socket || socket.destroyed) return;
  if (!socket.writable) {
    socket.destroy();
    return;
  }
  socket.end(`${statusLine}\r\nConnection: close\r\n\r\n`);
}

function listDatabaseSources() {
  // 前端只需要别名和类型，不能把密码等连接配置暴露出去。
  return (config.database.sources || []).map((source) => ({
    alias: source.alias,
    type: source.type,
    label: `${source.alias} (${source.type})`
  }));
}

async function handleAdmin(req, res, url, body) {
  const parts = pathParts(url.pathname);
  const id = parts[2];

  // 管理端当前使用开发 token，后续接入真实鉴权时只需替换这里。
  if (req.method === "POST" && url.pathname === "/admin/login") {
    sendOk(res, { token: "dev-token", user: { id: 1, name: "admin", roles: ["admin"] } });
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/database-sources") {
    sendOk(res, {
      defaultAlias: config.database.defaultAlias,
      items: listDatabaseSources()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/admin/format-code") {
    // 代码格式化在服务端执行，避免前端加载大型 formatter 包；接口只返回格式化后的文本。
    const result = await formatCode(body);
    logger.info("admin code formatted", { language: body.language, kind: result.kind });
    sendOk(res, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/admin/apis") {
    const query = getQueryParams(url);
    logger.info("admin api list", query);
    sendOk(res, await store.listApis(query));
    return;
  }

  if (req.method === "POST" && url.pathname === "/admin/apis") {
    const api = await store.createApi(body);
    logger.info("admin api created", { apiId: api.id, path: api.path, method: api.method });
    sendOk(res, api);
    return;
  }

  if (parts[0] === "admin" && parts[1] === "apis" && id) {
    if (req.method === "GET" && parts.length === 3) {
      sendOk(res, await store.getApi(id));
      return;
    }

    if (req.method === "PUT" && parts.length === 3) {
      const api = await store.updateApi(id, body);
      logger.info("admin api updated", { apiId: api.id, path: api.path, method: api.method });
      sendOk(res, api);
      return;
    }

    if (req.method === "DELETE" && parts.length === 3) {
      sendOk(res, await store.deleteApi(id));
      return;
    }

    if (req.method === "POST" && parts[3] === "publish") {
      const api = await store.updateStatus(id, "published");
      logger.info("admin api published", { apiId: api.id, path: api.path, method: api.method });
      sendOk(res, api);
      return;
    }

    if (req.method === "POST" && parts[3] === "disable") {
      const api = await store.updateStatus(id, "disabled");
      logger.info("admin api disabled", { apiId: api.id, path: api.path, method: api.method });
      sendOk(res, api);
      return;
    }

    if (req.method === "POST" && parts[3] === "test-sql") {
      // SQL 测试会先跑参数处理脚本，再执行查询并返回字段信息。
      const api = await store.getApi(id);
      const params = body.params || api.testParams || {};
      const processed = await runtime.runParamScript(api, params, {
        requestId: `test-sql-${Date.now()}`,
        headers: req.headers,
        callChain: [],
        debugCallChain: [api.path],
        allowDraft: true,
        userId: 1,
        roles: ["admin"]
      });
      if (processed.directReturn) {
        sendOk(res, {
          params,
          processedParams: processed.params || params,
          paramScriptResult: processed.paramScriptResult,
          directReturn: true,
          result: processed.data,
          fields: [],
          rows: [],
          resultSets: [],
          total: 0
        });
        return;
      }
      const result = await executeSqlWithFields(config.database, api, processed.params);
      const rows = result.rows;
      logger.info("admin sql tested", { apiId: api.id, path: api.path, rows: rows.length });
      sendOk(res, {
        params,
        processedParams: processed.params,
        paramScriptResult: processed.paramScriptResult,
        fields: result.fields,
        rows,
        resultSets: result.resultSets || [],
        total: rows.length
      });
      return;
    }

    if (req.method === "POST" && parts[3] === "test-script") {
      // 结果集脚本测试会先跑参数处理脚本；没有传入 rows 时再跑 SQL，贴近真实调用链路。
      const api = await store.getApi(id);
      const params = body.params || api.testParams || {};
      const processed = await runtime.runParamScript(api, params, {
        requestId: `test-script-${Date.now()}`,
        headers: req.headers,
        callChain: [],
        debugCallChain: [api.path],
        allowDraft: true,
        userId: 1,
        roles: ["admin"]
      });
      if (processed.directReturn) {
        sendOk(res, {
          params,
          processedParams: processed.params || params,
          paramScriptResult: processed.paramScriptResult,
          directReturn: true,
          rows: [],
          resultSets: [],
          result: processed.data
        });
        return;
      }
      const sqlResult = Array.isArray(body.rows)
        ? { rows: body.rows, resultSets: [{ fields: [], rows: body.rows }] }
        : await executeSqlWithFields(config.database, api, processed.params);
      const rows = sqlResult.rows;
      const scriptContext = {
        requestId: `test-${Date.now()}`,
        userId: 1,
        roles: ["admin"],
        callDepth: 0,
        callChain: [api.path],
        scriptType: "result"
      };
      const result = await runScript({
        script: api.scriptText,
        params: processed.params,
        headers: req.headers,
        rows,
        resultSets: sqlResult.resultSets || [],
        context: scriptContext,
        timeoutMs: api.scriptTimeoutMs || config.scriptTimeoutMs,
        maxCallDepth: config.maxCallDepth,
        scriptWorker: config.scriptWorker,
        executeCapability: (name, args) => runtime.executeScriptCapability(api, scriptContext, name, args),
        callApi: async (apiPath, callParams, callOptions) => {
          // 管理端测试允许调用草稿接口，方便联调未发布的内部依赖。
          return runtime.executeCallApi(apiPath, callParams, callOptions, {
            params: callParams,
            headers: req.headers,
            allowDraft: true,
            userId: 1,
            roles: ["admin"]
          });
        }
      });
      logger.info("admin script tested", { apiId: api.id, path: api.path, rows: rows.length });
      sendOk(res, {
        params,
        processedParams: processed.params,
        paramScriptResult: processed.paramScriptResult,
        rows,
        resultSets: sqlResult.resultSets || [],
        result
      });
      return;
    }

    if (req.method === "POST" && parts[3] === "test-api") {
      const api = await store.getApi(id);
      const response = await runtime.executeById(id, {
        params: body.params || {},
        headers: req.headers,
        allowDraft: true,
        method: api.method,
        userId: 1,
        roles: ["admin"]
      });
      logger.info("admin api tested", { apiId: id, path: response.debug.api.path });
      sendOk(res, response.debug);
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/admin/logs") {
    sendOk(res, await store.listLogs());
    return;
  }

  throw new AppError(404, "admin api not found");
}

async function handleDynamicApi(req, res, url, body) {
  // 动态 API 同时接收 query 和 JSON body，body 同名字段优先。
  const params = {
    ...getQueryParams(url),
    ...(body && typeof body === "object" ? body : {})
  };
  const response = await runtime.executeByPath(url.pathname, req.method, {
    params,
    headers: req.headers,
    userId: 0,
    roles: []
  });
  logger.info("dynamic api executed", {
    path: url.pathname,
    method: req.method,
    requestId: response.debug.requestId
  });
  sendJson(res, 200, response.data);
}

async function handleRequest(req, res) {
  const startedAt = Date.now();
  // 所有请求统一记录耗时，业务执行细节由 runtime/store 日志补充。
  res.on("finish", () => {
    logger.info("http request", {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  if (req.method === "OPTIONS") {
    sendJson(res, 200, ok(null));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    // /admin/* 是管理接口，/api/* 是用户配置出来的动态接口，其余走静态文件。
    if (url.pathname.startsWith("/admin/") || url.pathname === "/admin") {
      const body = await parseBody(req);
      await handleAdmin(req, res, url, body);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      const body = await parseBody(req);
      await handleDynamicApi(req, res, url, body);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    logger.error("request failed", error, {
      method: req.method,
      url: req.url
    });
    sendError(res, error);
  }
}

process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", reason instanceof Error ? reason : new Error(String(reason)));
});

async function start() {
  await store.init();

  const server = http.createServer(handleRequest);

  server.on("clientError", (error, socket) => {
    // 低层 HTTP 解析错误不会进入 handleRequest，这里单独兜底。
    if (error.code === "ERR_HTTP_REQUEST_TIMEOUT" || error.message === "Request timeout") {
      logger.info("client request timeout", {
        code: error.code || null,
        message: error.message
      });
      writeRawHttpResponse(socket, "HTTP/1.1 408 Request Timeout");
      return;
    }
    if (error.code === "ECONNRESET") {
      logger.info("client connection reset", {
        code: error.code,
        message: error.message
      });
      if (socket && !socket.destroyed) socket.destroy();
      return;
    }
    logger.error("client error", error);
    const statusLine = error.code === "HPE_HEADER_OVERFLOW"
      ? "HTTP/1.1 431 Request Header Fields Too Large"
      : "HTTP/1.1 400 Bad Request";
    writeRawHttpResponse(socket, statusLine);
  });

  server.listen(config.port, config.host, () => {
    logger.info("server started", {
      url: `http://${config.host}:${config.port}`,
      port: config.port,
      host: config.host,
      publicDir: config.publicDir,
      dataDir: config.dataDir,
	      storage: "mysql",
	      metadataHost: config.database.mysql.host,
	      metadataPort: config.database.mysql.port,
	      metadataDatabase: config.database.mysql.database,
	      databaseSources: listDatabaseSources()
	    });
  });
}

start().catch((error) => {
  logger.error("server start failed", error);
  process.exit(1);
});
