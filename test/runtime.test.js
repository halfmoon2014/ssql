const assert = require("node:assert/strict");
const test = require("node:test");
const { applyParamScriptResult } = require("../src/runtime");

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
