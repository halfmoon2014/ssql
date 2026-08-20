const assert = require("node:assert/strict");
const test = require("node:test");
const { runScript } = require("../src/scriptRunner");

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
