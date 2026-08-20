const vm = require("vm");
const { parentPort, workerData } = require("worker_threads");

const pending = new Map();

function safeConsole() {
  // 沙箱内 console 输出转成消息，避免直接操作主进程 stdout。
  return {
    log: (...args) => parentPort.postMessage({ type: "console", level: "log", args }),
    error: (...args) => parentPort.postMessage({ type: "console", level: "error", args })
  };
}

function callApi(path, params = {}) {
  // 脚本内 callApi 通过 parentPort 请求主线程执行，结果再按 id 回填 Promise。
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random()}`;
    pending.set(id, { resolve, reject });
    parentPort.postMessage({ type: "callApi", id, path, params });
  });
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
  parentPort.postMessage({ type: "result", result: finalResult });
}

run().catch((error) => {
  parentPort.postMessage({
    type: "error",
    error: error.message || "script execute failed"
  });
});
