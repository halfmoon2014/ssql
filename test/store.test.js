const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeTagIds, normalizeTagName } = require("../src/store");

test("normalizeTagName trims user input", () => {
  assert.equal(normalizeTagName("  订单  "), "订单");
});

test("normalizeTagIds accepts arrays, objects and comma-separated query values", () => {
  assert.deepEqual(normalizeTagIds(["a", "b", "a", "", { id: "c" }]), ["a", "b", "c"]);
  assert.deepEqual(normalizeTagIds(" a,b,,a "), ["a", "b"]);
});
