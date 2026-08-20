const assert = require("assert");
const test = require("node:test");
const { formatChinaFileTime, formatChinaTime } = require("../src/time");

test("formatChinaTime renders UTC+08:00 timestamp", () => {
  const value = formatChinaTime(new Date("2026-08-20T03:22:54.804Z"));
  assert.equal(value, "2026-08-20T11:22:54.804+08:00");
});

test("formatChinaFileTime keeps timestamp usable in file names", () => {
  const value = formatChinaFileTime(new Date("2026-08-20T03:22:54.804Z"));
  assert.equal(value, "2026-08-20T11-22-54-804+08-00");
});
