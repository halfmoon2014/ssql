# 用户认证、Authenticator 和 API 授权设计文档

## 1. 设计目标

本文档描述当前项目后续要落地的用户注册、Google Authenticator 绑定、登录认证、用户到 API 授权、授权页面 IP 白名单、API 调用 IP 白名单方案。

核心目标:

- 支持用户注册和登录。
- 支持 Google Authenticator 二次验证。
- API 请求必须携带用户身份。
- API 执行权限只采用“用户 -> API 权限”模型，不使用角色授权模型。
- 授权页面属于高权限管理页面，需要 IP 白名单、登录态、Authenticator 和管理权限共同保护。
- 某些 API 可以配置调用 IP 白名单，只允许指定服务器来源调用。
- 安全逻辑集中放在独立模块中，避免分散在 `server`、`runtime`、`store` 中。

## 2. 目录规划

当前已新增代码目录:

```text
src/security/
  authService.js
  totpService.js
  tokenService.js
  permissionService.js
  ipWhitelistService.js
  securityMiddleware.js
  auditService.js
  securityStore.js
  index.js
```

各文件职责:

- `authService.js`: 用户注册、登录、密码哈希校验、账号状态校验。
- `totpService.js`: Google Authenticator 密钥生成、二维码 URI 生成、6 位动态码校验。
- `tokenService.js`: 登录 token 生成、token 哈希存储、Bearer token 解析、过期和撤销校验。
- `permissionService.js`: 用户到 API 权限校验、授权增删改查。
- `ipWhitelistService.js`: 授权页面 IP 白名单和 API 调用 IP 白名单校验，支持单 IP 和 CIDR。
- `securityMiddleware.js`: 管理端和动态 API 的统一认证入口。
- `auditService.js`: 登录、登出、绑定 Authenticator、授权变更、API 调用拒绝等安全审计日志。
- `securityStore.js`: 安全相关数据表创建和读写。
- `index.js`: 组装安全模块依赖，供 `server.js` 统一接入。

## 2.1 当前实现开关

当前后端第一版已经接入 `src/security/` 模块，并通过 `app.config.jsonc` 控制是否强制启用:

```jsonc
{
  "security": {
    "enabled": false,
    "secretKey": "change-this-security-secret",
    "tokenTtlSeconds": 28800,
    "totpIssuer": "SQL API",
    "trustedProxies": ["127.0.0.1", "::1"],
    "adminIpWhitelistRequired": false
  }
}
```

说明:

- `enabled = false`: 创建安全表并开放安全管理接口，但不强制动态 API 和普通管理接口鉴权。
- `enabled = true`: 动态 API 必须携带 Bearer token，并校验“用户 -> API 权限”；普通 `/admin/*` 管理接口必须携带管理员 token。
- `secretKey`: 用于加密 Authenticator Secret，生产环境必须改成高强度随机值。
- `trustedProxies`: 只有请求来自可信代理时才读取 `X-Forwarded-For` 或 `X-Real-IP`。
- `adminIpWhitelistRequired`: 为 `true` 时，授权管理接口必须命中 `adata_security_admin_ip_whitelist`。

文档存放目录:

```text
docs/security/
  AUTH_DESIGN.md
  AUTH_OPERATION.md
```

## 3. 权限边界

系统内需要区分两类权限。

### 3.1 管理权限

管理权限控制用户能不能进入后台和修改系统配置。

建议放在 `adata_security_users` 表字段中:

```text
is_admin
can_manage_auth
```

含义:

- `is_admin = 1`: 系统管理员，可以管理用户、API、授权、标签、配置。
- `can_manage_auth = 1`: 授权管理员，只能进入授权页面，维护“用户 -> API 权限”和 API 调用 IP 白名单。

管理权限不等于 API 调用权限。

### 3.2 API 调用权限

API 调用权限只采用“用户 -> API 权限”模型。

含义:

```text
某个用户可以调用某个 API
```

不使用角色继承，不使用用户组继承。这样模型简单、可审计、可解释。

## 4. 数据库设计

所有安全相关新表按项目规则使用 `adata_security_` 前缀。

### 4.1 用户表 `adata_security_users`

```sql
create table adata_security_users (
  id bigint primary key auto_increment,
  username varchar(100) not null,
  password_hash varchar(255) not null,
  display_name varchar(100) not null default '',
  status varchar(20) not null default 'active',
  totp_secret_cipher text null,
  totp_enabled tinyint not null default 0,
  is_admin tinyint not null default 0,
  can_manage_auth tinyint not null default 0,
  last_login_at datetime null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  unique key ux_adata_security_users_username (username)
);
```

字段说明:

- `username`: 登录账号。
- `password_hash`: 密码哈希，使用 `argon2id` 或 `bcrypt`。
- `status`: `active`、`disabled`、`locked`。
- `totp_secret_cipher`: 加密后的 TOTP Secret。
- `totp_enabled`: 是否已完成 Authenticator 绑定。
- `is_admin`: 是否系统管理员。
- `can_manage_auth`: 是否授权管理员。

注意:

- `totp_secret_cipher` 必须加密保存，不能明文保存。
- 密码不能明文保存，也不能使用可逆加密。

### 4.2 用户会话表 `adata_security_user_sessions`

```sql
create table adata_security_user_sessions (
  id bigint primary key auto_increment,
  user_id bigint not null,
  token_hash varchar(255) not null,
  user_agent varchar(500) not null default '',
  client_ip varchar(64) not null default '',
  expires_at datetime not null,
  revoked_at datetime null,
  created_at datetime not null default current_timestamp,
  unique key ux_adata_security_user_sessions_token_hash (token_hash),
  key idx_adata_security_user_sessions_user_id (user_id),
  key idx_adata_security_user_sessions_expires_at (expires_at)
);
```

设计说明:

- 客户端拿到原始 token。
- 数据库只保存 `token_hash`。
- token 泄漏时可以按会话撤销。
- `expires_at` 用于强制过期。

### 4.3 用户到 API 权限表 `adata_security_user_api_permissions`

```sql
create table adata_security_user_api_permissions (
  id bigint primary key auto_increment,
  user_id bigint not null,
  api_id varchar(36) not null,
  can_execute tinyint not null default 1,
  granted_by bigint not null,
  granted_at datetime not null default current_timestamp,
  revoked_at datetime null,
  unique key ux_adata_security_user_api_permissions_user_api (user_id, api_id),
  key idx_adata_security_user_api_permissions_api_id (api_id)
);
```

设计说明:

- `user_id + api_id` 表示一个用户对一个 API 的授权。
- `can_execute = 1` 且 `revoked_at is null` 才表示有效。
- `granted_by` 记录是谁授权的。

### 4.4 API 调用 IP 白名单表 `adata_security_api_ip_whitelist`

```sql
create table adata_security_api_ip_whitelist (
  id bigint primary key auto_increment,
  api_id varchar(36) not null,
  ip_rule varchar(64) not null,
  description varchar(255) not null default '',
  enabled tinyint not null default 1,
  created_by bigint not null,
  created_at datetime not null default current_timestamp,
  unique key ux_adata_security_api_ip_whitelist_api_rule (api_id, ip_rule),
  key idx_adata_security_api_ip_whitelist_api_id (api_id)
);
```

`ip_rule` 支持:

- 单个 IPv4: `192.168.1.10`
- 单个 IPv6: `2001:db8::1`
- IPv4 CIDR: `10.0.0.0/24`
- IPv6 CIDR: `2001:db8::/32`

规则:

- API 没有配置启用的 IP 白名单时，表示不限制调用 IP。
- API 配置了启用的 IP 白名单时，请求来源 IP 必须命中至少一条规则。

### 4.5 授权页面 IP 白名单表 `adata_security_admin_ip_whitelist`

```sql
create table adata_security_admin_ip_whitelist (
  id bigint primary key auto_increment,
  ip_rule varchar(64) not null,
  description varchar(255) not null default '',
  enabled tinyint not null default 1,
  created_by bigint not null,
  created_at datetime not null default current_timestamp,
  unique key ux_adata_security_admin_ip_whitelist_rule (ip_rule)
);
```

用途:

- 只保护授权页面、用户管理页面等高权限管理入口。
- 不能替代登录、Authenticator 和管理权限校验。

### 4.6 安全审计表 `adata_security_audit_logs`

```sql
create table adata_security_audit_logs (
  id bigint primary key auto_increment,
  event_type varchar(50) not null,
  actor_user_id bigint null,
  target_user_id bigint null,
  api_id varchar(36) null,
  client_ip varchar(64) not null default '',
  user_agent varchar(500) not null default '',
  success tinyint not null,
  message varchar(500) not null default '',
  details_json json null,
  created_at datetime not null default current_timestamp,
  key idx_adata_security_audit_logs_event_type (event_type),
  key idx_adata_security_audit_logs_actor_user_id (actor_user_id),
  key idx_adata_security_audit_logs_api_id (api_id),
  key idx_adata_security_audit_logs_created_at (created_at)
);
```

建议记录的事件:

- `user.register`
- `user.login.password_failed`
- `user.login.totp_failed`
- `user.login.success`
- `user.logout`
- `user.totp.bind_start`
- `user.totp.bind_success`
- `permission.grant`
- `permission.revoke`
- `admin_ip.allow`
- `admin_ip.deny`
- `api_ip.allow`
- `api_ip.deny`
- `api_permission.deny`

## 5. 注册与 Authenticator 绑定流程

### 5.1 用户注册

流程:

```text
1. 用户提交 username、password、displayName
2. 后端校验账号格式和密码强度
3. 检查 username 是否已存在
4. 使用 argon2id 或 bcrypt 生成 password_hash
5. 创建 adata_security_users 记录，totp_enabled = 0
6. 写安全审计日志 user.register
```

密码要求建议:

- 最少 12 位。
- 至少包含字母和数字。
- 不允许和 username 相同。
- 登录失败多次后临时锁定。

### 5.2 Authenticator 绑定

流程:

```text
1. 用户登录或注册后进入绑定页面
2. 后端生成 TOTP Secret
3. 后端保存加密后的 Secret，totp_enabled 仍为 0
4. 后端返回 otpauth URI
5. 前端把 otpauth URI 生成二维码
6. 用户用 Google Authenticator 扫码
7. 用户输入 6 位验证码
8. 后端校验验证码
9. 校验成功后设置 totp_enabled = 1
10. 写安全审计日志 user.totp.bind_success
```

`otpauth` URI 示例:

```text
otpauth://totp/SQL%20API:zhangsan?secret=BASE32SECRET&issuer=SQL%20API&period=30&digits=6
```

TOTP 校验建议:

- 周期 30 秒。
- 6 位数字。
- 允许当前窗口前后各 1 个窗口，避免客户端时间轻微偏差。
- 同一验证码在短时间内不允许重复使用。
- 连续失败需要限流。

### 5.3 恢复码

建议后续增加恢复码表:

```text
adata_security_user_recovery_codes
```

用途:

- 用户换手机或 Authenticator 丢失时，可以用一次性恢复码登录。
- 恢复码只保存哈希。
- 每个恢复码只能使用一次。

## 6. 登录与 Token 设计

### 6.1 登录流程

推荐流程:

```text
1. 用户提交 username、password
2. 后端校验账号是否存在、状态是否 active
3. 校验 password_hash
4. 如果 totp_enabled = 1，要求输入 Authenticator 6 位验证码
5. 校验 TOTP
6. 生成随机 session token
7. 数据库保存 token_hash
8. 返回 accessToken 和 expiresAt
9. 写安全审计日志 user.login.success
```

### 6.2 Token 形式

建议优先使用服务端会话 token，而不是纯无状态 JWT。

原因:

- 可以随时撤销。
- 可以查看在线会话。
- 可以按用户强制下线。
- 适合管理后台和动态 API 平台。

请求头:

```http
Authorization: Bearer <access_token>
```

数据库只保存:

```text
sha256(access_token)
```

### 6.3 Token 有效期

建议:

- 管理后台 token: 2 到 8 小时。
- 动态 API 调用 token: 按业务决定，可以 1 小时到 7 天。
- 高风险操作，例如授权变更，可以要求重新输入 Authenticator 验证码。

## 7. 动态 API 请求身份校验

动态 API 请求必须携带身份:

```http
Authorization: Bearer <access_token>
```

执行链路:

```text
1. 根据 path 和 method 找到 API
2. 解析 Authorization Bearer token
3. 查询 adata_security_user_sessions
4. 校验 token 未过期、未撤销
5. 查询 adata_security_users
6. 校验用户 status = active
7. 校验 API 已发布
8. 查询 adata_security_user_api_permissions
9. 校验当前 user_id 对 api_id 有 can_execute 权限
10. 如果 API 配置了调用 IP 白名单，校验来源 IP
11. 把身份注入 runtime context
12. 执行参数脚本、SQL、结果脚本
13. 写 API 调用日志和安全审计日志
```

注入给动态 API 的上下文:

```js
{
  userId: 123,
  username: "zhangsan",
  displayName: "张三",
  authType: "user_token"
}
```

脚本可读取:

```js
async function main({ params, context }) {
  return {
    userId: context.userId,
    data: params
  };
}
```

注意:

- 权限判断应以后端统一校验为主。
- 用户脚本里的判断只能作为业务补充，不能替代后端权限校验。

## 8. 授权页面访问控制

授权页面属于高权限管理页面。

访问链路:

```text
1. 获取请求来源 IP
2. 校验来源 IP 是否命中 adata_security_admin_ip_whitelist
3. 校验用户是否已登录
4. 校验用户是否已完成 Authenticator
5. 必要时要求重新输入 6 位动态码
6. 校验 is_admin = 1 或 can_manage_auth = 1
7. 允许打开授权页面
```

说明:

- IP 白名单只是入口保护。
- 登录态证明“是谁”。
- Authenticator 证明“这个人还掌握第二因素”。
- `is_admin` 或 `can_manage_auth` 证明“有没有管理授权的权力”。

## 9. API 调用 IP 白名单

API 调用 IP 白名单用于限制某些 API 只能从指定服务器调用。

校验位置:

```text
动态 API 执行前，用户 API 权限校验通过后
```

校验逻辑:

```text
1. 查询当前 API 的启用白名单规则
2. 如果没有规则，跳过 IP 限制
3. 如果有规则，获取请求来源 IP
4. 判断来源 IP 是否命中任意规则
5. 命中则继续执行
6. 未命中则返回 403
```

## 10. 真实 IP 获取规则

如果项目直接暴露给调用方:

```text
使用 req.socket.remoteAddress
```

如果项目部署在 Nginx 或网关后面:

```text
只有当 remoteAddress 是可信代理 IP 时，才信任 X-Forwarded-For 或 X-Real-IP
```

推荐配置:

```jsonc
{
  "security": {
    "trustedProxies": ["127.0.0.1", "10.0.0.10"],
    "adminIpWhitelistRequired": true
  }
}
```

不要直接信任外部传入的 `X-Forwarded-For`，否则调用方可以伪造 IP。

## 11. 管理接口设计建议

### 11.1 用户注册

```http
POST /admin/security/register
```

请求:

```json
{
  "username": "zhangsan",
  "password": "password",
  "displayName": "张三"
}
```

### 11.2 登录

```http
POST /admin/security/login
```

请求:

```json
{
  "username": "zhangsan",
  "password": "password",
  "totpCode": "123456"
}
```

响应:

```json
{
  "accessToken": "token",
  "expiresAt": "2026-09-04T10:00:00.000Z"
}
```

### 11.3 开始绑定 Authenticator

```http
POST /admin/security/totp/begin
```

响应:

```json
{
  "otpauthUrl": "otpauth://totp/SQL%20API:zhangsan?secret=BASE32SECRET&issuer=SQL%20API",
  "secret": "BASE32SECRET",
  "secretPreview": "BASE32SECRET"
}
```

### 11.4 确认绑定 Authenticator

```http
POST /admin/security/totp/confirm
```

请求:

```json
{
  "code": "123456"
}
```

### 11.5 查询用户 API 权限

```http
GET /admin/security/users/{userId}/api-permissions
```

### 11.6 保存用户 API 权限

```http
PUT /admin/security/users/{userId}/api-permissions
```

请求:

```json
{
  "apiIds": ["api-id-1", "api-id-2"]
}
```

### 11.7 查询 API 调用 IP 白名单

```http
GET /admin/security/apis/{apiId}/ip-whitelist
```

### 11.8 保存 API 调用 IP 白名单

```http
PUT /admin/security/apis/{apiId}/ip-whitelist
```

请求:

```json
{
  "rules": [
    {
      "ipRule": "192.168.1.10",
      "description": "订单服务"
    },
    {
      "ipRule": "10.0.0.0/24",
      "description": "内网服务网段"
    }
  ]
}
```

## 12. 前端页面设计建议

建议新增页面或弹窗:

- 登录页。
- 用户注册页。
- Authenticator 绑定页。
- 用户管理页。
- API 授权页。
- 授权页面 IP 白名单管理页。
- API 调用 IP 白名单配置区。

API 授权页建议:

```text
左侧: 用户列表
右侧: API 列表
操作: 勾选用户可调用的 API，保存
筛选: API 名称、路径、标签
提示: 显示授权人、授权时间
```

API 调用 IP 白名单建议放在 API 编辑页或授权页中:

```text
API -> 安全 -> 调用 IP 白名单
```

## 13. 错误码建议

```text
401 unauthorized
  未登录、token 缺失、token 无效、token 过期

403 forbidden
  用户没有 API 权限、授权页面 IP 不允许、API 调用 IP 不允许、用户不是管理员

423 locked
  用户被锁定

429 too many requests
  登录失败次数过多、TOTP 尝试过多、API 调用限流
```

响应示例:

```json
{
  "code": 403,
  "message": "api permission denied",
  "data": {
    "requestId": "req-id"
  }
}
```

## 14. 安全注意事项

- 生产环境必须启用 HTTPS。
- 密码只保存哈希。
- TOTP Secret 必须加密保存。
- 数据库里的 token 只保存哈希。
- 登录失败、TOTP 失败必须限流。
- 授权变更必须写审计日志。
- 授权页面 IP 白名单不能替代登录和二次验证。
- API 调用 IP 白名单不能替代用户到 API 权限。
- 可信代理列表必须显式配置。
- 不直接信任外部传入的 `X-Forwarded-For`。
- 管理端高风险操作可以要求重新输入 Authenticator 验证码。

## 15. 推荐落地顺序

1. 建立 `src/security/` 模块目录。
2. 新增安全相关数据表。
3. 实现密码哈希和用户注册。
4. 实现 Authenticator 绑定和校验。
5. 实现服务端 session token。
6. 管理端接入登录态。
7. 动态 API 接入 Bearer token 身份解析。
8. 实现“用户 -> API 权限”校验。
9. 实现授权页面 IP 白名单。
10. 实现 API 调用 IP 白名单。
11. 增加审计日志页面。
12. 增加恢复码和高风险操作二次确认。
