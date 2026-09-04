const path = require("path");
const { Worker } = require("worker_threads");
const { AppError } = require("./errors");
const { normalizeScriptError } = require("./scriptErrors");

const blockedWords = /\b(require|process|global|Buffer|child_process|fs|net|import\s*\(|WebAssembly|eval|Function)\b/;
const defaultWorkerLimits = {
  maxOldGenerationSizeMb: 32,
  maxYoungGenerationSizeMb: 8
};

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
    callChain: Array.isArray(context.callChain) ? context.callChain : [],
    scriptType: context.scriptType || null
  };
}

function validateInternalApiCall(apiPath, params, options, context, maxCallDepth) {
  // callApi 只允许调用动态 API，禁止绕过管理端权限边界。
  if (typeof apiPath !== "string" || !apiPath.startsWith("/api/")) {
    throw new AppError(400, "callApi path must start with /api/");
  }
  if (apiPath.startsWith("/admin/")) throw new AppError(403, "callApi cannot call admin api");
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new AppError(400, "callApi params must be object");
  }
  if (options !== undefined && options !== null && typeof options !== "string" && (typeof options !== "object" || Array.isArray(options))) {
    throw new AppError(400, "callApi options must be object or method string");
  }
  if ((context.callDepth || 0) >= maxCallDepth) {
    throw new AppError(409, "api call depth exceeded");
  }
}

function validateCapabilityCall(name, args) {
  // capability 调用只能传递 JSON 对象，由主线程按能力名继续做授权和参数校验。
  if (typeof name !== "string" || !name) {
    throw new AppError(400, "script capability name is invalid");
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new AppError(400, "script capability args must be object");
  }
}

function getWorkerResourceLimits(input = {}) {
  const configured = input.scriptWorker || input.workerResourceLimits || {};
  const maxOldGenerationSizeMb = Number(
    configured.maxOldGenerationSizeMb || defaultWorkerLimits.maxOldGenerationSizeMb
  );
  const maxYoungGenerationSizeMb = Number(
    configured.maxYoungGenerationSizeMb || defaultWorkerLimits.maxYoungGenerationSizeMb
  );
  if (!Number.isFinite(maxOldGenerationSizeMb) || maxOldGenerationSizeMb <= 0) {
    throw new AppError(400, "script worker old generation memory limit is invalid");
  }
  if (!Number.isFinite(maxYoungGenerationSizeMb) || maxYoungGenerationSizeMb <= 0) {
    throw new AppError(400, "script worker young generation memory limit is invalid");
  }
  return {
    maxOldGenerationSizeMb,
    maxYoungGenerationSizeMb
  };
}

function isWorkerMemoryLimitError(error) {
  const message = String(error && error.message || error || "");
  return /heap out of memory|memory limit/i.test(message);
}

function createWorkerFailureError(error, limits) {
  if (isWorkerMemoryLimitError(error)) {
    return new AppError(507, "script memory limit exceeded", {
      reason: "Worker reached configured memory limit",
      limits
    });
  }
  return new AppError(500, "script worker failed", {
    reason: error && error.message || String(error || "worker failed")
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new AppError(499, "script test aborted");
}

async function runScript(input) {
  const script = validateScriptText(input.script);
  const timeoutMs = Number(input.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new AppError(400, "script timeout is invalid");
  const workerResourceLimits = getWorkerResourceLimits(input);
  throwIfAborted(input.signal);
  // 每次脚本执行都放入独立 Worker，方便设置内存限制和超时终止。
  const worker = new Worker(path.join(__dirname, "scriptWorker.js"), {
    workerData: {
      script,
      timeoutMs,
      params: deepClone(input.params || {}),
      headers: filterHeaders(input.headers || {}),
      rows: deepClone(input.rows || []),
      resultSets: deepClone(input.resultSets || []),
      context: buildSafeContext(input.context || {})
    },
    resourceLimits: workerResourceLimits
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    function abortScript() {
      worker.terminate();
      settle(() => reject(new AppError(499, "script test aborted")));
    }

    function settle(callback) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (input.signal) input.signal.removeEventListener("abort", abortScript);
      callback();
    }

    if (input.signal) {
      input.signal.addEventListener("abort", abortScript, { once: true });
      if (input.signal.aborted) {
        abortScript();
        return;
      }
    }

    timer = setTimeout(() => {
      // 超时直接终止 Worker，避免用户脚本长时间占用事件循环。
      worker.terminate();
      settle(() => reject(new AppError(408, "script execute timeout")));
    }, timeoutMs);

    worker.on("message", async (message) => {
      if (message.type === "result") {
        settle(() => {
          worker.terminate();
          try {
            assertJsonSerializable(message.result);
            resolve(deepClone(message.result));
          } catch (error) {
            reject(error);
          }
        });
        return;
      }

      if (message.type === "error") {
        settle(() => {
          worker.terminate();
          reject(new AppError(500, "script execute failed", { reason: message.error }));
        });
        return;
      }

      if (message.type === "callApi") {
        try {
          // Worker 不能直接访问 runtime，只能通过消息把内部 API 调用交回主线程。
          validateInternalApiCall(message.path, message.params, message.options, input.context, input.maxCallDepth);
          const result = await input.callApi(message.path, message.params, message.options);
          if (settled) return;
          worker.postMessage({ type: "callApiResult", id: message.id, result: deepClone(result) });
        } catch (error) {
          if (settled) return;
          worker.postMessage({
            type: "callApiResult",
            id: message.id,
            error: normalizeScriptError(error, { capability: `callApi.${String(message.options && message.options.method || "").toLowerCase()}` })
          });
        }
      }

      if (message.type === "capability") {
        try {
          validateCapabilityCall(message.name, message.args);
          if (typeof input.executeCapability !== "function") {
            throw new AppError(403, "script capability is not available");
          }
          const result = await input.executeCapability(message.name, message.args);
          if (settled) return;
          worker.postMessage({ type: "capabilityResult", id: message.id, result: deepClone(result) });
        } catch (error) {
          if (settled) return;
          worker.postMessage({
            type: "capabilityResult",
            id: message.id,
            error: normalizeScriptError(error, { capability: message.name })
          });
        }
      }
    });

    worker.on("error", (error) => {
      settle(() => reject(createWorkerFailureError(error, workerResourceLimits)));
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        settle(() => reject(new AppError(500, "script worker stopped")));
      }
    });
  });
}

module.exports = {
  runScript,
  validateScriptText,
  createWorkerFailureError,
  getWorkerResourceLimits
};
