const vm = require("vm");
const { parentPort, workerData } = require("worker_threads");

const pending = new Map();
const timers = new Map();
let nextTimerId = 1;

function safeConsole() {
  // 沙箱内 console 输出转成消息，避免直接操作主进程 stdout。
  return {
    log: (...args) => parentPort.postMessage({ type: "console", level: "log", args }),
    error: (...args) => parentPort.postMessage({ type: "console", level: "error", args })
  };
}

function normalizeReceivedError(error, fallbackMessage) {
  if (error && typeof error === "object") return error;
  return {
    ok: false,
    capability: "unknown",
    code: "SCRIPT_CAPABILITY_FAILED",
    message: String(error || fallbackMessage),
    statusCode: 500,
    details: null
  };
}

function createScriptCapabilityError(payload) {
  // 让用户脚本可以 catch 到稳定字段，同时保持 Error 的常规行为。
  const safePayload = normalizeReceivedError(payload, "script capability failed");
  const error = new Error(safePayload.message);
  error.name = "ScriptCapabilityError";
  error.code = safePayload.code;
  error.statusCode = safePayload.statusCode;
  error.capability = safePayload.capability;
  error.details = safePayload.details || null;
  error.toJSON = () => safePayload;
  return error;
}

function serializeScriptCapabilityError(error) {
  const base = {
    ok: false,
    capability: error.capability || "unknown",
    code: error.code || "SCRIPT_CAPABILITY_FAILED",
    message: error.message || "script capability failed",
    statusCode: Number(error.statusCode) || 500,
    details: error.details || null
  };
  for (const [key, value] of Object.entries(error)) {
    if (base[key] === undefined && typeof value !== "function") base[key] = value;
  }
  return base;
}

function tryCapability(promise) {
  return promise
    .then((data) => ({ ok: true, data }))
    .catch((error) => {
      // try* 外层已经有 ok，内层 error 不再重复放 ok，保持业务判断清晰。
      const { ok, ...safeError } = serializeScriptCapabilityError(error);
      return {
        ok: false,
        error: safeError
      };
    });
}

function normalizeReturnValue(value, seen = new WeakSet()) {
  // Error 跨 Worker 传递会丢自定义字段；返回前转成普通对象，保留脚本追加的属性。
  if (value instanceof Error) return serializeScriptCapabilityError(value);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => normalizeReturnValue(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== "function") output[key] = normalizeReturnValue(item, seen);
  }
  return output;
}

function callApiRequest(method, path, params = {}) {
  // 脚本内 callApi 通过 parentPort 请求主线程执行，结果再按 id 回填 Promise。
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: "callApi", id, path, params, options: { method } });
  });
}

function capabilityRequest(name, args = {}) {
  // capability 与 callApi 一样经主线程代理，Worker 内只持有受限方法名和 JSON 参数。
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: "capability", id, name, args });
  });
}

const callApi = Object.freeze({
  get: (path, params = {}) => callApiRequest("GET", path, params),
  post: (path, params = {}) => callApiRequest("POST", path, params),
  tryGet: (path, params = {}) => tryCapability(callApiRequest("GET", path, params)),
  tryPost: (path, params = {}) => tryCapability(callApiRequest("POST", path, params))
});

const files = Object.freeze({
  inspectUrl: (url, options = {}) => capabilityRequest("files.inspectUrl", { url, options }),
  downloadTemp: (url, options = {}) => capabilityRequest("files.downloadTemp", { url, options }),
  tryInspectUrl: (url, options = {}) => tryCapability(capabilityRequest("files.inspectUrl", { url, options })),
  tryDownloadTemp: (url, options = {}) => tryCapability(capabilityRequest("files.downloadTemp", { url, options }))
});

function safeSetTimeout(callback, delay = 0, ...args) {
  // 只暴露定时器能力，不暴露 Node 的 Timer 对象；外层 Worker 超时仍会终止长时间脚本。
  if (typeof callback !== "function") {
    throw new TypeError("setTimeout callback must be function");
  }
  const id = nextTimerId;
  nextTimerId += 1;
  const timeoutMs = Math.max(0, Number(delay) || 0);
  const timer = setTimeout(() => {
    timers.delete(id);
    callback(...args);
  }, timeoutMs);
  timers.set(id, timer);
  return id;
}

function safeClearTimeout(id) {
  const timer = timers.get(id);
  if (!timer) return;
  clearTimeout(timer);
  timers.delete(id);
}

function clearAllTimers() {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

parentPort.on("message", (message) => {
  // 主线程返回内部 API 调用结果后，唤醒对应的脚本 Promise。
  if (message.type !== "callApiResult" && message.type !== "capabilityResult") return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) {
    request.reject(createScriptCapabilityError(message.error));
  } else {
    request.resolve(message.result);
  }
});

async function run() {
  const { script, timeoutMs, params, headers, rows, resultSets, context } = workerData;
  // 只把白名单变量注入 vm，上层已经过滤敏感 header 和危险脚本关键字。
  const sandbox = {
    params,
    headers,
    rows,
    resultSets,
    context,
    callApi,
    files,
    setTimeout: safeSetTimeout,
    clearTimeout: safeClearTimeout,
    console: safeConsole()
  };

  const vmContext = vm.createContext(sandbox, {
    name: "ssql-script-context",
    codeGeneration: {
      // 禁止在 vm 内通过字符串或 wasm 动态生成代码。
      strings: false,
      wasm: false
    }
  });

  const wrappedScript = `
    "use strict";
    ${script}
    Promise.resolve(main({ params, headers, rows, resultSets, context, callApi, files }));
  `;

  // 用户脚本必须定义 main，最终 API 响应就是 main 的返回值。
  const compiled = new vm.Script(wrappedScript, {
    filename: "user-script.js"
  });

  const result = compiled.runInContext(vmContext, {
    timeout: timeoutMs,
    displayErrors: false
  });
  const finalResult = await result;
  clearAllTimers();
  parentPort.postMessage({ type: "result", result: normalizeReturnValue(finalResult) });
}

run().catch((error) => {
  clearAllTimers();
  parentPort.postMessage({
    type: "error",
    error: error.name === "ScriptCapabilityError"
      ? serializeScriptCapabilityError(error)
      : error.message || "script execute failed"
  });
});
