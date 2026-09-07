const assert = require("node:assert/strict");
const test = require("node:test");
const { ApiRuntime, applyParamScriptResult, normalizeCallApiMethod } = require("../src/runtime");

test("applyParamScriptResult accepts object return value as processed params", () => {
  const currentParams = { id: "7" };
  const result = applyParamScriptResult({ id: 7, status: "active" }, currentParams);

  assert.equal(result.directReturn, false);
  assert.deepEqual(result.params, { id: 7, status: "active" });
});

test("applyParamScriptResult accepts nested params return value", () => {
  const currentParams = { id: "7" };
  const result = applyParamScriptResult({ params: { id: 7 } }, currentParams);

  assert.equal(result.directReturn, false);
  assert.deepEqual(result.params, { id: 7 });
});

test("applyParamScriptResult supports direct API return before SQL execution", () => {
  const currentParams = { id: "7" };
  const data = { code: 400, message: "missing id" };
  const result = applyParamScriptResult({ directReturn: true, data, params: { id: 7 } }, currentParams);

  assert.equal(result.directReturn, true);
  assert.deepEqual(result.params, { id: 7 });
  assert.deepEqual(result.data, data);
});

test("applyParamScriptResult keeps current params for primitive return value", () => {
  const currentParams = { id: "7" };
  const result = applyParamScriptResult(null, currentParams);

  assert.equal(result.directReturn, false);
  assert.deepEqual(result.params, currentParams);
});

test("normalizeCallApiMethod accepts options object and method string", () => {
  assert.equal(normalizeCallApiMethod({ method: "get" }), "GET");
  assert.equal(normalizeCallApiMethod("post"), "POST");
  assert.equal(normalizeCallApiMethod({}), null);
});

test("executeCallApi authorizes resolved target api before execution", async () => {
  const calls = [];
  const runtime = new ApiRuntime({
    config: {},
    store: {
      async findByPathAndMethod(apiPath, method) {
        calls.push({ type: "find", apiPath, method });
        return { id: "api-2", path: apiPath, method, status: "draft" };
      }
    }
  });
  runtime.executeApi = async (api, options) => {
    calls.push({ type: "execute", apiId: api.id, method: options.method });
    return { data: { ok: true } };
  };

  const result = await runtime.executeCallApi("/api/target", {}, { method: "get" }, {
    async authorizeCallApi(api, context) {
      calls.push({ type: "authorize", apiId: api.id, method: context.method });
    }
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    { type: "find", apiPath: "/api/target", method: "GET" },
    { type: "authorize", apiId: "api-2", method: "GET" },
    { type: "execute", apiId: "api-2", method: "GET" }
  ]);
});
