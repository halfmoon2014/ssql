const assert = require("node:assert/strict");
const path = require("path");
const test = require("node:test");
const { normalizeAppConfig, normalizeDatabaseConfig, parseJsonc } = require("../src/config");
const { resolveDatabaseSource } = require("../src/sqlExecutor");

const appEnvNames = [
  "PORT",
  "HOST",
  "SCRIPT_TIMEOUT_MS",
  "SQL_TIMEOUT_MS",
  "MAX_CALL_DEPTH",
  "SCRIPT_WORKER_MAX_OLD_MB",
  "SCRIPT_WORKER_MAX_YOUNG_MB",
  "SQL_POOL_MYSQL_WAIT_FOR_CONNECTIONS",
  "SQL_POOL_MYSQL_CONNECTION_LIMIT",
  "SQL_POOL_MYSQL_QUEUE_LIMIT",
  "SQL_POOL_MYSQL_CONNECT_TIMEOUT_MS",
  "SQL_POOL_MSSQL_MAX",
  "SQL_POOL_MSSQL_MIN",
  "SQL_POOL_MSSQL_IDLE_TIMEOUT_MS",
  "SQL_DATASOURCE_CONCURRENCY_ENABLED",
  "SQL_DATASOURCE_CONCURRENCY_MAX",
  "SQL_DATASOURCE_QUEUE_LIMIT",
  "SQL_DATASOURCE_QUEUE_TIMEOUT_MS",
  "FILE_CAPABILITY_TEMP_DIR",
  "FILE_CAPABILITY_MAX_BYTES",
  "FILE_CAPABILITY_TIMEOUT_MS",
  "FILE_CAPABILITY_MAX_REDIRECTS",
  "FILE_CAPABILITY_ALLOWED_PROTOCOLS",
  "FILE_CAPABILITY_ALLOWED_HOSTS",
  "FILE_CAPABILITY_ALLOW_PRIVATE_NETWORK",
  "SECURITY_ENABLED",
  "SECURITY_SECRET_KEY",
  "SECURITY_TOKEN_TTL_SECONDS",
  "SECURITY_TOTP_ISSUER",
  "SECURITY_TRUSTED_PROXIES",
  "SECURITY_ADMIN_IP_WHITELIST_REQUIRED"
];

async function withCleanAppEnv(callback) {
  const previous = Object.fromEntries(appEnvNames.map((name) => [name, process.env[name]]));
  for (const name of appEnvNames) delete process.env[name];
  try {
    return await callback();
  } finally {
    for (const name of appEnvNames) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

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

test("parseJsonc supports comments and trailing commas", () => {
  const config = parseJsonc(`
    {
      // line comments are allowed
      "server": {
        "url": "http://127.0.0.1:3015/a//b",
        "port": 3015,
      },
      /*
       * block comments are allowed
       */
      "enabled": true,
    }
  `);

  assert.deepEqual(config, {
    server: {
      url: "http://127.0.0.1:3015/a//b",
      port: 3015
    },
    enabled: true
  });
});

test("parseJsonc keeps comment markers inside strings", () => {
  const config = parseJsonc(`{
    "pattern": "/* not a comment */",
    "url": "https://example.com/path//file"
  }`);

  assert.deepEqual(config, {
    pattern: "/* not a comment */",
    url: "https://example.com/path//file"
  });
});

test("normalizeAppConfig reads runtime defaults from config object", async () => {
  await withCleanAppEnv(() => {
  const rootDir = path.resolve(__dirname, "..");
  const config = normalizeAppConfig({
    server: {
      port: 3010,
      host: "0.0.0.0"
    },
    paths: {
      dataDir: "data",
      publicDir: "public"
    },
    timeouts: {
      scriptMs: 1000,
      sqlMs: 5000
    },
    runtime: {
      maxCallDepth: 5,
      sqlExecution: {
        businessPool: {
          mysql: {
            connectionLimit: 12,
            queueLimit: 3,
            connectTimeoutMs: 9000
          },
          mssql: {
            max: 8,
            min: 1,
            idleTimeoutMillis: 45000
          }
        },
        datasourceConcurrency: {
          default: {
            enabled: true,
            max: 7,
            queueLimit: 30,
            queueTimeoutMs: 2500
          },
          sources: {
            erp: {
              max: 4
            }
          }
        }
      },
      scriptWorker: {
        maxOldGenerationSizeMb: 64,
        maxYoungGenerationSizeMb: 16
      }
    },
    capabilities: {
      files: {
        tempDir: "data/downloads",
        maxBytes: 10485760,
        timeoutMs: 5000,
        maxRedirects: 3,
        allowedProtocols: ["https:"],
        allowedHosts: ["Example.COM"],
        allowPrivateNetwork: false
      }
    },
    security: {
      enabled: true,
      secretKey: "test-secret",
      tokenTtlSeconds: 3600,
      totpIssuer: "Test API",
      trustedProxies: ["127.0.0.1"],
      adminIpWhitelistRequired: true
    }
  });

  assert.equal(config.port, 3010);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.dataDir, path.join(rootDir, "data"));
  assert.equal(config.publicDir, path.join(rootDir, "public"));
  assert.equal(config.scriptTimeoutMs, 1000);
  assert.equal(config.sqlTimeoutMs, 5000);
  assert.equal(config.maxCallDepth, 5);
  assert.deepEqual(config.scriptWorker, {
    maxOldGenerationSizeMb: 64,
    maxYoungGenerationSizeMb: 16
  });
  assert.deepEqual(config.sqlExecution, {
    businessPool: {
      mysql: {
        waitForConnections: true,
        connectionLimit: 12,
        queueLimit: 3,
        connectTimeoutMs: 9000
      },
      mssql: {
        max: 8,
        min: 1,
        idleTimeoutMillis: 45000
      }
    },
    datasourceConcurrency: {
      default: {
        enabled: true,
        max: 7,
        queueLimit: 30,
        queueTimeoutMs: 2500
      },
      sources: {
        erp: {
          enabled: true,
          max: 4,
          queueLimit: 30,
          queueTimeoutMs: 2500
        }
      }
    }
  });
  assert.equal(config.capabilities.files.tempDir, path.join(rootDir, "data", "downloads"));
  assert.deepEqual(config.capabilities.files.allowedProtocols, ["https:"]);
  assert.deepEqual(config.capabilities.files.allowedHosts, ["example.com"]);
  assert.deepEqual(config.security, {
    enabled: true,
    secretKey: "test-secret",
    tokenTtlSeconds: 3600,
    totpIssuer: "Test API",
    trustedProxies: ["127.0.0.1"],
    adminIpWhitelistRequired: true
  });
  });
});

test("normalizeAppConfig lets environment override config file values", async () => {
  await withCleanAppEnv(() => {
  process.env.PORT = "3099";
  process.env.SCRIPT_WORKER_MAX_OLD_MB = "96";
  process.env.FILE_CAPABILITY_ALLOWED_PROTOCOLS = "http:,https:";
  process.env.SECURITY_ENABLED = "true";
  process.env.SECURITY_TOKEN_TTL_SECONDS = "60";
  process.env.SECURITY_TRUSTED_PROXIES = "127.0.0.1,10.0.0.10";
  const config = normalizeAppConfig({
    server: { port: 3010, host: "127.0.0.1" },
    paths: { dataDir: "data", publicDir: "public" },
    timeouts: { scriptMs: 1000, sqlMs: 5000 },
    runtime: { maxCallDepth: 5 },
    capabilities: {
      files: {
        tempDir: "data/downloads",
        maxBytes: 100,
        timeoutMs: 1000,
        maxRedirects: 1,
        allowedProtocols: ["https:"],
        allowedHosts: [],
        allowPrivateNetwork: false
      }
    },
    security: { enabled: false, tokenTtlSeconds: 3600, trustedProxies: [] }
  });

  assert.equal(config.port, 3099);
  assert.equal(config.scriptWorker.maxOldGenerationSizeMb, 96);
  assert.deepEqual(config.capabilities.files.allowedProtocols, ["http:", "https:"]);
  assert.equal(config.security.enabled, true);
  assert.equal(config.security.tokenTtlSeconds, 60);
  assert.deepEqual(config.security.trustedProxies, ["127.0.0.1", "10.0.0.10"]);
  });
});
