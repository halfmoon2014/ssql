const path = require("path");
const { Worker } = require("worker_threads");
const { AppError } = require("./errors");

const blockedWords = /\b(require|process|global|Buffer|child_process|fs|net|http|https|import\s*\(|WebAssembly|eval|Function)\b/;

function deepClone(value) {
  // 通过 JSON 深拷贝隔离主线程对象，并确保只传递 JSON 兼容数据。
  return JSON.parse(JSON.stringify(value ?? null));
}

function assertJsonSerializable(value) {
  if (typeof value === "undefined") {
    throw new AppError(500, "script result cannot be undefined");
  }
  try {
    JSON.stringify(value);
  } catch (error) {
    throw new AppError(500, "script result must be json serializable");
  }
}

function validateScriptText(script) {
  // 先做静态黑名单和入口函数校验，真正执行仍放在 Worker + vm 沙箱中。
  const text = String(script || "");
  if (!text.trim()) throw new AppError(400, "script is required");
  if (text.length > 20000) throw new AppError(400, "script is too large");
  if (!/\basync\s+function\s+main\s*\(|\bfunction\s+main\s*\(/.test(text)) {
    throw new AppError(400, "script must define main function");
  }
  if (blockedWords.test(text)) throw new AppError(400, "script contains blocked keyword");
  return text;
}

function filterHeaders(headers) {
  // 用户脚本可以读取普通请求头，但敏感凭据不传入沙箱。
  const output = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (/authorization|cookie|token|password/i.test(key)) continue;
    output[key] = value;
  }
  return output;
}

function buildSafeContext(context) {
  // context 只暴露运行所需的可序列化字段，不把内部对象透传给脚本。
  return {
    requestId: context.requestId,
    userId: context.userId || null,
    roles: Array.isArray(context.roles) ? context.roles : [],
    callDepth: context.callDepth || 0,
    callChain: Array.isArray(context.callChain) ? context.callChain : []
  };
}

function validateInternalApiCall(apiPath, params, context, maxCallDepth) {
  // callApi 只允许调用动态 API，禁止绕过管理端权限边界。
  if (typeof apiPath !== "string" || !apiPath.startsWith("/api/")) {
    throw new AppError(400, "callApi path must start with /api/");
  }
  if (apiPath.startsWith("/admin/")) throw new AppError(403, "callApi cannot call admin api");
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new AppError(400, "callApi params must be object");
  }
  if ((context.callDepth || 0) >= maxCallDepth) {
    throw new AppError(409, "api call depth exceeded");
  }
}

async function runScript(input) {
  const script = validateScriptText(input.script);
  const timeoutMs = Number(input.timeoutMs || 1000);
  // 每次脚本执行都放入独立 Worker，方便设置内存限制和超时终止。
  const worker = new Worker(path.join(__dirname, "scriptWorker.js"), {
    workerData: {
      script,
      params: deepClone(input.params || {}),
      headers: filterHeaders(input.headers || {}),
      rows: deepClone(input.rows || []),
      resultSets: deepClone(input.resultSets || []),
      context: buildSafeContext(input.context || {})
    },
    resourceLimits: {
      maxOldGenerationSizeMb: 32,
      maxYoungGenerationSizeMb: 8
    }
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // 超时直接终止 Worker，避免用户脚本长时间占用事件循环。
      worker.terminate();
      reject(new AppError(408, "script execute timeout"));
    }, timeoutMs);

    worker.on("message", async (message) => {
      if (message.type === "result") {
        clearTimeout(timer);
        worker.terminate();
        try {
          assertJsonSerializable(message.result);
          resolve(deepClone(message.result));
        } catch (error) {
          reject(error);
        }
        return;
      }

      if (message.type === "error") {
        clearTimeout(timer);
        worker.terminate();
        reject(new AppError(500, "script execute failed", { reason: message.error }));
        return;
      }

      if (message.type === "callApi") {
        try {
          // Worker 不能直接访问 runtime，只能通过消息把内部 API 调用交回主线程。
          validateInternalApiCall(message.path, message.params, input.context, input.maxCallDepth);
          const result = await input.callApi(message.path, message.params);
          worker.postMessage({ type: "callApiResult", id: message.id, result: deepClone(result) });
        } catch (error) {
          worker.postMessage({
            type: "callApiResult",
            id: message.id,
            error: error.message || "callApi failed"
          });
        }
      }
    });

    worker.on("error", (error) => {
      clearTimeout(timer);
      reject(new AppError(500, "script worker failed", { reason: error.message }));
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        clearTimeout(timer);
        reject(new AppError(500, "script worker stopped"));
      }
    });
  });
}

module.exports = {
  runScript,
  validateScriptText
};
