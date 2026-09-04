const assert = require("node:assert/strict");
const test = require("node:test");
const { AppError } = require("../src/errors");
const { createWorkerFailureError, getWorkerResourceLimits, runScript } = require("../src/scriptRunner");

test("createWorkerFailureError normalizes worker memory limit failures", () => {
  const limits = getWorkerResourceLimits({
    scriptWorker: {
      maxOldGenerationSizeMb: 32,
      maxYoungGenerationSizeMb: 8
    }
  });
  const error = createWorkerFailureError(
    new Error("Worker terminated due to reaching memory limit: JS heap out of memory"),
    limits
  );

  assert.equal(error.statusCode, 507);
  assert.equal(error.message, "script memory limit exceeded");
  assert.deepEqual(error.details, {
    reason: "Worker reached configured memory limit",
    limits
  });
});

test("runScript exposes controlled setTimeout and clearTimeout", async () => {
  const result = await runScript({
    script: `
      async function main() {
        let called = false;
        const id = setTimeout(() => {
          called = true;
        }, 50);
        clearTimeout(id);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ok: true, called };
      }
    `,
    timeoutMs: 500,
    context: {},
    callApi: async () => null
  });

  assert.deepEqual(result, { ok: true, called: false });
});

test("runScript can be aborted by signal", async () => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);

  await assert.rejects(
    () => runScript({
      script: `
        async function main() {
          while (true) {}
        }
      `,
      timeoutMs: 1000,
      context: {},
      signal: controller.signal,
      callApi: async () => null
    }),
    (error) => error.statusCode === 499 && error.message === "script test aborted"
  );
});

test("runScript exposes safe context fields including scriptType", async () => {
  const result = await runScript({
    script: `
      async function main({ context }) {
        return context;
      }
    `,
    timeoutMs: 500,
    context: {
      requestId: "req-1",
      userId: 7,
      roles: ["admin"],
      callDepth: 2,
      callChain: ["/api/a", "/api/b"],
      scriptType: "params",
      internalSecret: "hidden"
    },
    callApi: async () => null
  });

  assert.deepEqual(result, {
    requestId: "req-1",
    userId: 7,
    roles: ["admin"],
    callDepth: 2,
    callChain: ["/api/a", "/api/b"],
    scriptType: "params"
  });
});

test("runScript still enforces script timeout for long timers", async () => {
  await assert.rejects(
    () => runScript({
      script: `
        async function main() {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return { ok: true };
        }
      `,
      timeoutMs: 50,
      context: {},
      callApi: async () => null
    }),
    /script execute timeout/
  );
});

test("runScript exposes callApi get and post methods", async () => {
  const result = await runScript({
    script: `
      async function main({ callApi }) {
        const getResult = await callApi.get("/api/user", { id: 1 });
        const postResult = await callApi.post("/api/order", { id: 2 });
        return { getResult, postResult };
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async (path, params, options) => ({ path, params, method: options.method })
  });

  assert.deepEqual(result, {
    getResult: {
      path: "/api/user",
      params: { id: 1 },
      method: "GET"
    },
    postResult: {
      path: "/api/order",
      params: { id: 2 },
      method: "POST"
    }
  });
});

test("runScript exposes files capability proxy", async () => {
  const result = await runScript({
    script: `
      async function main({ files }) {
        const info = await files.inspectUrl("https://example.com/a.txt", { maxBytes: 100 });
        return info;
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async () => null,
    executeCapability: async (name, args) => ({ name, args })
  });

  assert.deepEqual(result, {
    name: "files.inspectUrl",
    args: {
      url: "https://example.com/a.txt",
      options: { maxBytes: 100 }
    }
  });
});

test("runScript lets scripts catch structured files errors", async () => {
  const result = await runScript({
    script: `
      async function main({ files }) {
        try {
          await files.inspectUrl("https://blocked.example/a.txt");
          return { caught: false };
        } catch (error) {
          return {
            caught: true,
            name: error.name,
            code: error.code,
            capability: error.capability,
            statusCode: error.statusCode,
            message: error.message
          };
        }
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async () => null,
    executeCapability: async () => {
      throw new AppError(403, "file capability host is not allowed");
    }
  });

  assert.deepEqual(result, {
    caught: true,
    name: "ScriptCapabilityError",
    code: "FILE_HOST_NOT_ALLOWED",
    capability: "files.inspectUrl",
    statusCode: 403,
    message: "file capability host is not allowed"
  });
});

test("runScript preserves custom fields when a script returns caught error", async () => {
  const result = await runScript({
    script: `
      async function main({ files }) {
        try {
          await files.inspectUrl("https://blocked.example/a.txt");
        } catch (error) {
          error.b = 2;
          return error;
        }
        return { ok: true };
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async () => null,
    executeCapability: async () => {
      throw new AppError(403, "file capability host is not allowed");
    }
  });

  assert.deepEqual(result, {
    ok: false,
    capability: "files.inspectUrl",
    code: "FILE_HOST_NOT_ALLOWED",
    message: "file capability host is not allowed",
    statusCode: 403,
    details: null,
    name: "ScriptCapabilityError",
    b: 2
  });
});

test("runScript normalizes nested returned errors", async () => {
  const result = await runScript({
    script: `
      async function main({ callApi }) {
        try {
          await callApi.get("/api/missing", {});
        } catch (error) {
          error.extra = { retry: false };
          return { error };
        }
        return { ok: true };
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async () => {
      throw new AppError(404, "api not found");
    }
  });

  assert.deepEqual(result, {
    error: {
      ok: false,
      capability: "callApi.get",
      code: "CALL_API_NOT_FOUND",
      message: "api not found",
      statusCode: 404,
      details: null,
      name: "ScriptCapabilityError",
      extra: { retry: false }
    }
  });
});

test("runScript exposes try methods for callApi and files", async () => {
  const result = await runScript({
    script: `
      async function main({ callApi, files }) {
        const apiResult = await callApi.tryGet("/api/missing", {});
        const fileResult = await files.tryInspectUrl("https://blocked.example/a.txt");
        return { apiResult, fileResult };
      }
    `,
    timeoutMs: 500,
    context: {},
    maxCallDepth: 5,
    callApi: async () => {
      throw new AppError(404, "api not found");
    },
    executeCapability: async () => {
      throw new AppError(413, "file capability max size exceeded");
    }
  });

  assert.deepEqual(result, {
    apiResult: {
      ok: false,
      error: {
        capability: "callApi.get",
        code: "CALL_API_NOT_FOUND",
        message: "api not found",
        statusCode: 404,
        details: null,
        name: "ScriptCapabilityError"
      }
    },
    fileResult: {
      ok: false,
      error: {
        capability: "files.inspectUrl",
        code: "FILE_TOO_LARGE",
        message: "file capability max size exceeded",
        statusCode: 413,
        details: null,
        name: "ScriptCapabilityError"
      }
    }
  });
});
