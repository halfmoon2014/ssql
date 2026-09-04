# 安装说明

## 1. 环境要求

- Node.js 22 或更高版本。
- npm 10 或更高版本。
- MySQL 数据库可以从当前机器访问，用于保存 API 配置和调用日志。
- 业务查询数据源支持 MySQL 和 MSSQL。

检查命令:

```bash
node -v
npm -v
```

## 2. 安装依赖

在项目根目录执行:

```bash
npm install
```

## 3. 配置数据库

数据库配置文件是项目根目录下的 `database.config.json`。

当前配置示例:

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

字段说明:

- `defaultAlias`: 新建 API 默认选择的数据源别名。
- `connections[].alias`: 数据源别名，API 配置中保存这个值。
- `connections[].type`: 数据库类型，当前支持 `mysql`、`mssql`，后续可继续扩展。
- `host` / `server`: 数据库地址，MySQL 通常使用 `host`，MSSQL 通常使用 `server`。
- `port`: 数据库端口。
- `user`: 数据库用户名。
- `password`: 数据库密码。
- `database`: 连接的数据库名。

修改数据库后，需要重启服务。

系统会把 API 配置和 API 调用日志写入配置中的第一个 MySQL 数据源。服务启动时会自动创建以下表:

- `ssql_api_definitions`: 保存 API 配置、SQL、JS、测试参数和发布状态。
- `ssql_api_call_logs`: 保存动态 API 调用日志。

旧版本如果已经存在 `data/apis.json`，服务首次启动且数据库表为空时，会自动把里面的 API 配置迁移到 MySQL。

## 4. 启动服务

默认启动:

```bash
npm run dev
```

启动成功后访问:

```text
http://127.0.0.1:3010
```

默认端口和监听地址来自 `app.config.jsonc`:

```jsonc
{
  // 服务监听配置。临时覆盖可使用 PORT / HOST 环境变量。
  "server": {
    "port": 3010,
    "host": "0.0.0.0"
  },
  "runtime": {
    "scriptWorker": {
      "maxOldGenerationSizeMb": 32,
      "maxYoungGenerationSizeMb": 8
    }
  }
}
```

## 5. 修改端口

长期配置建议修改 `app.config.jsonc`。服务端口也可以通过环境变量 `PORT` 临时覆盖，服务监听地址可以通过环境变量 `HOST` 临时覆盖。
JS Worker 内存上限可通过 `runtime.scriptWorker` 调整，也可以用 `SCRIPT_WORKER_MAX_OLD_MB`、`SCRIPT_WORKER_MAX_YOUNG_MB` 临时覆盖。

### Linux 或 macOS

临时使用 `3011` 端口启动:

```bash
PORT=3011 npm run dev
```

访问地址变为:

```text
http://127.0.0.1:3011
```

如果需要指定监听地址:

```bash
HOST=0.0.0.0 PORT=3011 npm run dev
```

### Windows PowerShell

临时使用 `3011` 端口启动:

```powershell
$env:PORT=3011
npm run dev
```

访问地址变为:

```text
http://127.0.0.1:3011
```

### Windows CMD

临时使用 `3011` 端口启动:

```cmd
set PORT=3011
npm run dev
```

访问地址变为:

```text
http://127.0.0.1:3011
```

如果 Web 页面从其它机器访问，需要确认服务监听地址是 `0.0.0.0`，并使用服务器实际 IP 访问，例如:

```text
http://服务器IP:3010
```

## 6. 服务端日志

服务启动后会同时输出控制台日志，并写入日志文件:

```text
data/server.log
```

注意: `data/server.log` 只保存服务运行日志。API 配置和 API 调用日志保存到 `database.config.json` 指向的 MySQL 数据库。

每次动态 API 执行还会写入一份请求调试文件:

```text
data/api-debug/
```

调试文件为 JSON 格式，包含请求入参、参数处理 JS、参数处理结果、数据库别名、数据库类型、原始 SQL、SQL 模式、动态标签渲染后的 SQL、最终绑定 SQL、绑定参数、结果集 JS 和执行结果或错误信息。`data/` 目录已被 `.gitignore` 忽略，调试文件不会提交到版本库。

日志内容包括:

- 服务启动端口和监听地址。
- 每次 HTTP 请求的方法、路径、状态码和耗时。
- 静态文件返回路径和文件大小。
- 管理接口操作日志。
- 动态 API 执行日志。
- 请求异常、进程异常和客户端连接异常。

## 7. 端口占用处理

如果启动时报端口占用，例如 `3010` 已被占用，可以换一个端口启动:

```bash
PORT=3011 npm run dev
```

常用检查端口命令:

```bash
ss -ltnp | grep 3010
```

如果不方便处理占用进程，直接换端口是最简单的方式。

## 8. 常用接口

后台页面:

```text
GET /
```

API 管理:

```text
GET /admin/apis?page=1&pageSize=20&name=订单&sql=select
POST /admin/apis
GET /admin/database-sources
GET /admin/apis/:id
PUT /admin/apis/:id
POST /admin/apis/:id/publish
POST /admin/apis/:id/disable
POST /admin/apis/:id/test-sql
POST /admin/apis/:id/test-script
POST /admin/apis/:id/test-api
```

动态 API:

```text
/api/*
```

`GET /admin/apis` 查询参数:

- `name`: 按 API 名称模糊查找。
- `sql`: 按 SQL 内容模糊查找。
- `page`: 页码，从 `1` 开始。
- `pageSize`: 每页数量，最大 `100`。

## 9. SQL 参数引用

SQL 中使用 `#{参数名}` 引用客户端传入的参数，例如:

```sql
select *
from users
where id = #{userId}
  and status = #{status}
```

客户端传入参数:

```json
{
  "userId": 1,
  "status": "enabled"
}
```

规则:

- SQL 编辑模式会随 API 配置保存，执行时按保存的“原生 SQL”或“MyBatis XML”模式处理。
- 参数名必须以字母或下划线开头，只能包含字母、数字和下划线。
- 参数占位符不要写在字符串引号里，使用 `where id = #{userId}`，不要写 `where id = '#{userId}'`。
- 同一个参数可以在 SQL 中多次引用。
- 系统会把 `#{参数名}` 编译成数据库绑定参数，不能直接拼接客户端输入。
- MySQL 会编译成 `?` 占位符，MSSQL 会编译成 `@p0`、`@p1` 这类占位符。
- 系统不再自动追加最大行限制；需要限制返回量时请在 SQL 中显式编写 `limit`、`top` 或对应数据库语法。
- 支持多条查询语句和临时表批处理，多个 `select` 的返回会进入 `resultSets`。
- 临时表批处理允许 `create temporary table`、写入已创建的临时表、查询临时表、删除临时表；不允许写入真实业务表。

多结果集示例:

```sql
create temporary table tmp_students (id int);
insert into tmp_students values (#{id});
select * from tmp_students;
select count(*) as total from tmp_students;
drop temporary table tmp_students;
```

JS 结果集处理可以直接返回全部结果集:

```js
async function main({ resultSets }) {
  return resultSets;
}
```

选择 MyBatis XML 模式后，也可以输入基础 MyBatis XML 格式，系统会提取单个 `<select>` 内容并执行:

```xml
<mapper namespace="UserMapper">
  <select id="listUsers">
    select *
    from users
    <where>
      <if test="status != null">
        and status = #{status}
      </if>
    </where>
  </select>
</mapper>
```

MyBatis XML 支持范围:

- 参数绑定支持 `#{参数名}`，会编译成数据库绑定参数。
- 禁止使用 `${参数名}`。
- 支持 `<if>`、`<where>`、`<foreach>`、`<choose>`、`<when>`、`<otherwise>`。
- 不支持完整 MyBatis 语法，仅支持上述动态标签子集。

## 10. JS 处理类型

JS 处理编辑器支持两种类型:

- `1 参数处理`: 在 SQL 执行前运行。返回普通对象时作为新的 SQL 入参；返回 `{ params: {...} }` 时使用其中的 `params`；返回 `{ directReturn: true, data: ... }` 时跳过 SQL 和结果集处理，动态 API 直接返回 `data`。
- `2 结果集处理`: 在 SQL 执行后运行，原有 JS 脚本归到此类型。脚本可读取 `params`、`rows`、`headers`、`context` 和 `callApi`，返回值就是动态 API 响应体。

参数处理示例:

```js
async function main({ params }) {
  if (!params.id) {
    return { directReturn: true, data: { code: 400, message: "缺少 id" } };
  }
  return {
    ...params,
    id: Number(params.id)
  };
}
```

## 11. 验证运行

启动服务后，可以打开后台页面创建 API，也可以用命令检查服务是否可用:

```bash
curl http://127.0.0.1:3010/admin/apis
```

正常返回示例:

```json
{
  "code": 0,
  "message": "ok",
  "data": []
}
```

如果修改了端口，需要把命令里的 `3010` 改成实际端口。
