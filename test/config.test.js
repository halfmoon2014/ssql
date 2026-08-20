const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeDatabaseConfig } = require("../src/config");
const { resolveDatabaseSource } = require("../src/sqlExecutor");

test("normalizeDatabaseConfig supports legacy mysql config", () => {
  const config = normalizeDatabaseConfig({
    mysql: {
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "pw",
      database: "app"
    }
  });

  assert.equal(config.defaultAlias, "default");
  assert.equal(config.sources.length, 1);
  assert.equal(config.sources[0].alias, "default");
  assert.equal(config.sources[0].type, "mysql");
  assert.equal(resolveDatabaseSource(config, { databaseAlias: "default" }).host, "127.0.0.1");
});

test("normalizeDatabaseConfig supports aliased mysql and mssql sources", () => {
  const config = normalizeDatabaseConfig({
    defaultAlias: "erp",
    connections: [
      { alias: "app", type: "mysql", host: "mysql.local", database: "app" },
      { alias: "erp", type: "mssql", server: "mssql.local", database: "erp" }
    ]
  });

  assert.equal(config.defaultAlias, "erp");
  assert.equal(config.sources.length, 2);
  assert.equal(resolveDatabaseSource(config, { databaseAlias: "app" }).type, "mysql");
  assert.equal(resolveDatabaseSource(config, { databaseAlias: "erp" }).server, "mssql.local");
});
