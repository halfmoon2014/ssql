# 业务连接池和数据源并发限制

## 1. 目的

动态 API 执行 SQL 时会访问业务数据库。为了避免高并发请求把业务库连接打满，系统现在对业务 SQL 做两层保护:

- 业务连接池: 每个数据源 alias 复用一个 MySQL/MSSQL 连接池，避免每次请求新建连接。
- 数据源并发限制: 每个数据源 alias 同时执行 SQL 的请求数有限制，超过后进入短队列。

元数据库连接池在 `src/store.js` 中维护；本文只说明动态 API 访问的业务数据库连接池。

## 2. 配置位置

配置在 `app.config.jsonc` 的 `runtime.sqlExecution`:

```jsonc
{
  "runtime": {
    "sqlExecution": {
      "businessPool": {
        "mysql": {
          "connectionLimit": 10,
          "queueLimit": 0,
          "connectTimeoutMs": 10000
        },
        "mssql": {
          "max": 10,
          "min": 0,
          "idleTimeoutMillis": 30000
        }
      },
      "datasourceConcurrency": {
        "default": {
          "enabled": true,
          "max": 10,
          "queueLimit": 100,
          "queueTimeoutMs": 3000
        },
        "sources": {
          "erp": {
            "max": 5,
            "queueLimit": 50,
            "queueTimeoutMs": 3000
          }
        }
      }
    }
  }
}
```

说明:

- `businessPool.mysql.connectionLimit`: 每个 MySQL 业务数据源连接池最大连接数。
- `businessPool.mysql.queueLimit`: MySQL 驱动内部等待队列。通常保持 `0`，由系统自己的数据源并发限制控制队列。
- `businessPool.mysql.connectTimeoutMs`: MySQL 建立连接超时。
- `businessPool.mssql.max`: 每个 MSSQL 业务数据源连接池最大连接数。
- `datasourceConcurrency.default.max`: 每个数据源同时执行 SQL 的最大请求数。
- `datasourceConcurrency.default.queueLimit`: 超过并发上限后，允许等待的请求数。
- `datasourceConcurrency.default.queueTimeoutMs`: 排队等待多久还没拿到执行名额就失败。
- `datasourceConcurrency.sources`: 按数据源 alias 覆盖默认并发限制。

建议让 `datasourceConcurrency.*.max` 小于或等于对应业务连接池大小。否则请求可能通过系统限流后继续排在数据库驱动内部，不利于快速失败和排查。

## 3. 返回错误

超过并发限制时:

```text
HTTP 429
too many sql requests
```

含义: 当前数据源正在执行的 SQL 已达到 `max`，等待队列也已达到 `queueLimit`。

排队超时时:

```text
HTTP 503
sql concurrency queue timeout
```

含义: 请求进入等待队列，但在 `queueTimeoutMs` 内没有拿到执行名额。

测试 SQL 或测试 JS 被前端中断时:

```text
HTTP 499
sql test aborted
```

含义: 浏览器取消请求，系统会释放并发名额；MySQL 会销毁当前查询连接，MSSQL 会取消当前 request。

## 4. 实现位置

```text
src/concurrencyLimiter.js
  ConcurrencyLimiter
  - 控制 max、queueLimit、queueTimeoutMs
  - 队列满返回 429
  - 队列等待超时返回 503
  - 请求中断返回 499

src/sqlExecutor.js
  getMysqlPool()
  - 按业务数据源 alias 复用 MySQL pool

  getConnectedMssqlPool()
  - 按业务数据源 alias 复用 MSSQL ConnectionPool

  executeSqlWithFields()
  - 编译 SQL 后、真正访问数据库前，按数据源拿并发令牌
  - SQL 执行完成或失败后在 finally 中释放令牌

src/server.js
  shutdown()
  - 服务退出时关闭元数据库连接池和业务数据库连接池
```

## 5. 调参建议

初始值可以按数据库承载能力保守设置:

```text
小型业务库: max=5, queueLimit=30, queueTimeoutMs=3000
中型业务库: max=10, queueLimit=100, queueTimeoutMs=3000
只读报表库: max=20, queueLimit=200, queueTimeoutMs=5000
```

如果经常出现 `too many sql requests`，说明瞬时流量超过配置，先看业务库 CPU、慢 SQL 和连接数，再决定是否上调 `max`。

如果经常出现 `sql concurrency queue timeout`，说明请求能进入队列但消化太慢，通常要优化 SQL、增加索引、拆分热点 API，或者降低调用方并发。
