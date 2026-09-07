# 用户认证、Authenticator 和 API 授权操作文档

## 1. 文档用途

本文档面向系统管理员、授权管理员和 API 调用方，说明用户注册、Google Authenticator 绑定、登录、用户到 API 授权、授权页面 IP 白名单、API 调用 IP 白名单的实际操作流程。

当前已完成后端第一版安全接口和动态 API 鉴权接入；管理页面仍可在这些接口基础上继续开发。

启用强制鉴权前，先在 `app.config.jsonc` 中确认:

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

`enabled` 改为 `true` 后，动态 API 和普通 `/admin/*` 管理接口都会强制校验 Bearer token。

## 2. 角色说明

系统中不使用“角色 -> API 权限”模型。这里的角色只用于说明操作人员类型，不参与 API 执行授权。

- 普通用户: 可以登录系统，调用被授权的 API。
- API 开发者: `can_develop_api = 1`，可以进入 API 开发入口；具体能编辑、测试、发布哪些 API，继续看 `adata_security_api_developers`。
- 授权管理员: `can_manage_auth = 1`，可以维护用户到 API 的授权和 API 调用 IP 白名单。
- 系统管理员: `is_admin = 1`，可以维护用户、授权、API、系统配置和白名单。

API 执行权限只看:

```text
当前用户是否被授权调用当前 API
```

API 开发权限看:

```text
1. 用户是否 can_develop_api = 1
2. 用户是否在 adata_security_api_developers 中拥有当前 API 的编辑、测试或发布权限
```

### 2.1 常见管理权限错误

`admin permission is required` 表示当前登录用户不是系统管理员，也就是 `adata_security_users.is_admin != 1`。

这个错误不是由授权页 IP 白名单、Google Authenticator、API 执行授权或 API 调用 IP 白名单引起的。前面的校验通过后，系统进入系统管理员权限校验，发现当前用户没有 `is_admin = 1` 才会返回这个错误。

当前典型触发位置:

- `POST /admin/security/register`: 系统已经存在用户后，再注册或创建用户需要系统管理员权限。

常见原因:

- 使用普通用户登录后创建用户。
- 使用只有 `can_manage_auth = 1` 的授权管理员创建用户。
- 数据库里当前用户的 `is_admin` 没有设置为 `1`。
- 前端保存的 token 属于旧用户或非管理员用户。

处理方式:

- 使用首次初始化生成的超级管理员账号操作。
- 确认当前登录用户在 `adata_security_users` 中 `is_admin = 1`。
- 如果只是维护用户到 API 的授权、API 调用 IP 白名单、授权页 IP 白名单和审计，`can_manage_auth = 1` 可以进入授权管理；但创建用户等系统管理员接口仍需要 `is_admin = 1`。
- 修改用户权限后，建议退出重新登录，避免前端继续使用旧 token。

错误区别:

- `admin permission is required`: 必须是系统管理员，要求 `is_admin = 1`。
- `auth management permission is required`: 可以是系统管理员或授权管理员，要求 `is_admin = 1` 或 `can_manage_auth = 1`。

## 3. 首次初始化操作

### 3.1 创建超级管理员

系统首次部署后，需要创建一个超级管理员账号。

首次用户可以通过注册接口创建，系统会自动把第一个用户设为超级管理员:

```http
POST /admin/security/register
Content-Type: application/json

{
  "username": "admin",
  "password": "StrongPassword123",
  "displayName": "管理员"
}
```

安全要求:

- 初始密码必须首次登录后修改。
- 超级管理员必须绑定 Google Authenticator。
- 超级管理员账号不应多人共用。

### 3.2 配置可信代理

如果系统部署在 Nginx、网关或负载均衡后面，需要配置可信代理 IP。

可信代理指直接连接到 Node 服务的反向代理服务器，例如 Nginx、网关或负载均衡的内网 IP。它不是普通用户电脑 IP，也不是 API 调用方业务服务器 IP。

示例:

```jsonc
{
  "security": {
    "trustedProxies": ["127.0.0.1", "10.0.0.10"]
  }
}
```

说明:

- 只有请求来自可信代理时，系统才读取 `X-Forwarded-For` 或 `X-Real-IP`。
- 如果请求不是来自可信代理，使用 TCP 连接的 `remoteAddress`。

具体影响:

- 影响授权页 IP 白名单判断。授权管理页面会用系统识别出的来源 IP 去匹配 `adata_security_admin_ip_whitelist`。
- 影响 API 调用 IP 白名单判断。动态 API 会用系统识别出的来源 IP 去匹配 `adata_security_api_ip_whitelist`。
- 影响审计日志。`adata_security_audit_logs.client_ip` 记录的是系统识别出的来源 IP。

如果部署链路是:

```text
浏览器或调用方 -> Nginx 10.0.0.10 -> Node 服务
```

并且 `trustedProxies` 包含 `10.0.0.10`，系统会读取:

```text
X-Forwarded-For: 真实客户端 IP
X-Real-IP: 真实客户端 IP
```

此时白名单应配置真实客户端 IP，例如管理员办公电脑出口 IP 或 API 调用服务器出口 IP。

如果 `trustedProxies` 没有包含 `10.0.0.10`，或者请求不是来自可信代理，系统会忽略 `X-Forwarded-For` 和 `X-Real-IP`，只使用 TCP 直连的 `remoteAddress`。在上面的链路中，系统看到的来源 IP 会变成 `10.0.0.10`，具体结果是:

- 授权页 IP 白名单如果配置的是管理员真实出口 IP，会匹配失败，页面无法进入。
- API 调用 IP 白名单如果配置的是业务服务器真实出口 IP，会匹配失败，API 返回 `api ip is not allowed`。
- 审计日志里记录的 `client_ip` 会是代理 IP，不是真实访问者 IP。
- 如果为了绕过失败而把代理 IP 加进白名单，会导致所有经过该代理的请求看起来都来自同一个 IP，IP 白名单的精确限制能力会变弱。

错误配置风险:

- 不要把 `0.0.0.0/0`、公网网段或不受控来源配置为可信代理。
- 不要直接信任外部客户端自己传的 `X-Forwarded-For`。
- 如果攻击者能直接访问 Node 服务，并且该来源又被错误配置为可信代理，攻击者就可以伪造 `X-Forwarded-For` 绕过 IP 白名单。

排查方式:

```text
1. 确认 Node 服务实际收到的 remoteAddress 是哪台代理。
2. 将这台代理的内网 IP 加入 security.trustedProxies。
3. 确认代理确实转发 X-Forwarded-For 或 X-Real-IP。
4. 再配置授权页 IP 白名单和 API 调用 IP 白名单。
5. 查看审计日志 client_ip 是否已经变成真实客户端 IP。
```

### 3.3 配置授权页面 IP 白名单

授权页面属于高权限页面。上线前建议先配置授权页面 IP 白名单。

配置位置:

```text
主界面 -> 安全 -> 跳转 /security.html -> 授权页 IP
```

页面保存后写入数据库表:

```text
adata_security_admin_ip_whitelist
```

对应接口:

```http
GET /admin/security/admin-ip-whitelist
PUT /admin/security/admin-ip-whitelist
```

实现位置:

```text
src/security/ipWhitelistService.js
  assertAdminIpAllowed(clientIp)
  - 查询 adata_security_admin_ip_whitelist 的启用规则
  - 没有规则且 adminIpWhitelistRequired=false 时放行
  - 没有规则且 adminIpWhitelistRequired=true 时拒绝
  - 有规则时必须命中至少一条规则

src/security/securityMiddleware.js
  requireAdminPageIp(req)
  - /security.html 静态页面入口 IP 校验

  requireAuthManager(req)
  - /admin/security/* 安全管理接口校验
  - 校验登录态、授权页 IP 白名单、Authenticator 和 is_admin/can_manage_auth

src/server.js
  handleRequest(req, res)
  - 返回 /security.html 静态文件前调用 requireAdminPageIp(req)

  handleSecurityAdmin(req, res, url, body)
  - 用户管理、API 授权、API IP 白名单、授权页 IP 白名单、审计接口调用 requireAuthManager(req)
```

示例:

```text
192.168.1.10      管理员办公电脑
10.0.0.0/24       运维内网
```

规则:

- 授权页 IP 白名单只在 `security.enabled = true` 时生效；如果 `security.enabled = false`，安全模块处于开发/关闭状态，白名单不会限制 `/security.html` 或 `/admin/security/*`。
- `/security.html` 静态页面本身只校验授权页 IP 白名单，不在静态文件返回前校验登录态、Authenticator 或管理权限。
- `/security.html` 页面加载后会调用 `/admin/security/*` 安全管理接口；这些接口会继续校验登录态、授权页 IP 白名单、Authenticator 和 `is_admin`/`can_manage_auth`。
- 表里只有 `enabled = 1` 的规则参与匹配；禁用规则不会生效。
- 表里存在启用规则时，来源 IP 必须命中至少一条规则，否则不能打开 `/security.html`，也不能调用安全管理接口。
- 白名单只保护安全管理入口和安全管理接口，不代替登录、Authenticator 和管理权限。

当前实现中的“不配置”影响:

- 如果 `security.enabled = false`，即使 `adata_security_admin_ip_whitelist` 配了启用规则，也不会限制安全管理页面和安全管理接口。
- 如果 `security.enabled = true`，并且 `adata_security_admin_ip_whitelist` 没有启用规则，同时 `app.config.jsonc` 中 `security.adminIpWhitelistRequired = false`，`/security.html` 不做 IP 限制；安全管理接口仍会校验登录态、Authenticator 和 `is_admin`/`can_manage_auth`。
- 如果 `security.enabled = true`，并且 `adata_security_admin_ip_whitelist` 没有启用规则，但 `security.adminIpWhitelistRequired = true`，所有来源 IP 都不能打开 `/security.html`，也不能进入授权管理接口，会返回 `admin ip is not allowed`。这个配置适合生产强制要求先有白名单，但首次初始化时要谨慎。
- 如果 `security.enabled = true`，并且表里已经有启用规则，无论 `adminIpWhitelistRequired` 是 `true` 还是 `false`，请求来源 IP 都必须命中至少一条规则，否则不能进入安全管理页面，也不能调用用户授权、API IP 白名单、授权页 IP 白名单和审计等安全管理接口。

会受影响的页面和接口:

- `/security.html` 独立安全管理页面。
- 用户管理接口，例如 `GET /admin/security/users`。
- 用户到 API 授权接口，例如 `PUT /admin/security/users/{userId}/api-permissions`。
- API 调用 IP 白名单接口，例如 `PUT /admin/security/apis/{apiId}/ip-whitelist`。
- 授权页 IP 白名单接口，例如 `PUT /admin/security/admin-ip-whitelist`。
- 安全审计接口，例如 `GET /admin/security/audit-logs`。

不影响的内容:

- 普通登录接口 `/admin/security/login`。
- 当前用户查询 `/admin/security/me`。
- 动态 API 自身的用户到 API 权限校验。
- 动态 API 自身的 API 调用 IP 白名单校验；它使用的是 `adata_security_api_ip_whitelist`。

建议上线流程:

```text
1. 先确认 trustedProxies 配置正确，审计日志中的 client_ip 已经是真实管理员出口 IP。
2. 管理员登录并绑定 Authenticator。
3. 进入 /security.html 的“授权页 IP”页签。
4. 添加管理员办公出口 IP、运维堡垒机 IP 或内网 CIDR。
5. 保存后退出页面，用允许的 IP 再访问一次确认可进入。
6. 需要强制生产环境必须配置白名单时，再将 security.adminIpWhitelistRequired 改为 true。
```

锁定恢复:

- 如果配置错误导致无法进入安全管理页面，优先从仍在白名单内的 IP 访问后修正。
- 如果没有任何可用白名单 IP，需要由数据库管理员直接修改 `adata_security_admin_ip_whitelist`，新增正确 IP 或临时禁用错误规则。
- 如果表中已经存在启用规则但当前 IP 不匹配，单纯把 `security.adminIpWhitelistRequired` 改成 `false` 不能恢复访问；因为只要表里有启用规则，就会强制匹配规则。

## 4. 用户注册操作

### 4.1 普通用户注册

操作流程:

```text
1. 打开注册页面
2. 输入账号、显示名称、密码
3. 提交注册
4. 系统创建用户
5. 用户进入 Authenticator 绑定流程
```

账号要求建议:

- 只能包含字母、数字、下划线、短横线、点号。
- 长度 3 到 100。
- 不允许重复。

密码要求建议:

- 最少 12 位。
- 至少包含字母和数字。
- 不允许和账号相同。
- 不允许使用常见弱密码。

### 4.2 管理员创建用户

系统管理员也可以在用户管理页面创建用户。

操作流程:

```text
1. 系统管理员登录
2. 进入用户管理页面
3. 点击新增用户
4. 填写账号、显示名称、初始密码
5. 设置用户状态为 active
6. 保存
7. 通知用户首次登录并绑定 Authenticator
```

是否授权管理权限:

- 普通 API 调用用户: `is_admin = 0`，`can_manage_auth = 0`
- API 开发者: `is_admin = 0`，`can_manage_auth = 0`，`can_develop_api = 1`，并在 `adata_security_api_developers` 中配置具体 API 权限
- 授权管理员: `is_admin = 0`，`can_manage_auth = 1`
- 系统管理员: `is_admin = 1`，`can_manage_auth = 1`，`can_develop_api = 1`

## 5. Google Authenticator 绑定操作

### 5.1 绑定流程

```text
1. 用户登录后进入绑定页面
2. 页面显示二维码
3. 用户打开 Google Authenticator
4. 点击添加账号
5. 扫描二维码
6. Google Authenticator 生成 6 位验证码
7. 用户在页面输入验证码
8. 点击确认绑定
9. 系统提示绑定成功
```

绑定成功后:

```text
totp_enabled = 1
```

### 5.2 绑定失败处理

常见原因:

- 用户手机时间不准。
- 验证码已过期。
- 用户扫错二维码。
- 用户重复提交旧验证码。

处理方式:

```text
1. 让用户确认手机时间自动同步已开启
2. 等待新的 6 位验证码刷新后再输入
3. 如果仍失败，由管理员重置 TOTP 绑定状态
4. 用户重新绑定
```

### 5.3 更换手机

推荐流程:

```text
1. 用户提交重置申请
2. 系统管理员核实身份
3. 管理员重置用户 totp_enabled = 0
4. 用户重新登录并绑定新设备
5. 系统记录安全审计日志
```

如果后续实现恢复码，优先使用恢复码完成自助恢复。

## 6. 登录操作

### 6.1 正常登录

```text
1. 打开登录页面
2. 输入账号和密码
3. 输入 Google Authenticator 6 位验证码
4. 点击登录
5. 系统校验成功后进入后台
```

登录成功后，前端保存访问 token。

后续请求带:

```http
Authorization: Bearer <access_token>
```

### 6.2 登录失败处理

账号密码失败:

```text
1. 提示账号或密码错误
2. 记录失败日志
3. 连续失败达到阈值后临时锁定
```

Authenticator 失败:

```text
1. 提示验证码错误或已过期
2. 记录失败日志
3. 连续失败达到阈值后临时限制登录
```

账号被禁用:

```text
1. 返回账号不可用
2. 联系系统管理员处理
```

## 7. 授权页面访问操作

授权页面访问需要同时满足:

```text
1. 请求 IP 命中授权页面 IP 白名单
2. 用户已登录
3. 用户已完成 Google Authenticator 验证
4. 用户 is_admin = 1 或 can_manage_auth = 1
```

操作流程:

```text
1. 管理员从允许的 IP 访问后台
2. 登录并完成 Authenticator 验证
3. 在主界面点击“安全”，跳转到 /security.html 独立安全管理页面
4. 系统校验管理权限
5. 校验通过后展示授权页面
```

如果无法进入授权页面:

- 检查当前出口 IP 是否在 `adata_security_admin_ip_whitelist`。
- 检查用户是否登录。
- 检查用户是否绑定并通过 Authenticator。
- 检查用户是否有 `is_admin` 或 `can_manage_auth`。

## 8. 用户到 API 授权操作

### 8.1 给用户授权 API

操作流程:

```text
1. 授权管理员进入 API 授权页面
2. 在左侧选择用户
3. 在右侧 API 列表中勾选允许调用的 API
4. 可按名称、路径、标签筛选 API
5. 点击保存
6. 系统写入 adata_security_user_api_permissions
7. 系统记录 permission.grant 审计日志
```

授权结果:

```text
用户可以调用已勾选的 API
```

### 8.2 取消用户 API 授权

操作流程:

```text
1. 进入 API 授权页面
2. 选择用户
3. 取消勾选不再允许调用的 API
4. 点击保存
5. 系统更新 revoked_at 或 can_execute = 0
6. 系统记录 permission.revoke 审计日志
```

取消后:

```text
用户再次请求该 API 返回 403
```

### 8.3 授权检查

API 请求时系统自动检查:

```text
1. token 是否有效
2. 用户状态是否 active
3. API 是否 published
4. 用户是否有当前 API 的 can_execute 权限
```

任何一步失败，都不执行 SQL 和 JS。

## 9. API 调用 IP 白名单操作

### 9.1 配置某个 API 的调用 IP 白名单

操作位置建议:

```text
API 编辑页 -> 安全 -> 调用 IP 白名单
```

或:

```text
API 授权页 -> 选中 API -> 调用 IP 白名单
```

操作流程:

```text
1. 授权管理员进入 API 调用 IP 白名单配置
2. 选择 API
3. 添加允许调用的服务器 IP 或 CIDR
4. 填写说明
5. 启用规则
6. 点击保存
```

配置示例:

```text
192.168.1.10      订单服务服务器
192.168.1.11      订单服务备用服务器
10.0.2.0/24       生产应用网段
```

### 9.2 不配置 IP 白名单

如果某个 API 没有配置启用的白名单:

```text
不限制调用 IP
```

仍然需要:

```text
有效 token + 用户已授权该 API
```

### 9.3 配置后调用规则

如果某个 API 配置了启用的白名单:

```text
有效 token + 用户已授权该 API + 请求来源 IP 命中白名单
```

如果 IP 不命中:

```text
返回 403
不执行 SQL
不执行 JS
记录 api_ip.deny 审计日志
```

## 10. API 调用方操作

### 10.1 获取 token

调用方先通过登录接口获取 token。

示例:

```http
POST /admin/security/login
Content-Type: application/json

{
  "username": "api_user",
  "password": "password",
  "totpCode": "123456"
}
```

响应:

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "accessToken": "token",
    "expiresAt": "2026-09-04T10:00:00.000Z"
  }
}
```

### 10.2 调用动态 API

示例:

```http
POST /api/order/list
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "customerId": 1001
}
```

调用成功:

```json
{
  "code": 0,
  "data": []
}
```

### 10.3 常见失败

未带 token:

```text
401 unauthorized
```

token 过期:

```text
401 token expired
```

用户没有 API 权限:

```text
403 api permission denied
```

来源 IP 不在该 API 白名单:

```text
403 api ip not allowed
```

用户被禁用:

```text
403 user disabled
```

## 11. 审计查询操作

管理员需要能查询安全审计日志。

建议筛选条件:

- 事件类型。
- 操作人。
- 目标用户。
- API。
- IP。
- 成功或失败。
- 时间范围。

常用审计场景:

```text
1. 查看某个用户最近登录失败原因
2. 查看谁给某个用户授权了 API
3. 查看某个 API 被哪些 IP 拒绝过
4. 查看授权页面是否有非白名单 IP 访问
5. 查看某个管理员最近做过哪些授权变更
```

## 12. 运维检查清单

上线前检查:

- HTTPS 已启用。
- 初始管理员已修改密码。
- 管理员已绑定 Google Authenticator。
- 授权页面 IP 白名单已配置。
- 可信代理 IP 已配置。
- 不直接信任外部 `X-Forwarded-For`。
- 用户密码策略已开启。
- 登录失败限流已开启。
- TOTP 失败限流已开启。
- 安全审计日志已开启。
- 动态 API 已接入 Bearer token 校验。
- API 执行前已接入用户到 API 权限校验。
- API 调用 IP 白名单已按需配置。

日常检查:

- 定期检查管理员账号。
- 定期检查 `can_manage_auth = 1` 的用户。
- 定期检查长期未使用的用户。
- 定期清理过期会话。
- 定期复核敏感 API 的授权用户。
- 定期复核敏感 API 的调用 IP 白名单。
- 定期导出并备份安全审计日志。

## 13. 应急处理

### 13.1 用户 token 泄漏

处理流程:

```text
1. 系统管理员进入用户会话页面
2. 找到用户当前会话
3. 撤销相关 token
4. 要求用户修改密码
5. 检查用户最近 API 调用日志
6. 记录安全事件
```

### 13.2 管理员账号泄漏

处理流程:

```text
1. 立即禁用该管理员账号
2. 撤销该用户所有会话
3. 检查授权变更审计日志
4. 回滚异常授权
5. 重置密码和 Authenticator
6. 复核授权页面 IP 白名单
```

### 13.3 Authenticator 丢失

处理流程:

```text
1. 用户提交申请
2. 管理员线下核实身份
3. 重置用户 TOTP 绑定
4. 用户重新绑定 Authenticator
5. 检查是否存在异常登录
```

### 13.4 API 被非预期服务器调用

处理流程:

```text
1. 查看 API 调用日志和安全审计日志
2. 确认来源 IP
3. 检查 API 是否配置调用 IP 白名单
4. 如果未配置，为该 API 添加白名单
5. 如果已配置，检查可信代理配置是否正确
6. 撤销可疑用户 token
```

## 14. 建议实施顺序

1. 创建安全相关数据表。
2. 实现用户注册和密码哈希。
3. 实现 Authenticator 绑定。
4. 实现登录和 token。
5. 管理端页面接入登录态。
6. 实现用户管理页面。
7. 实现授权页面 IP 白名单。
8. 实现 API 授权页面。
9. 动态 API 接入用户到 API 权限校验。
10. 实现 API 调用 IP 白名单配置。
11. 增加审计日志页面。
12. 增加恢复码和高风险操作二次确认。
