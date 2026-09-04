const assert = require("node:assert/strict");
const test = require("node:test");
const { detectSqlKind, formatCode } = require("../src/formatter");

test("detectSqlKind recognizes raw sql and mybatis xml", () => {
  assert.equal(detectSqlKind("select * from users where id = #{id}"), "sql");
  assert.equal(detectSqlKind("<select>select * from users</select>"), "xml");
  assert.equal(detectSqlKind("select * from users <where><if test=\"id != null\">and id = #{id}</if></where>"), "xml");
});

test("formatCode formats javascript with prettier", async () => {
  const result = await formatCode({
    language: "javascript",
    text: "async function main({params}){return {id:params.id}}"
  });

  assert.equal(result.kind, "js");
  assert.match(result.text, /async function main/);
  assert.match(result.text, /return \{ id: params\.id \};/);
});

test("formatCode formats raw sql", async () => {
  const result = await formatCode({
    language: "sql",
    text: "select * from users where id = #{id}",
    sqlMode: "auto"
  });

  assert.equal(result.kind, "sql");
  assert.match(result.text, /select/);
  assert.match(result.text, /from/);
  assert.match(result.text, /where/);
});

test("formatCode skips raw sql formatting when sql-formatter cannot parse a valid-ish sql fragment", async () => {
  const text = "select (select 1;) as a";
  const result = await formatCode({
    language: "sql",
    text,
    sqlMode: "auto"
  });

  assert.equal(result.kind, "sql");
  assert.equal(result.text, text);
  assert.equal(result.skipped, true);
  assert.match(result.warning, /已保留原内容/);
});

test("formatCode auto formats mybatis xml as xml", async () => {
  const result = await formatCode({
    language: "sql",
    text: "<select><where><if test=\"id != null\">and id = #{id}</if></where></select>",
    sqlMode: "auto"
  });

  assert.equal(result.kind, "xml");
  assert.match(result.text, /<select>/);
  assert.match(result.text, /\n  <where>/);
});
