# 前端接口和权限对照文档

## 1. 维护要求

只要前端新增、删除或调整接口调用，或者后端调整接口权限，必须同步更新本文档。

本文档按当前前端实际调用整理，来源主要是:

- `public/app.js`
- `public/security.js`
- `public/security.html`
- `src/server.js`
- `src/security/securityMiddleware.js`
- `src/security/permissionService.js`
- `src/runtime.js`
- `src/scriptRunner.js`

以下权限说明默认 `security.enabled = true`。如果 `security.enabled = false`，部分管理接口会进入开发模式放行，不代表生产权限规则。

## 2. 权限术语

### 2.1 登录用户

校验函数:

```text
requireSessionUser(req)
```

要求:

```text
Authorization: Bearer <accessToken>
用户状态 status = active
session 未过期
session 未 revoked
```

不额外要求:

```text
授权页 IP 白名单
is_admin
can_manage_auth
can_develop_api
```

### 2.2 授权管理员

校验函数:

```text
requireAuthManager(req)
```

要求:

```text
登录用户
授权页 IP 白名单命中
已绑定 Google Authenticator
is_admin = 1 或 can_manage_auth = 1
```

用途:

```text
维护用户到 API 的调用权限
维护 API 调用 IP 白名单
维护授权页 IP 白名单
查看安全审计
```

### 2.3 系统管理员

校验函数:

```text
requireAdmin(req)
```

要求:

```text
登录用户
授权页 IP 白名单命中
已绑定 Google Authenticator
is_admin = 1
```

用途:

```text
创建用户
修改用户状态
修改管理员/授权/开发开关
配置 API 开发权限
踢用户下线
删除 API
查看普通管理日志
```

### 2.4 API 开发者

入口校验函数:

```text
requireApiDeveloper(req)
```

要求:

```text
登录用户
授权页 IP 白名单命中
已绑定 Google Authenticator
is_admin = 1 或 can_develop_api = 1
```

具体 API 动作校验函数:

```text
requireApiDeveloperAction(req, apiId, action)
```

系统管理员 `is_admin = 1` 可以操作所有 API。非系统管理员必须满足:

```text
can_develop_api = 1
并且 adata_security_api_developers 中有对应 api_id 的权限
```

动作对应字段:

```text
read    -> can_edit = 1 或 can_test = 1 或 can_publish = 1
edit    -> can_edit = 1
test    -> can_test = 1
publish -> can_publish = 1
```

### 2.5 普通 API 调用用户

动态 API 校验函数:

```text
authenticateDynamicRequest(req)
assertApiAccessForUser(user, api, context)
```

要求:

```text
登录用户
API 已发布
adata_security_user_api_permissions 中有当前 user_id + api_id 的 can_execute = 1
如果当前 API 配了调用 IP 白名单，来源 IP 必须命中
```

普通用户不能访问后台 API 列表和 API 编辑配置。

## 3. 主页 `public/app.js` 接口

主页用于 API 开发、API 编辑、登录、注册、绑定 Authenticator 和修改密码。

| 接口 | 前端用途 | 后端权限 |
| --- | --- | --- |
| `GET /admin/security/me` | 读取当前登录用户 | 登录用户 |
| `POST /admin/security/login` | 登录获取 token | 公开接口；账号密码正确；用户 `active`；已绑定 Authenticator 时必须带 6 位验证码 |
| `POST /admin/security/register` | 首个用户初始化注册；系统管理员新增用户 | 没有任何用户时公开，首个用户自动成为系统管理员；已有用户后要求系统管理员 |
| `POST /admin/security/logout` | 当前用户退出登录 | 登录用户；写 `revoked_at` 撤销当前 token |
| `POST /admin/security/totp/begin` | 生成 Authenticator 绑定密钥和二维码 | 登录用户 |
| `POST /admin/security/totp/confirm` | 确认绑定 Authenticator | 登录用户 |
| `POST /admin/security/password/change` | 修改当前用户密码 | 登录用户；校验旧密码；已绑定 Authenticator 时校验验证码；成功后撤销该用户所有 session |
| `GET /admin/database-sources` | API 编辑页读取数据库源别名 | API 开发者入口权限 |
| `POST /admin/format-code` | SQL/JS 格式化 | API 开发者入口权限 |
| `GET /admin/tags` | 读取标签 | API 开发者入口权限 |
| `POST /admin/tags` | 新增标签 | API 开发者入口权限 |
| `GET /admin/apis?page=...` | API 编辑页列表 | API 开发者入口权限；系统管理员返回全部；API 开发者只返回 `adata_security_api_developers` 中有权限的 API |
| `GET /admin/apis/{apiId}` | 打开 API 编辑详情 | 系统管理员，或当前 API 有任一开发权限 |
| `POST /admin/apis` | 新建 API | API 开发者入口权限；非系统管理员新建后自动获得该 API 的编辑、测试权限，不自动获得发布权限 |
| `PUT /admin/apis/{apiId}` | 保存 API | 系统管理员，或当前 API `can_edit = 1` |
| `POST /admin/apis/{apiId}/test-sql` | 测试 SQL 和参数脚本 | 系统管理员，或当前 API `can_test = 1` |
| `POST /admin/apis/{apiId}/test-script` | 测试参数脚本、SQL 和结果脚本 | 系统管理员，或当前 API `can_test = 1` |
| `POST /admin/apis/{apiId}/publish` | 发布 API | 系统管理员，或当前 API `can_publish = 1` |
| `POST /admin/apis/{apiId}/disable` | 停用 API | 系统管理员，或当前 API `can_publish = 1` |

主页前端初始化规则:

```text
is_admin = 1
  加载全部 API 编辑数据

can_develop_api = 1
  加载自己有开发权限的 API 编辑数据

can_manage_auth = 1 且 can_develop_api = 0
  不加载 API 编辑数据，提示“当前账号可进入安全管理，不能编辑 API”

普通用户
  不加载 API 编辑数据，提示“普通用户”
```

主页按钮控制规则:

```text
新建
  is_admin = 1 或 can_develop_api = 1 时可用

保存
  新 API: is_admin = 1 或 can_develop_api = 1 时可用
  已有 API: 系统管理员可用；API 开发者必须有当前 API 的 can_edit = 1

测试 SQL / 测试 JS
  系统管理员可用；API 开发者必须有当前 API 的 can_test = 1
  如果当前账号只有测试权限、没有编辑权限，测试使用数据库中已保存的 API 配置，不会先保存页面草稿

发布 / 停用
  系统管理员可用；API 开发者必须有当前 API 的 can_publish = 1
  如果当前账号只有发布权限、没有编辑权限，发布或停用使用数据库中已保存的 API 配置，不会先保存页面草稿
```

后端 `/admin/apis` 列表、详情、保存、发布和停用响应会附带当前登录用户对该 API 的:

```json
{
  "developerPermission": {
    "canEdit": true,
    "canTest": true,
    "canPublish": true
  }
}
```

## 4. 安全管理页 `public/security.js` 接口

安全管理页入口:

```text
/security.html
```

静态页面返回前只校验授权页 IP 白名单:

```text
requireAdminPageIp(req)
```

页面加载后再通过 `/admin/security/*` 接口校验登录态、Authenticator 和管理权限。

| 接口 | 前端用途 | 后端权限 |
| --- | --- | --- |
| `GET /admin/security/me` | 读取当前登录用户 | 登录用户；前端再判断 `is_admin` 或 `can_manage_auth` |
| `GET /admin/security/users` | 安全管理用户列表 | 授权管理员 |
| `PUT /admin/security/users/{userId}` | 修改用户状态、管理员、授权、开发开关 | 系统管理员 |
| `POST /admin/security/users/{userId}/sessions/revoke` | 踢用户下线，撤销该用户所有 token | 系统管理员；前端禁止踢当前登录账号 |
| `GET /admin/security/apis?page=...` | 授权页读取 API 目录 | 授权管理员 |
| `GET /admin/security/users/{userId}/api-permissions` | 读取用户到 API 的调用权限 | 授权管理员 |
| `PUT /admin/security/users/{userId}/api-permissions` | 保存用户到 API 的调用权限 | 授权管理员 |
| `GET /admin/security/users/{userId}/api-developer-permissions` | 读取用户到 API 的开发权限 | 系统管理员 |
| `PUT /admin/security/users/{userId}/api-developer-permissions` | 保存用户到 API 的编辑、测试、发布权限 | 系统管理员 |
| `GET /admin/security/apis/{apiId}/ip-whitelist` | 读取某个 API 的调用 IP 白名单 | 授权管理员 |
| `PUT /admin/security/apis/{apiId}/ip-whitelist` | 保存某个 API 的调用 IP 白名单 | 授权管理员 |
| `GET /admin/security/admin-ip-whitelist` | 读取授权页 IP 白名单 | 授权管理员 |
| `PUT /admin/security/admin-ip-whitelist` | 保存授权页 IP 白名单 | 授权管理员 |
| `GET /admin/security/audit-logs?limit=...` | 查看安全审计日志 | 授权管理员 |

安全管理页前端显示规则:

```text
is_admin = 1
  显示并允许用户状态、管理员、授权、开发开关保存
  显示“API 开发”页签
  允许踢其他用户下线

can_manage_auth = 1 且 is_admin = 0
  可进入安全管理
  可维护 API 调用授权、API IP、授权页 IP、审计
  用户状态、管理员、授权、开发开关保存按钮禁用
  不显示“API 开发”页签
  不能踢用户下线
```

## 5. 动态 API 调用

动态 API 路径:

```text
/api/*
```

当前管理前端不直接调用 `/api/*`，但外部调用方会使用该路径。

权限规则:

```text
1. API 必须是 published
2. 请求必须带 Authorization: Bearer <accessToken>
3. token 对应用户必须 active
4. adata_security_user_api_permissions 中必须有 user_id + api_id 的 can_execute = 1
5. 如果该 API 配了 adata_security_api_ip_whitelist，来源 IP 必须命中
6. 校验通过后才执行参数脚本、SQL、结果脚本
```

脚本内 `callApi.get/post('/api/...')` 也会再次进入 runtime。外部动态 API 调用场景下，嵌套调用继承当前 `securityUser`，因此每个被调用 API 都会重新校验用户到 API 的调用权限和 API IP 白名单。

## 6. 直接执行脚本绕过控制检查

### 6.1 当前脚本执行入口

前端能触发脚本执行的接口只有:

```text
POST /admin/apis/{apiId}/test-sql
POST /admin/apis/{apiId}/test-script
POST /admin/apis/{apiId}/test-api
外部调用 /api/*
```

没有发现前端存在“传一段任意 JS 到后端直接执行”的接口。`POST /admin/format-code` 只做格式化，不执行脚本。

### 6.2 管理端测试权限

管理端测试接口现在要求:

```text
系统管理员
或
当前 API 在 adata_security_api_developers 中 can_test = 1
```

管理端测试允许 `allowDraft = true`，目的是开发联调草稿 API。

本次核对发现并已修复一个绕过风险:

```text
测试 API A 的脚本时，脚本内 callApi('/api/B') 可能借 allowDraft=true 调用 API B，
如果不校验 API B 的开发测试权限，就会绕过 B 的开发权限边界。
```

当前修复后的规则:

```text
管理端测试脚本内 callApi 目标 API 必须继续校验 can_test。
开发者有 API A 的 can_test，只能测试 A。
如果 A 的脚本调用 B，还必须同时拥有 B 的 can_test。
系统管理员不受此限制。
```

实现位置:

```text
src/runtime.js
  executeCallApiWithMethod()
  - 解析 callApi 目标 API 后调用 runtimeOptions.authorizeCallApi

src/server.js
  createTestCallAuthorizer()
  POST /admin/apis/{apiId}/test-sql
  POST /admin/apis/{apiId}/test-script
  POST /admin/apis/{apiId}/test-api
  - 把当前登录用户传给脚本上下文
  - 脚本内 callApi 继续校验目标 API 的 can_test
```

### 6.3 动态 API 脚本权限

外部调用 `/api/*` 时:

```text
allowDraft = false
```

因此:

```text
1. 未发布 API 不会执行
2. 顶层 API 校验用户调用权限
3. 脚本内 callApi 调用的每个目标 API 也会校验用户调用权限
4. callApi 只能调用 /api/*，不能调用 /admin/*
```

实现位置:

```text
src/scriptRunner.js
  validateInternalApiCall()
  - 要求 path 以 /api/ 开头
  - 禁止 /admin/
  - 限制调用深度

src/runtime.js
  executeApi()
  - allowDraft=false 时调用 security.assertApiAccessForUser()
```

### 6.4 脚本沙箱和能力控制

脚本运行限制:

```text
Worker + vm 沙箱执行
脚本文本长度限制
必须定义 main 函数
黑名单阻止 require/process/global/Buffer/child_process/fs/net/import/WebAssembly/eval/Function
敏感请求头不传入脚本，包括 authorization/cookie/token/password
脚本超时后终止 Worker
Worker 内存限制
```

脚本能力调用:

```text
files.inspectUrl
files.downloadTemp
```

能力权限来源:

```text
API 定义中的 script_capabilities
app.config.jsonc 中 capabilities.files 的协议、域名、内网、大小、超时限制
```

结论:

```text
当前未发现前端可直接提交任意脚本并绕过接口权限执行的问题。
已修复管理端测试脚本内 callApi 跨 API 绕过开发测试权限的问题。
后续如果新增脚本能力、测试接口或管理端批量执行接口，必须重新更新本文档并复核权限。
```

## 7. 权限调整检查清单

调整权限时必须检查:

```text
1. 前端是否新增 request()/fetch() 调用
2. 后端是否新增 /admin/* 或 /admin/security/* 路由
3. 新路由是否明确使用 requireSessionUser、requireAuthManager、requireAdmin、requireApiDeveloper 或 requireApiDeveloperAction
4. API 开发权限是否区分 read/edit/test/publish
5. 动态 API 调用是否仍逐级校验用户到 API 的 can_execute
6. 管理端测试 allowDraft=true 是否只在开发测试接口使用
7. 脚本内 callApi 是否继续禁止 /admin/*
8. 脚本内 callApi 是否继续校验目标 API 的权限
9. 新增脚本能力是否有 API 级授权和全局配置限制
10. 本文档是否同步更新
```
