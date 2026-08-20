const assert = require("node:assert/strict");
const test = require("node:test");
const {
  compileNamedParams,
  extractMyBatisSelectSql,
  evaluateMyBatisTest,
  normalizeMysqlResultSets,
  normalizeSqlMode,
  normalizeSqlText,
  prepareSqlExecution
} = require("../src/sqlExecutor");

function compactSql(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

test("compileNamedParams keeps colon params unchanged", () => {
  const result = compileNamedParams("select * from users where id = :id", { id: 7 });
  assert.equal(result.sql, "select * from users where id = :id");
  assert.deepEqual(result.values, []);
});

test("compileNamedParams supports hash params in plain SQL", () => {
  const result = compileNamedParams("select * from users where id = #{id}", { id: 7 });
  assert.equal(result.sql, "select * from users where id = ?");
  assert.equal(result.executableSql, "select * from users where id = 7");
  assert.deepEqual(result.values, [7]);
});

test("compileNamedParams keeps literal question marks out of mysql binding", () => {
  const result = compileNamedParams("select '?' as mark, #{name} as name", { name: "alice" });
  assert.equal(result.sql, "select '?' as mark, ? as name");
  assert.equal(result.executableSql, "select '?' as mark, 'alice' as name");
});

test("compileNamedParams supports MyBatis hash params", () => {
  const result = compileNamedParams("select * from users where id = #{ id, jdbcType=INTEGER }", { id: 9 });
  assert.equal(result.sql, "select * from users where id = ?");
  assert.deepEqual(result.values, [9]);
});

test("compileNamedParams supports mssql placeholders", () => {
  const result = compileNamedParams("select * from users where id = #{id} and status = #{status}", {
    id: 9,
    status: "active"
  }, "mssql");
  assert.equal(result.sql, "select * from users where id = @p0 and status = @p1");
  assert.deepEqual(result.values, [9, "active"]);
  assert.deepEqual(result.parameters, [
    { name: "p0", value: 9 },
    { name: "p1", value: "active" }
  ]);
});

test("extractMyBatisSelectSql extracts static select body", () => {
  const sql = extractMyBatisSelectSql(`
    <mapper namespace="UserMapper">
      <select id="listUsers" resultType="map">
        select * from users where id = #{id} and created_at &gt;= #{createdAt}
      </select>
    </mapper>
  `);
  assert.equal(sql, "select * from users where id = #{id} and created_at >= #{createdAt}");
});

test("normalizeSqlText keeps plain SQL unchanged", () => {
  assert.equal(normalizeSqlText("select 1"), "select 1");
});

test("normalizeSqlText respects explicit SQL mode", () => {
  const xml = "<select id=\"list\">select * from users where id = #{id}</select>";
  assert.equal(normalizeSqlText(xml, { id: 1 }, "sql"), xml);
  assert.equal(normalizeSqlText(xml, { id: 1 }, "xml"), "select * from users where id = #{id}");
});

test("normalizeSqlMode falls back to content detection for old data", () => {
  assert.equal(normalizeSqlMode(null, "select 1"), "sql");
  assert.equal(normalizeSqlMode(null, "<select id=\"list\">select 1</select>"), "xml");
});

test("evaluateMyBatisTest supports common if expressions", () => {
  const params = { id: 1, name: "alice", empty: "", ids: [1, 2] };
  assert.equal(evaluateMyBatisTest("id != null and name != ''", params), true);
  assert.equal(evaluateMyBatisTest("empty != ''", params), false);
  assert.equal(evaluateMyBatisTest("ids.size > 0", params), true);
});

test("extractMyBatisSelectSql renders if and where tags", () => {
  const sql = extractMyBatisSelectSql(`
    <select id="list">
      select * from users
      <where>
        <if test="name != null and name != ''">
          and name = #{name}
        </if>
        <if test="status != null">
          and status = #{status}
        </if>
      </where>
    </select>
  `, { name: "alice", status: null });
  assert.equal(compactSql(sql), "select * from users where name = #{name}");
});

test("extractMyBatisSelectSql supports comparison operator in test attributes", () => {
  const sql = extractMyBatisSelectSql(`
    <select>
      select a.*, #{id}+10 as count from students a
      <where>
        <if test="id>0">
          and a.id = #{id}
        </if>
      </where>
    </select>
  `, { id: "2" });
  assert.equal(compactSql(sql), "select a.*, #{id}+10 as count from students a where a.id = #{id}");
});

test("extractMyBatisSelectSql renders foreach tags with generated params", () => {
  const params = { ids: [3, 5, 8] };
  const sql = extractMyBatisSelectSql(`
    <select id="list">
      select * from users where id in
      <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id}
      </foreach>
    </select>
  `, params);
  const compiled = compileNamedParams(sql, params);
  assert.equal(compactSql(compiled.sql), "select * from users where id in (?,?,?)");
  assert.deepEqual(compiled.values, [3, 5, 8]);
});

test("extractMyBatisSelectSql renders choose tags", () => {
  const sql = extractMyBatisSelectSql(`
    <select id="list">
      select * from users
      <where>
        <choose>
          <when test="name != null">and name = #{name}</when>
          <when test="status != null">and status = #{status}</when>
          <otherwise>and deleted_at is null</otherwise>
        </choose>
      </where>
    </select>
  `, { status: "active" });
  assert.equal(compactSql(sql), "select * from users where status = #{status}");
});

test("extractMyBatisSelectSql rejects unsafe dollar params", () => {
  assert.throws(() => extractMyBatisSelectSql(`
    <select id="list">
      select * from ${"${tableName}"}
    </select>
  `), /mybatis \$\{\} params are not allowed/);
});

test("prepareSqlExecution allows semicolon inside strings and comments", () => {
  const prepared = prepareSqlExecution({
    sqlMode: "sql",
    sqlText: `
      select ';' as semicolon_text -- comment with ;
      /* block comment with ; */
    `
  }, {});

  assert.match(prepared.debug.boundSql, /semicolon_text/);
});

test("prepareSqlExecution allows multiple query statements", () => {
  const prepared = prepareSqlExecution({
    sqlMode: "sql",
    sqlText: "select 1; select 2"
  }, {});

  assert.equal(compactSql(prepared.debug.boundSql), "select 1; select 2");
});

test("prepareSqlExecution allows temporary table batch sql", () => {
  const prepared = prepareSqlExecution({
    sqlMode: "sql",
    sqlText: `
      create temporary table tmp_students (id int);
      insert into tmp_students values (#{id});
      select * from tmp_students;
      drop temporary table tmp_students;
    `
  }, { id: 1 });

  assert.match(prepared.debug.boundSql, /create temporary table tmp_students/);
  assert.match(prepared.debug.boundSql, /insert into tmp_students values \(\?\)/);
  assert.deepEqual(prepared.debug.boundValues, [1]);
});

test("normalizeMysqlResultSets keeps only select result sets from mixed batch output", () => {
  const resultSets = normalizeMysqlResultSets([
    { affectedRows: 0 },
    [{ id: 7 }],
    { affectedRows: 1 },
    [{ total: 1 }]
  ], [
    undefined,
    [{ name: "id" }],
    undefined,
    [{ name: "total" }]
  ]);

  assert.deepEqual(resultSets, [
    { fields: ["id"], rows: [{ id: 7 }] },
    { fields: ["total"], rows: [{ total: 1 }] }
  ]);
});

test("prepareSqlExecution rejects writing to non-temporary tables", () => {
  assert.throws(() => prepareSqlExecution({
    sqlMode: "sql",
    sqlText: "insert into students values (1)"
  }, {}), /only query sql or temporary-table batch sql is allowed/);
});

test("prepareSqlExecution returns debug sql snapshots without row limit wrapping", () => {
  const params = { ids: [1, 2] };
  const prepared = prepareSqlExecution({
    databaseAlias: "default",
    sqlMode: "xml",
    sqlText: `
      <select id="list">
        select * from users where id in
        <foreach collection="ids" item="id" open="(" separator="," close=")">
          #{id}
        </foreach>
      </select>
    `
  }, params);
  assert.match(prepared.debug.originalSql, /<select/);
  assert.equal(compactSql(prepared.debug.renderedSql), "select * from users where id in (#{__foreach_id_0},#{__foreach_id_1})");
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.debug, "limitedSql"), false);
  assert.equal(compactSql(prepared.debug.boundSql), "select * from users where id in (?,?)");
  assert.deepEqual(prepared.debug.boundValues, [1, 2]);
});
