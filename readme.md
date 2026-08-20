# SQL API Web 程序设计文档

安装和启动说明见 [INSTALL.md](./INSTALL.md)。

当前实现中，API 配置和 API 调用日志保存到 `database.config.json` 中的 MySQL 数据源；业务查询数据源可按别名选择 MySQL 或 MSSQL；`data/server.log` 只保存服务端运行日志；每次动态 API 执行的调试快照保存到 `data/api-debug/`。

## 数据库配置 Demo

`database.config.json` 使用 `defaultAlias` 指定新建 API 默认数据源，`connections` 保存可选数据库列表。API 只保存 `databaseAlias`，运行时按别名找到对应连接。

```json
{
  "defaultAlias": "default",
  "connections": [
    {
      "alias": "default",
      "type": "mysql",
      "host": "192.168.3.2",
      "port": 3306,
      "user": "root",
      "password": "123456",
      "database": "dbgirl"
    },
    {
      "alias": "erp",
      "type": "mssql",
      "server": "192.168.3.10",
      "port": 1433,
      "user": "sa",
      "password": "password",
      "database": "erpdb",
      "options": {
        "encrypt": false,
        "trustServerCertificate": true
      }
    }
  ]
}
```

当前支持的 `type` 是 `mysql` 和 `mssql`。后续扩展其它数据库时，需要补对应驱动、占位符编译规则和执行器。

## 1. 需求

开发一个 Web 程序，用于创建和管理 API 列表。每个 API 支持通过 SQL 查询数据，并支持使用 JS 在 SQL 前处理入参、在 SQL 后处理结果集。API 内部可以调用其它 API。

核心需求:

- 创建 API 列表。
- API 支持直接编写 SQL 查询数据。
- API 支持选择数据库别名执行查询，当前支持 MySQL 和 MSSQL。
- API 支持使用 JS 在 SQL 前处理入参，也支持使用 JS 处理 SQL 查询结果。
- API 内部支持调用其它 API。
- 后台需要支持通过管理测试接口测试 API。
- JS 保存后，可以通过管理测试接口测试处理效果。

## 2. 设计方案

### 2.1 系统目标

- 开发一个 Web 程序，用于在线创建、维护和发布 API。
- API 的主要逻辑由 SQL 查询和 JS 数据处理脚本组成。
- API 可以在受控环境中调用系统内其它 API。
- 系统需要提供权限控制、版本管理、执行日志和错误追踪能力。

### 2.2 功能模块

- 登录与权限模块: 负责后台登录、用户管理、角色管理和接口访问控制。
- API 管理模块: 负责 API 的新增、编辑、删除、启用、停用、复制和搜索。
- SQL 配置模块: 负责维护 API 对应的 SQL 查询语句、参数定义和数据源。
- JS 脚本模块: 负责维护 SQL 前参数处理逻辑和 SQL 后结果集处理逻辑。
- API 执行模块: 负责匹配请求、校验权限、执行 SQL、运行 JS、组装响应。
- API 测试模块: 负责通过管理测试接口用测试参数执行完整 API，并返回请求、SQL 结果、JS 结果、耗时和错误。
- JS 测试模块: 负责通过管理测试接口使用测试参数或 SQL 查询结果运行脚本，并返回最终处理效果。
- 内部调用模块: 提供 API 之间互相调用的能力，并防止循环调用。
- 日志模块: 记录 API 请求、执行耗时、错误信息、SQL 参数和调用链。
- 版本模块: 保存 API 配置变更历史，支持查看差异和回滚。

### 2.3 API 配置内容

- API 名称。
- API 路径，例如 `/api/order/list`。
- 请求方法，例如 `GET`、`POST`。
- API 状态，例如草稿、已发布、已停用。
- 数据库别名，例如 `default`、`erp`。
- 请求参数定义，包括参数名、类型、是否必填、默认值、说明。
- 权限配置，包括公开访问、登录访问、角色访问。
- 数据源配置。
- SQL 查询配置。
- JS 参数处理脚本，用于在执行 SQL 前调整入参或直接返回数据。
- JS 结果集处理脚本，用于处理 SQL 查询结果。
- 测试参数配置，用于通过管理测试接口调试 SQL、JS 和完整 API。
- 返回结构说明。
- 备注说明。

### 2.4 执行流程

1. 接收 HTTP 请求。
2. 根据请求路径和方法匹配 API 配置。
3. 校验 API 是否启用。
4. 校验用户登录状态和访问权限。
5. 校验请求参数，并填充默认值。
6. 如配置了 JS 参数处理脚本，先运行脚本并得到新的 SQL 入参。
7. 如果参数处理脚本返回直接响应标记，则跳过 SQL 和结果集脚本，直接返回数据。
8. 使用处理后的参数绑定方式执行 SQL。
9. 将 SQL 结果、处理后的请求参数、请求头和上下文传入 JS 结果集处理脚本。
10. JS 结果集处理脚本处理数据并返回最终结果。
11. 如果 JS 脚本调用其它 API，系统记录调用链并校验调用深度。
12. 写入请求日志和执行日志。

### 2.5 SQL 设计

- SQL 只允许使用参数占位符读取请求参数，例如 `#{userId}`。
- SQL 输入支持纯 SQL 和基础 MyBatis XML 两种格式。
- SQL 模式作为 API 配置保存，运行时按保存的模式选择原生 SQL 或 MyBatis XML 执行路径。
- MyBatis XML 支持 `#{param}` 参数绑定和 `<if>`、`<where>`、`<foreach>`、`<choose>`、`<when>`、`<otherwise>` 动态标签子集。
- MyBatis XML 禁止使用 `${param}` 拼接参数。
- SQL 执行时必须使用参数绑定，禁止拼接用户输入。
- 默认只允许查询语句。
- 如需支持写入、更新、删除，必须单独配置开关和权限。
- SQL 执行需要设置超时时间。
- 系统不再自动追加最大行限制；需要限制返回量时由 SQL 自身显式控制。
- SQL 错误不能把数据库敏感信息直接返回给前端。

### 2.6 JS 脚本设计

- JS 处理分为两类：`1 参数处理` 在 SQL 执行前运行，`2 结果集处理` 在 SQL 执行后运行。
- 参数处理脚本可以返回新的参数对象，也可以返回 `{ directReturn: true, data }` 跳过 SQL 并直接返回 `data`。
- 结果集处理脚本负责数据处理、字段转换、结果组装和内部 API 调用；原有 JS 脚本归入结果集处理。
- JS 脚本运行在沙箱环境中。
- 禁止 JS 脚本访问本地文件、系统命令、进程环境变量和外部网络。
- JS 脚本需要设置执行超时时间。
- JS 脚本必须返回可 JSON 序列化的数据。

JS 脚本的 `main()` 函数只接收 1 个对象入参，对象中包含以下 6 个字段:

- `params`: 请求参数。先由 URL Query 和 JSON Body 合并，再按接口参数定义填充默认值；如果配置了参数处理脚本，则结果集处理阶段拿到的是参数处理后的最终入参。
- `headers`: 请求头。系统只传入过滤后的普通请求头，不包含敏感凭据。
- `rows`: SQL 第一个结果集的行数组；参数处理阶段还没有执行 SQL，因此固定为空数组。
- `resultSets`: SQL 返回的全部结果集，格式为 `[{ fields, rows }]`；参数处理阶段固定为空数组，结果集处理阶段推荐直接 `return resultSets` 返回多结果集。
- `context`: 当前请求上下文，包含 `requestId`、`userId`、`roles`、`callDepth`、`callChain` 等可序列化信息。
- `callApi`: 内部 API 调用方法，格式为 `await callApi("/api/xxx", { id: 1 })`。

参数处理脚本和结果集处理脚本使用同一套入参结构，但运行时机不同:

- `1 参数处理`: 在 SQL 前执行，此时 `rows` 和 `resultSets` 都为空；返回普通对象或 `{ params: {...} }` 会继续执行 SQL；返回 `{ directReturn: true, data: ... }` 会跳过 SQL 和结果集处理，直接把 `data` 作为 API 响应。
- `2 结果集处理`: 在 SQL 后执行，此时可以读取 `rows` 和 `resultSets`；返回值就是动态 API 的最终响应体。

### 2.7 API 内部调用设计

- 通过 `callApi(path, params)` 调用系统内其它 API。
- 内部调用需要复用当前用户身份和权限上下文。
- 调用深度默认最多 5 层。
- 同一次请求中不允许出现循环调用。
- 内部调用同样需要记录日志。
- 内部调用失败时，需要返回明确的错误码和错误信息。

### 2.8 动态 API 响应

动态 API 成功响应不做统一包装，直接返回 JS 脚本 `main` 函数的返回值。

如果脚本返回:

```json
{
  "total": 1,
  "list": [
    {
      "id": 1,
      "name": "Alice"
    }
  ]
}
```

客户端收到的响应就是:

```json
{
  "total": 1,
  "list": [
    {
      "id": 1,
      "name": "Alice"
    }
  ]
}
```

后台管理接口仍使用管理端响应格式，供前端页面判断保存、发布和停用操作是否成功。

### 2.9 基础表设计

- `api_definitions`: 保存 API 基本信息、路径、方法、状态、权限配置。
- `api_sql_configs`: 保存 API 对应的 SQL、数据源别名和超时时间。
- `api_script_configs`: 保存 API 对应的 JS 脚本。
- `api_versions`: 保存 API 每次发布的配置快照。
- `api_call_logs`: 保存 API 请求日志、耗时、状态、错误和调用链。
- `data_sources`: 保存数据库连接配置。
- `users`: 保存后台用户。
- `roles`: 保存角色。
- `user_roles`: 保存用户和角色关系。

## 3. 开发规则

### 3.1 基础规则

- 所有接口默认返回 JSON。
- 后端接口必须有明确的错误码和错误信息。
- 业务代码中不能直接输出敏感配置、数据库连接串、令牌和密码。
- 所有用户输入必须校验类型、长度和必填项。
- 重要操作必须写操作日志。

### 3.2 API 开发规则

- API 路径必须唯一。
- API 路径统一以 `/api/` 开头。
- API 发布前必须通过参数校验、SQL 校验和 JS 脚本校验。
- 停用 API 后，外部请求必须返回明确错误。
- API 删除建议使用软删除，避免误删配置和历史记录。

### 3.3 SQL 开发规则

- 禁止把请求参数直接拼接进 SQL。
- 必须使用参数占位符和参数绑定。
- 默认禁止执行 `DROP`、`TRUNCATE`、`ALTER` 等高危语句。
- 默认禁止多语句执行。
- 查询返回范围由 SQL 自身控制，必要时在 SQL 中显式编写 `limit`、`top` 或对应数据库语法。
- 慢 SQL 必须记录日志。

### 3.4 JS 开发规则

- JS 脚本中不能访问文件系统。
- JS 脚本中不能执行系统命令。
- JS 脚本中不能直接访问外部网络。
- JS 脚本执行必须有超时限制。
- JS 脚本返回值必须是对象、数组、字符串、数字、布尔值或 `null`。
- JS 脚本报错时，外部响应只返回安全错误信息，详细堆栈只写入服务端日志。

### 3.5 权限规则

- 管理后台必须登录后访问。
- SQL 编辑、JS 编辑、API 发布、API 删除只允许管理员或授权角色操作。
- API 运行时必须校验访问权限。
- 内部 API 调用不能绕过权限校验。
- 用户密码必须加密存储。

### 3.6 日志规则

- 每次 API 请求必须记录请求时间、路径、方法、耗时、状态码。
- 执行失败时必须记录错误类型和错误信息。
- 内部 API 调用必须记录父调用 ID。
- 日志中不能记录密码、令牌等敏感字段。
- 日志需要支持按 API、时间、状态和请求 ID 查询。
- 每次动态 API 执行需要保存调试快照，包含入参、原始 SQL、转换后 SQL、绑定参数、JS 脚本和错误信息。

### 3.7 测试规则

- API 执行流程必须有单元测试。
- SQL 参数绑定必须有测试。
- JS 沙箱限制必须有测试。
- API 内部调用和循环调用检测必须有测试。
- 权限校验必须有测试。
- 关键接口需要补充集成测试。

### 3.8 代码规则

- 代码分层清晰，避免把路由、业务逻辑、数据库操作全部写在一个文件里。
- 配置读取统一封装，业务代码不要直接散落读取环境变量。
- 公共错误处理统一封装。
- 数据库访问统一封装。
- 命名要表达业务含义，避免无意义缩写。
- 提交代码前必须通过格式化、静态检查和测试。

## 4. 实现方案

### 4.1 技术选型

- 前端: Vue 3 或 React，用于实现后台管理页面。
- 后端: Node.js + NestJS 或 Express，用于实现管理接口和动态 API 执行。
- 数据库: PostgreSQL 或 MySQL，用于保存 API 配置、用户、角色和日志。
- SQL 执行: 使用数据库官方驱动或成熟 ORM 的原生查询能力。
- JS 沙箱: 使用 `isolated-vm`、`vm2` 或独立 Worker 进程执行用户脚本。
- 鉴权: 使用 JWT 或 Session。
- 日志: 使用结构化日志，保存到数据库或日志文件。

### 4.2 推荐目录结构

```text
src/
  config/              # 配置读取
  common/              # 公共响应、错误、工具函数
  auth/                # 登录、鉴权、权限校验
  users/               # 用户管理
  roles/               # 角色管理
  data-sources/        # 数据源管理
  api-definitions/     # API 基础信息管理
  api-sql/             # SQL 配置、SQL 校验、SQL 执行
  api-scripts/         # JS 脚本配置、脚本校验、脚本执行
  api-runtime/         # 动态 API 匹配和执行引擎
  api-logs/            # 请求日志和调用链日志
  api-versions/        # API 版本管理
  database/            # 数据库连接、迁移脚本
  main.ts              # 程序入口
```

### 4.3 后端核心实现

- 启动时加载配置、连接数据库、初始化路由。
- 管理接口使用固定路由，例如 `/admin/apis`、`/admin/users`。
- 动态 API 使用统一入口，例如 `/api/*`。
- 客户端调用动态 API 时，请求 URL 使用服务地址加 API 配置路径，例如 `http://127.0.0.1:3010/api/order/list`，请求方法必须和 API 配置一致。
- 客户端请求参数可以通过 URL Query 或 JSON Body 传入，系统会合并两者；同名参数以 JSON Body 为准。
- 请求进入 `/api/*` 后，由 `api-runtime` 根据路径和方法查询 API 配置。
- 找到 API 后，依次执行权限校验、参数校验、参数处理 JS、SQL 执行、结果集处理 JS、日志写入。
- 所有异常统一进入错误处理中间件，返回统一错误结构。

### 4.4 前端页面实现

- 登录页面: 输入账号密码并保存登录状态。
- API 列表页: 展示 API 名称、路径、方法、状态、更新时间，支持搜索和筛选。
- API 编辑页: 编辑基础信息、请求参数、SQL、JS 脚本、权限和返回说明。
- API 编辑页不提供测试按钮，负责编辑和保存 API 配置。
- 接口调试通过管理测试接口完成，避免编辑页面混入测试操作。
- 发布确认页: 展示本次变更内容，确认后发布版本。
- 日志页面: 按 API、时间、状态、请求 ID 查看调用日志。
- 版本页面: 查看历史版本、差异和回滚。

### 4.5 数据库表结构

```sql
create table api_definitions (
  id bigint primary key generated always as identity,
  name varchar(100) not null,
  path varchar(255) not null,
  method varchar(20) not null,
  status varchar(20) not null default 'draft',
  description text,
  permission_type varchar(30) not null default 'login',
  required_roles json,
  request_params json,
  database_alias varchar(100) not null default 'default',
  response_schema json,
  deleted_at timestamp null,
  created_by bigint,
  updated_by bigint,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  unique (path, method)
);

create table api_sql_configs (
  id bigint primary key generated always as identity,
  api_id bigint not null,
  data_source_id bigint not null,
  sql_text text not null,
  sql_mode varchar(20) not null default 'sql',
  timeout_ms int not null default 5000,
  allow_write boolean not null default false,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table api_script_configs (
  id bigint primary key generated always as identity,
  api_id bigint not null,
  param_script_text text,
  script_text text not null,
  timeout_ms int not null default 1000,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table data_sources (
  id bigint primary key generated always as identity,
  name varchar(100) not null,
  db_type varchar(30) not null,
  host varchar(255) not null,
  port int not null,
  database_name varchar(100) not null,
  username varchar(100) not null,
  password_secret varchar(255) not null,
  status varchar(20) not null default 'enabled',
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create table api_versions (
  id bigint primary key generated always as identity,
  api_id bigint not null,
  version_no int not null,
  snapshot json not null,
  created_by bigint,
  created_at timestamp not null default current_timestamp,
  unique (api_id, version_no)
);

create table api_call_logs (
  id bigint primary key generated always as identity,
  request_id varchar(64) not null,
  parent_request_id varchar(64),
  api_id bigint,
  path varchar(255) not null,
  method varchar(20) not null,
  status_code int not null,
  duration_ms int not null,
  error_message text,
  call_chain json,
  created_at timestamp not null default current_timestamp
);
```

### 4.6 动态 API 执行伪代码

```text
handleRequest(request):
  requestId = createRequestId()
  api = findApiByPathAndMethod(request.path, request.method)

  if api not found:
    return error(404, "api not found")

  if api.status != "published":
    return error(403, "api is not published")

  checkPermission(request.user, api.permission)
  params = validateAndBuildParams(request, api.requestParams)
  paramResult = runParamScript(api.paramScriptText, params)

  if paramResult.directReturn:
    writeLog(requestId, api, success)
    return paramResult.data

  params = paramResult.params

  rows = executeSql({
    databaseAlias: api.databaseAlias,
    sql: api.sqlConfig.sqlText,
    params: params,
    timeout: api.sqlConfig.timeoutMs
  })

  data = runScript({
    script: api.scriptConfig.scriptText,
    params: params,
    headers: request.headers,
    rows: rows,
    context: requestContext,
    callApi: internalCallApi
  })

  writeLog(requestId, api, success)
  return data
```

### 4.7 SQL 执行实现

- SQL 中使用 `#{参数名}` 引用请求参数，例如 `#{userId}`、`#{status}`、`#{startDate}`。
- API 通过 `databaseAlias` 选择数据源，数据源配置通过 `alias` 和 `type` 区分，当前支持 `mysql`、`mssql`。
- SQL 模式保存为 `sqlMode` / `sql_mode`，执行时按保存的模式处理，而不是单纯依赖内容自动识别。
- SQL 也可以使用基础 MyBatis XML，系统会提取单个 `<select>` 内容并渲染支持的动态标签。
- MyBatis 参数使用 `#{参数名}`，支持 `#{id, jdbcType=INTEGER}` 这类带选项写法。
- MyBatis 动态标签当前支持 `<if>`、`<where>`、`<foreach>`、`<choose>`、`<when>`、`<otherwise>`，不支持完整 MyBatis 语法。
- 参数名必须以字母或下划线开头，只能包含字母、数字和下划线。
- SQL 参数会编译成数据库驱动的绑定参数，不需要也不允许手动拼接用户输入。
- MySQL 参数编译成 `?`，MSSQL 参数编译成 `@p0`、`@p1`。
- 参数占位符不要写在字符串引号里，例如使用 `where id = #{userId}`，不要写 `where id = '#{userId}'`。
- 同一个参数可以在 SQL 中多次引用，每次引用都会绑定同一个参数值。
- 解析 SQL 中的参数占位符，得到参数名列表。
- 根据 API 参数定义检查请求参数是否完整。
- 将参数交给数据库驱动做绑定。
- SQL 执行前做静态检查，支持多条查询语句和临时表批处理，禁止写入真实业务表和高危关键字。
- 多结果集会整理为 `resultSets`，结果集处理脚本可以直接返回 `resultSets`。
- 查询类 SQL 不自动追加行数限制，需要限制时由 SQL 自身显式控制。
- 执行超时后中断查询，并记录超时日志。

### 4.8 JS 沙箱实现

- 每次执行脚本创建独立上下文。
- 只向脚本暴露 `params`、`headers`、`rows`、`resultSets`、`context`、`callApi`。
- 不暴露 `require`、`process`、`global`、文件系统和网络模块。
- 使用超时控制终止长时间运行脚本。
- 对脚本返回值做 JSON 序列化检查。
- 对脚本异常做脱敏处理后返回。
- 参数处理脚本返回普通对象时作为新的 SQL 入参；返回 `{ params: {...} }` 时使用其中的 `params`。
- 参数处理脚本返回 `{ directReturn: true, data: ... }` 时，动态 API 不再执行 SQL 和结果集处理脚本。

### 4.9 `runScript` 实现方案

`runScript` 负责把用户配置的 JS 脚本放进受控沙箱执行。推荐使用 `isolated-vm` 实现隔离，不建议直接使用 Node.js 内置 `vm` 执行不可信脚本。

用户脚本不直接写完整程序，只需要提供一个 `main` 处理函数。`main()` 只接收 1 个对象入参，当前可解构使用 6 个字段:

```js
async function main({ params, headers, rows, resultSets, context, callApi }) {
  return resultSets;
}
```

字段含义:

- `params`: 当前 API 入参。参数处理阶段是请求入参和默认值合并后的对象；结果集处理阶段是参数处理脚本返回后的最终 SQL 入参。
- `headers`: 过滤后的请求头，只包含允许暴露给脚本的普通 header。
- `rows`: 第一个 SQL 结果集的行数组。SQL 前参数处理阶段固定为 `[]`。
- `resultSets`: 全部 SQL 结果集，格式为 `[{ fields, rows }]`。多条 `select` 会产生多个结果集。
- `context`: 请求上下文，常用字段有 `requestId`、`userId`、`roles`、`callDepth`、`callChain`。
- `callApi`: 内部 API 调用函数，调用方式为 `await callApi(path, params)`。

参数处理脚本示例:

```js
async function main({ params, callApi }) {
  return {
    ...params,
    id: Number(params.id)
  };
}
```

需要直接返回时，参数处理脚本可以这样写:

```js
async function main({ params }) {
  if (!params.id) {
    return { directReturn: true, data: { code: 400, message: "缺少 id" } };
  }
  return params;
}
```

结果集处理脚本同样只需要提供 `main`，默认直接返回全部结果集:

```js
async function main({ params, headers, resultSets, context, callApi }) {
  return resultSets;
}
```

执行流程:

```text
runScript(input):
  validateScriptText(input.script)
  create isolate with memory limit
  create context
  inject safe values: params, headers, rows, resultSets, context
  inject safe function: callApi
  wrap user script as async main function
  execute script with timeout
  wait result
  validate result can be JSON serialized
  return result
```

TypeScript 伪代码:

```ts
type RunScriptInput = {
  script: string;
  params: Record<string, unknown>;
  headers: Record<string, unknown>;
  rows: unknown[];
  resultSets: Array<{
    fields: unknown[];
    rows: unknown[];
  }>;
  context: {
    requestId: string;
    userId?: number;
    roles?: string[];
    callDepth: number;
    callChain: string[];
  };
  callApi: (path: string, params: Record<string, unknown>) => Promise<unknown>;
  timeoutMs: number;
};

async function runScript(input: RunScriptInput): Promise<unknown> {
  validateScriptText(input.script);

  const sandbox = createSandbox({
    memoryLimitMb: 32,
    timeoutMs: input.timeoutMs
  });

  sandbox.setValue("params", deepClone(input.params));
  sandbox.setValue("headers", filterHeaders(input.headers));
  sandbox.setValue("rows", deepClone(input.rows));
  sandbox.setValue("resultSets", deepClone(input.resultSets));
  sandbox.setValue("context", buildSafeContext(input.context));
  sandbox.setFunction("callApi", async (path, params) => {
    validateInternalApiCall(path, params, input.context);
    return input.callApi(path, params);
  });

  const wrappedScript = `
    ${input.script}
    Promise.resolve(main({ params, headers, rows, resultSets, context, callApi }))
  `;

  const result = await sandbox.run(wrappedScript);
  assertJsonSerializable(result);
  return result;
}
```

`validateScriptText` 基础校验:

- 脚本不能为空。
- 脚本长度不能超过限制。
- 必须包含 `main` 函数。
- 禁止出现明显危险关键字，例如 `require`、`process`、`global`、`Buffer`、`child_process`、`fs`。

`createSandbox` 能力限制:

- 限制内存。
- 限制执行时间。
- 不提供 Node.js 原生模块。
- 不提供外部网络能力。
- 不共享主进程对象引用。

`callApi` 注入规则:

- 只能调用系统内 `/api/` 开头的 API。
- 不能调用后台管理接口。
- 调用时复用当前用户身份。
- 调用前检查调用深度和循环调用。
- 调用结果需要深拷贝后再返回给脚本。

返回值规则:

- 允许返回对象、数组、字符串、数字、布尔值和 `null`。
- 禁止返回函数、类实例、循环引用、`undefined`、`Symbol`。
- 返回数据大小需要限制，避免接口响应过大。

异常处理:

- 脚本语法错误返回 `400`。
- 脚本执行超时返回 `408`。
- 脚本运行异常返回 `500`。
- 外部响应只返回脱敏错误信息。
- 完整错误堆栈只写入服务端日志。

### 4.10 内部 API 调用实现

- `callApi(path, params)` 不走真实 HTTP 请求，直接调用 `api-runtime`。
- 内部调用复用当前请求的用户身份、权限和请求 ID。
- 每次调用把当前 API 加入调用链。
- 执行前检查调用链中是否已经存在相同 API。
- 超过最大调用深度时直接返回错误。
- 父子调用日志通过 `request_id` 和 `parent_request_id` 关联。

### 4.11 管理接口清单

- `POST /admin/login`: 登录。
- `GET /admin/database-sources`: 获取脱敏后的数据库别名列表。
- `GET /admin/apis`: 查询 API 列表，支持 `name`、`sql`、`page`、`pageSize` 查询参数。
- `POST /admin/apis`: 创建 API。
- `GET /admin/apis/:id`: 查看 API 详情。
- `PUT /admin/apis/:id`: 更新 API。
- `POST /admin/apis/:id/publish`: 发布 API。
- `POST /admin/apis/:id/disable`: 停用 API。
- `DELETE /admin/apis/:id`: 删除 API。
- `POST /admin/apis/:id/test-sql`: 测试 SQL。
- `POST /admin/apis/:id/test-script`: 测试 JS 脚本。
- `POST /admin/apis/:id/test-api`: 测试完整 API。
- `GET /admin/apis/:id/versions`: 查看版本列表。
- `POST /admin/apis/:id/versions/:versionId/rollback`: 回滚版本。
- `GET /admin/logs`: 查询请求日志。
- `GET /admin/data-sources`: 查询数据源。
- `POST /admin/data-sources`: 创建数据源。

### 4.12 前端编辑器实现

- SQL 使用 CodeMirror 编辑器，支持 SQL 语法高亮、行号、缩进、括号匹配、括号自动补全和代码提示。
- JS 处理使用 CodeMirror 编辑器，支持 JavaScript 语法高亮、行号、缩进、括号匹配、括号自动补全和代码提示。
- 编辑页提供示例参数 JSON，执行 SQL 时不会根据 SQL 自动回填示例参数。
- JS 处理编辑器提供类型选择：`1 参数处理` 保存为 SQL 前脚本，`2 结果集处理` 保存为 SQL 后脚本。
- 编辑页可执行 SQL，并在日志框中显示参数、行数、字段名和查询结果。
- SQL 执行成功后，后台返回字段元数据；JS 编辑器根据字段提供 `rows[0].字段`、`row.字段` 补全。
- SQL 执行结果按接口名称缓存到浏览器本地存储；再次打开接口时优先恢复缓存字段，用于 JS 编辑器默认补全。
- 参数定义使用表格编辑，支持类型、必填、默认值、说明。
- API 编辑页只提供保存、发布和停用操作，不提供 SQL、JS 或完整 API 测试按钮。
- API 列表支持按名称和 SQL 内容查找，并支持分页。
- SQL、JS 和完整 API 测试通过管理测试接口完成，测试逻辑必须复用真实 API 执行流程。
- 发布前展示校验结果和变更摘要。
- 保存草稿和发布分开，避免未验证配置直接影响线上 API。

### 4.13 错误码建议

- `0`: 管理接口成功。
- `400`: 请求参数错误。
- `401`: 未登录。
- `403`: 无权限或 API 未发布。
- `404`: API 不存在。
- `408`: SQL 或 JS 执行超时。
- `409`: API 路径冲突或循环调用。
- `500`: 系统内部错误。

### 4.14 开发步骤

1. 搭建后端项目、数据库连接、配置模块、管理接口响应和动态 API 直接响应。
2. 实现用户登录、JWT 鉴权和角色权限。
3. 实现 API 基础信息、SQL 配置、JS 配置的增删改查。
4. 实现动态 API 执行入口。
5. 实现 SQL 参数绑定、SQL 校验和超时控制。
6. 实现 JS 沙箱执行和返回值校验。
7. 实现 SQL 测试、JS 测试和完整 API 测试的管理接口。
8. 实现内部 API 调用、调用链和循环调用检测。
9. 实现请求日志、错误日志和日志查询。
10. 实现版本快照、发布和回滚。
11. 实现前端管理页面。
12. 补齐单元测试、集成测试和部署文档。

### 4.15 最小可用版本范围

- 支持管理员登录。
- 支持创建 API。
- 支持配置请求路径、请求方法、参数、SQL 和 JS。
- 支持发布 API。
- 支持通过 `/api/*` 调用已发布 API。
- 支持 SQL 参数绑定。
- 支持 JS 处理 SQL 结果。
- 支持通过管理测试接口测试完整 API。
- 支持通过管理测试接口测试 JS 处理效果。
- 支持 API 调用日志。

### 4.16 后续扩展

- 支持多个数据源。
- 支持 API 分组和标签。
- 支持导入导出 API 配置。
- 支持接口文档自动生成。
- 支持限流、缓存和熔断。
- 支持灰度发布。
- 支持更多脚本语言或可视化数据处理。

### 其它

运行命令npm run dev 

本地1433端口开放,wsl能ping 通,但端口打不开
已阅读 12 个网页
这个问题很典型，核心原因是 WSL2 默认使用 NAT（网络地址转换）网络，和 Windows 主机不在同一个网络段。所以，虽然能 ping 通（ICMP 协议走通了），但 TCP 端口（如 1433）的连接被隔离了。这更像是网络路径没通，而不是服务本身的问题。

解决思路有两个方向：一是“搞定防火墙”，二是“搭建桥梁”。

💡 核心解决思路
检查并配置防火墙：最重要的第一步，确保 Windows 防火墙允许来自 WSL 所在网络的连接。

通过端口转发“搭桥”：如果防火墙没问题，就需要通过 netsh 命令设置端口转发，把 Windows 对 1433 端口的请求，导到 WSL 的真实 IP 上。这是一个很稳妥的办法。

🔧 详细操作步骤
第一步：找到 WSL 的 IP 地址
在 WSL 终端里执行，记下这个地址，后面要用：

bash
hostname -I
第二步：在 Windows 防火墙放行 WSL 子网
用管理员身份打开 PowerShell，执行下面的命令。这条规则会让 Windows 防火墙允许来自本地子网的连接访问 1433 端口：

powershell
netsh advfirewall firewall add rule name="WSL_SQL" dir=in protocol=tcp action=allow localport=1433 remoteip=localsubnet profile=any
第三步：设置端口转发（关键）
还是在 管理员 PowerShell 里，用第一步查到的 WSL IP 替换 <你的WSL_IP>：

powershell
netsh interface portproxy add v4tov4 listenport=1433 listenaddress=0.0.0.0 connectport=1433 connectaddress=<你的WSL_IP>
这条命令，相当于在 Windows 上开了一扇门（0.0.0.0:1433），把所有进来的请求都转送给 WSL 的内部 IP。
