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

function callApiRequest(method, path, params = {}) {
  // 脚本内 callApi 通过 parentPort 请求主线程执行，结果再按 id 回填 Promise。
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: "callApi", id, path, params, options: { method } });
  });
}

const callApi = Object.freeze({
  get: (path, params = {}) => callApiRequest("GET", path, params),
  post: (path, params = {}) => callApiRequest("POST", path, params)
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
  if (message.type !== "callApiResult") return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) {
    request.reject(new Error(message.error));
  } else {
    request.resolve(message.result);
  }
});

async function run() {
  const { script, params, headers, rows, resultSets, context } = workerData;
  // 只把白名单变量注入 vm，上层已经过滤敏感 header 和危险脚本关键字。
  const sandbox = {
    params,
    headers,
    rows,
    resultSets,
    context,
    callApi,
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
    Promise.resolve(main({ params, headers, rows, resultSets, context, callApi }));
  `;

  // 用户脚本必须定义 main，最终 API 响应就是 main 的返回值。
  const compiled = new vm.Script(wrappedScript, {
    filename: "user-script.js"
  });

  const result = compiled.runInContext(vmContext, {
    timeout: 1000,
    displayErrors: false
  });
  const finalResult = await result;
  clearAllTimers();
  parentPort.postMessage({ type: "result", result: finalResult });
}

run().catch((error) => {
  clearAllTimers();
  parentPort.postMessage({
    type: "error",
    error: error.message || "script execute failed"
  });
});
