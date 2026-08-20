# Chat Log

用于保存项目相关聊天记录、问题定位和处理结果。

## 2026-08-19

### JS 编辑器对象属性补全

- 问题：JS 编辑器中定义变量并赋值对象后，变量无法获取对象属性提示。
- 处理：在 `public/app.js` 中新增对象字面量扫描逻辑，支持 `const/let/var name = { ... }` 形式的本地对象属性补全。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过，当前项目没有测试用例。
  - 临时 Node 用例验证 `obj.`、`obj.na`、嵌套对象、多个变量声明和注释过滤逻辑正常。

### 聊天记录文档

- 新建 `CHAT_LOG.md`，作为后续项目聊天记录的固定保存位置。

### 项目规则

- 新建 `AGENTS.md`，写入规则：每次对话的记录都放在 `CHAT_LOG.md` 中。

### API 实现关键代码

- 用户要求查看 API 实现的关键代码。
- 关键链路：`src/server.js` 接收 `/api/*` 请求，`src/runtime.js` 编排动态 API 执行，`src/sqlExecutor.js` 执行 SQL，`src/scriptRunner.js` 和 `src/scriptWorker.js` 执行用户 JS 脚本。

### 代码注释规则

- 用户要求在 `AGENTS.md` 增加规则：代码需要注释。
- 后续需要为现有项目自有代码补齐必要注释，不包含 `node_modules` 和 `public/vendor` 目录。
- 已在 `AGENTS.md` 增加规则：代码需要补充必要注释，说明核心流程、边界条件和非显而易见的实现。
- 已为 `src/*.js`、`public/app.js`、`public/index.html` 和 `public/style.css` 补充注释。
- 验证：
  - `node --check src/*.js public/app.js` 通过。
  - `npm test` 通过，当前项目没有测试用例。

### 项目文档检查

- 用户要求检查项目有多少个文档及各自作用。

### 非 Node.js 实现方式

- 用户询问：除了使用 Node.js 实现，是否还有其它实现方式。

### 当前技术方案

- 用户询问项目现在使用的方案。
- 当前项目使用原生 Node.js HTTP 服务，CommonJS 模块，MySQL 存储，前端为静态 HTML/CSS/JS + CodeMirror。

### Node.js 方案优势

- 用户询问当前项目选用 Node.js 的优势。

### API 并发能力

- 用户询问并发 API 请求理论支持数量。

### 示例参数 JSON 校验

- 用户要求校验示例参数是否为合法 JSON；如果不是，编辑器边框显示红色。
- 已在 `public/app.js` 为示例参数 CodeMirror 增加实时 JSON 对象校验。
- 已在 `public/style.css` 增加 `CodeMirror-invalid` 红色边框样式。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过，当前项目没有测试用例。

### API 列表激活项说明

- 用户要求在 `.api-item.active` 中把 API 说明也加上。
- 已在 `public/app.js` 中让激活的 API 列表项显示 `description`，没有说明时显示“暂无说明”。
- 已在 `public/style.css` 中新增 `.api-description` 样式，最多显示两行。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过，当前项目没有测试用例。

### SQL 输入回填示例参数

- 用户询问 SQL 输入时是否会回填示例参数。
- 当前 `public/app.js` 中 SQL 编辑器 `change` 事件会调用 `completeParamsFromSql()`，自动把 SQL 中的 `:name` 参数补到示例参数 JSON 中。
- 用户要求去掉 SQL 输入时自动回填示例参数的功能。
- 已移除 SQL 编辑器 `change` 事件中的 `completeParamsFromSql()` 调用；执行 SQL 时仍会做参数补齐。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过，当前项目没有测试用例。

### SQL 输入格式扩展

- 用户要求 SQL 输入支持两种模式：纯 SQL 和 MyBatis XML 格式。
- 已在 `src/sqlExecutor.js` 增加 SQL 标准化逻辑：纯 SQL 原样处理，MyBatis XML 提取单个 `<select>` 内容。
- MyBatis XML 支持 `#{param}` 参数绑定，并拒绝不安全的 `${param}`。
- 当前不支持 MyBatis 动态标签，如 `<if>`、`<foreach>`、`<where>` 等。
- 已在 `public/app.js` 中让示例参数抽取识别 `#{param}`。
- 已新增 `test/sqlExecutor.test.js`，覆盖纯 SQL、MyBatis `#{}`、XML 提取、动态标签拒绝和 `${}` 拒绝。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### MyBatis 动态标签可行性

- 用户询问 MyBatis 动态标签现在是否做不到。

### MyBatis 动态标签实现

- 用户要求实现第一阶段和第二阶段 MyBatis 动态标签支持。
- 计划支持 `<if>`、`<where>`、`<foreach>`、`<choose>`、`<when>`、`<otherwise>` 的受控子集。
- 已在 `src/sqlExecutor.js` 实现 MyBatis XML 片段解析和动态 SQL 渲染。
- 已支持 `<if>`、`<where>`、`<foreach>`、`<choose>`、`<when>`、`<otherwise>`。
- `<if test="">` 支持常见表达式：字段真假、`!field`、`==/!= null`、`==/!= ''`、数字比较、`and/or` 组合、`ids.size > 0`。
- `<foreach>` 支持数组展开，并生成内部绑定参数，仍使用 mysql2 `?` 参数绑定。
- 已更新 `INSTALL.md` 和 `readme.md` 说明支持范围。
- 已更新 `test/sqlExecutor.test.js` 覆盖动态标签。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### SQL 编辑模式选择

- 用户要求在 SQL 编辑框上增加选择项：原生 SQL 或 XML。
- 已在 `public/index.html` 的 SQL 面板增加模式选择框：原生 SQL / MyBatis XML。
- 已在 `public/app.js` 增加 `detectSqlMode()`，根据编辑器内容自动识别并切换选择项。
- 已在 `public/style.css` 增加 `.sql-mode-select` 样式。
- 选择项仅作为编辑提示，不改变 SQL 内容；后端执行仍自动识别纯 SQL 或 MyBatis XML。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### SQL 模式持久化

- 用户要求 SQL 模式选择保存到数据库中，后端执行时按模式区分原生 SQL 和 MyBatis XML。
- 已在 `src/store.js` 为 API 配置增加 `sqlMode` 字段映射，数据库字段为 `sql_mode`。
- 新建表时 `ssql_api_definitions` 包含 `sql_mode varchar(20) not null default 'sql'`。
- 旧表启动时会自动添加 `sql_mode` 字段，并按旧 SQL 内容回填 XML 模式。
- 已在 `public/app.js` 保存 `sqlMode`，加载 API 时优先使用后端返回的保存模式。
- 已调整 `src/sqlExecutor.js`，执行时优先按 `api.sqlMode` 选择原生 SQL 或 MyBatis XML；旧数据无模式时才自动识别。
- 已更新 `INSTALL.md`、`readme.md` 和 `test/sqlExecutor.test.js`。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 移除冒号参数

- 用户要求去掉 SQL 中 `:id` 这种参数替换方式。
- 已移除 `src/sqlExecutor.js` 中 `:name` 参数编译逻辑，仅保留 `#{name}` 参数绑定。
- 已移除 `public/app.js` 中 `:name` 参数抽取逻辑，仅抽取 `#{name}`。
- 已将 SQL 编辑框占位示例从 `:userId` 改为 `#{userId}`。
- 已更新 `INSTALL.md`、`readme.md` 和 `test/sqlExecutor.test.js`。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### SQL 参数高亮

- 用户反馈改用 `#{}` 参数后 SQL 语法高亮有问题。
- 原因：CodeMirror MySQL mode 会把 `#` 识别为注释开头。
- 已在 `public/app.js` 新增 `ssql-mysql` 自定义模式，优先识别 `#{param}` / `#{param, jdbcType=...}`，其它内容继续交给原生 MySQL 高亮。
- 已在 `public/style.css` 增加 `.cm-ssql-param` 参数样式。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### MyBatis if 入参读取

- 用户询问 MyBatis `<if test="">` 表达式如何取入参。

### API 请求调试文件

- 用户要求将每次 API 请求对应的入参、原始 SQL、JS 和转换后的 SQL 保存到文件中，用于后续调试。
- 已在 `src/sqlExecutor.js` 增加 `prepareSqlExecution()`，输出原始 SQL、SQL 模式、动态标签渲染后的 SQL、加 limit 后的 SQL、最终绑定 SQL 和绑定值。
- 已在 `src/runtime.js` 中为每次动态 API 执行写入调试 JSON 文件，目录为 `data/api-debug/`。
- 调试文件包含：请求 ID、父请求 ID、API 信息、调用链、入参、SQL 调试信息、JS 脚本、脚本结果和错误信息。
- 成功和失败请求都会尝试写入调试文件；写文件失败不会影响 API 主流程。
- 已更新 `INSTALL.md` 和 `readme.md` 说明调试文件位置和用途。
- 已更新 `test/sqlExecutor.test.js` 覆盖 SQL 调试快照。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 当前目录文件夹

- 用户要求查看当前目录文件夹。

### MyBatis if 表达式大于号问题

- 用户提供 API 调试文件，反馈 `<if test="id>0">` 没有生效。
- 初步判断原因：MyBatis XML 解析器把属性值里的 `>` 当成标签结束，导致 `test` 表达式没有正确解析。
- 已修复 `src/sqlExecutor.js` 的 MyBatis XML 片段解析器，标签结束符 `>` 现在会忽略引号内的内容。
- 已新增测试覆盖 `<if test="id>0">`。
- 额外发现用户脚本中 `callApi(...)` 未使用 `await`，该调用返回 Promise，后续 `classItem.code` 不会按预期读取。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 接口信息与示例参数合并

- 用户要求将“示例参数”和“接口信息”合并放在一起。
- 已调整 `public/index.html`，将示例参数编辑器移入“接口信息”面板。
- 已删除独立“示例参数”面板。
- 已在 `public/style.css` 增加 `.params-field` 和 `.field-title` 样式。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### SQL 前参数处理脚本

- 用户补充需求：执行 SQL 前可以用 JS 处理入参，或者直接返回数据。
- 用户要求 JS 处理增加类型：1 参数处理，2 结果集处理；原 JS 归到结果集处理。
- 用户进一步要求“接口信息”中示例参数放在右边。
- 已在 `public/index.html` 增加左右两栏结构，左侧为接口基础信息，右侧为示例参数。
- 已在 `public/style.css` 增加 `.api-info-grid`，小屏幕下自动回到单列。
- 已在 `ssql_api_definitions` 表增加 `param_script_text` 字段，并补充启动迁移逻辑。
- 已在运行时执行链路中加入参数处理脚本：参数校验后、SQL 执行前运行。
- 参数处理脚本返回普通对象时作为新的 SQL 入参；返回 `{ params: {...} }` 时使用其中的 `params`；返回 `{ directReturn: true, data }` 时跳过 SQL 和结果集处理，直接返回 `data`。
- 已在前端 JS 编辑器增加“1 参数处理 / 2 结果集处理”选择器，原 JS 内容保存为结果集处理脚本。
- 已去掉执行 SQL 时根据 `#{}` 自动回填示例参数的旧逻辑。
- 已将参数处理脚本、参数处理结果写入每次 API 请求的 `data/api-debug/` 调试文件。
- 已更新 `INSTALL.md`、`readme.md` 和 `test/runtime.test.js`。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 多数据库别名与取消最大行限制

- 用户要求数据库配置增加别名和数据库类型，支持 `mssql`、`mysql` 并便于扩展。
- 用户要求 API 增加数据库别名选择。
- 用户要求取消最大行限制。
- 已将 `database.config.json` 调整为 `defaultAlias` + `connections[]` 结构，每个连接包含 `alias` 和 `type`。
- 已兼容旧格式 `{ mysql: {...} }`，配置读取时会归一化为数据源列表。
- 已新增管理接口 `GET /admin/database-sources`，只返回脱敏后的 `alias/type/label`，不暴露密码。
- 已在 API 定义表新增 `database_alias` 字段，并补充旧表迁移逻辑。
- 已在接口信息表单增加数据库别名下拉框，保存 API 时写入 `databaseAlias`。
- 已在 SQL 执行器中按数据源类型选择驱动：`mysql2` 执行 MySQL，`mssql` 执行 MSSQL。
- 已将 `#{}` 参数按数据库类型编译：MySQL 使用 `?`，MSSQL 使用 `@p0`、`@p1`。
- 已取消 SQL 自动最大行包装，并移除 API 调试日志中的 `limitedSql` 字段。
- 已安装 `mssql` 依赖并更新 `package-lock.json`。
- 已过滤传给 MySQL2 的数据源元信息字段，避免 `alias/type/server` 触发驱动警告。
- 已更新 `INSTALL.md`、`readme.md`、`test/config.test.js`、`test/sqlExecutor.test.js`。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。
  - `PORT=3012 npm run dev` 启动通过。
  - `curl -I http://127.0.0.1:3012/` 返回 `200 OK`。
  - `curl -L http://127.0.0.1:3012/admin/database-sources` 返回默认 MySQL 数据源。

### SQL 与 JS 帮助提示

- 用户要求 `readme.md` 增加数据库配置 demo。
- 用户要求 Web 页面 SQL 位置增加帮助，可查看原生 SQL 写法和 MyBatis XML 写法。
- 用户要求 JS 参数处理中给出一种不执行 SQL 直接返回的情况。
- 用户要求 JS 处理位置增加帮助，提示什么情况下直接返回、什么情况下继续执行。
- 已在 `readme.md` 增加 `database.config.json` demo，包含 MySQL 和 MSSQL 两个数据源。
- 已在 SQL 面板增加“帮助”按钮，展开后可切换“原生 SQL”和“MyBatis XML”示例。
- 已将参数处理默认脚本改为包含 `params.skipSql === true` 时 `{ directReturn: true, data }` 直接返回的示例。
- 已在 JS 处理面板增加“帮助”按钮，说明参数处理直接返回与继续执行 SQL 的返回约定。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 帮助按钮位置调整

- 用户要求帮助按钮都放在最后。
- 已将 SQL 面板的“帮助”按钮移动到“执行 SQL”按钮之后。
- JS 面板的“帮助”按钮已位于操作区最后，无需调整。

### 帮助框关闭按钮

- 用户要求 `scriptHelpBox` 和 `sqlHelpBox` 右上角增加关闭按钮。
- 已在两个帮助框右上角增加关闭按钮，点击后隐藏对应帮助框。

### 保存后保留 JS 类型

- 用户反馈保存后 JS 类型会自动跳到“结果集处理”。
- 原因是 `fillForm()` 在保存回填服务端数据时固定设置 `state.scriptType = "result"`。
- 已调整 `fillForm(api, { keepScriptType: true })`，保存后保留当前 JS 类型；切换 API 时仍默认显示“结果集处理”。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 参数处理脚本默认空

- 用户要求 JS 参数处理默认空，程序需要支持为空时不处理参数。
- 后端已有 `hasScript(api.paramScriptText)` 判断，空脚本会跳过参数处理，直接继续 SQL。
- 已将前端 `defaultParamScript` 改为空字符串。
- 已调整表单回填，空的 `paramScriptText` 不再被默认脚本替换。
- 已在 JS 帮助中说明：参数处理留空时不处理参数，直接继续执行 SQL。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### MyBatis XML 高亮

- 用户反馈 SQL 选择 XML 时语法高亮显示不对。
- 原因是 XML 模式仍使用 `ssql-mysql`，XML 标签被按 SQL 文本解析。
- 已新增 `ssql-mybatis-xml` CodeMirror 模式，支持 XML 标签、属性、字符串、注释、CDATA、SQL 关键字和 `#{}` 参数高亮。
- 已在 SQL 模式切换和表单回填时动态切换编辑器 mode：原生 SQL 使用 `ssql-mysql`，MyBatis XML 使用 `ssql-mybatis-xml`。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### SQL 多语句校验误判

- 用户反馈出现 `multiple sql statements are not allowed`。
- 原逻辑使用 `clean.includes(";")` 判断多语句，会把字符串或注释里的分号也当成语句分隔符。
- 已改为扫描 SQL：跳过字符串、行注释、块注释和 MSSQL 方括号标识符，仅当分号后还有真实 SQL token 时才判定为多语句。
- 仍然禁止真实多语句，例如 `select 1; select 2`。
- 已新增测试覆盖字符串/注释分号允许，以及真实多语句拒绝。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。

### 多结果集、多语句和临时表

- 用户要求支持多个结果集。
- 用户要求支持多条语句和临时表。
- 已将 SQL 校验从“禁止多语句”调整为“逐语句白名单校验”。
- 支持多条查询语句，以及临时表批处理：
  - `create temporary table ...`
  - `insert into` 已创建的临时表
  - 多个 `select`
  - `drop temporary table ...`
  - MSSQL 临时表 `#table` 的 `create table #...` / `drop table #...`
- 仍禁止写入真实业务表和高危语句。
- MySQL 执行改为 `query()` 并开启 `multipleStatements: true`，保证临时表在同一个连接内可用。
- MySQL 参数执行增加内部转义 SQL，避免 `query()` 把字符串里的普通 `?` 误当成占位符。
- SQL 执行结果新增 `resultSets`，`rows` 仍保持为第一个结果集以兼容旧脚本。
- JS 结果集脚本现在可读取 `resultSets`。
- 管理端 `test-sql` / `test-script` 返回 `resultSets`。
- API 调试文件写入 `sqlRows` 和 `sqlResultSets`。
- 已更新 `INSTALL.md`、`readme.md` 和页面帮助说明。
- 验证：
  - `node --check src/*.js public/app.js test/*.js` 通过。
  - `npm test` 通过。
  - 使用当前 MySQL 数据源真实验证临时表批处理，返回 2 个结果集。

### 默认返回多结果集

- 用户要求返回值不需要保留旧格式，直接返回多结果集。
- 已将结果集处理默认脚本改为 `async function main({ params, resultSets, callApi }) { return resultSets; }`。
- 已更新页面初始 JS 示例和 JS 帮助说明。
- 已更新 `readme.md`、`INSTALL.md`，文档示例改为直接 `return resultSets`。

### MSSQL 连接测试

- 用户提供 MSSQL 数据源配置，要求检查数据库是否能够连接。
- 使用 `mssql` 驱动测试 `192.168.3.2:1433`，执行 `select 1 as ok`。
- 沙箱内纯 TCP 探测被限制，返回 `EPERM`。
- 非沙箱 MSSQL 连接测试返回 `ETIMEOUT`：`Failed to connect to 192.168.3.2:1433 in 5000ms`。
- 判断当前机器到该地址端口无法建立连接，更像网络、端口、防火墙或 SQL Server TCP 监听配置问题；不是账号密码校验失败。

### README 补充 JS main 入参

- 用户要求把入参内容写到 `readme.md`。
- 已在 JS 脚本设计和 `runScript` 实现方案中补充 `main()` 入参说明。
- 明确 `main()` 只有一个对象入参，可解构 `params`、`headers`、`rows`、`resultSets`、`context`、`callApi` 6 个字段。
- 明确参数处理阶段和结果集处理阶段的差异，以及 `directReturn` 跳过 SQL 的返回规则。

### 检查服务端口外部访问

- 用户要求检查服务是否能对外访问。
- `ss -ltnp` 显示当前 Node 服务监听 `0.0.0.0:3010` 和 `0.0.0.0:3012`，不是只监听 `127.0.0.1`。
- 本机访问 `http://127.0.0.1:3010/`、`http://127.0.0.1:3012/`、`http://172.26.169.137:3010/`、`http://172.26.169.137:3012/` 均返回 `200 OK`。
- 当前环境为 WSL2，网络模式是 `nat`。
- Windows `portproxy` 当前只配置了 `0.0.0.0:1433 -> 172.26.169.137:1433`，没有 `3010` 或 `3012`。
- Windows 防火墙规则查询因权限不足返回拒绝访问，无法确认 Windows 入站防火墙是否放行。

### Nginx 反向代理对外访问

- 用户要求项目通过 Nginx 反向代理对外访问。
- 当前 WSL 内没有安装 `nginx` 命令，无法直接启用本机 Nginx。
- 已新增 `deploy/nginx/ssql.conf`，默认由 Nginx `80` 端口代理到 Node `127.0.0.1:3010`。
- 已在 `readme.md` 增加 Nginx 反向代理说明，包含启用配置、切换到 `3012` 端口，以及 WSL2 NAT 下 Windows `portproxy` 和防火墙放行示例。

### 修复反代子路径下 CSS 和 JS 读取

- 用户澄清 Nginx 在 Windows 下，需求不是生成 Nginx 配置，而是调整 Web 的 CSS 和 JS 资源读取。
- 已移除误加的 `deploy/nginx/ssql.conf`，并删除 `readme.md` 中对应的 Nginx 配置说明段落。
- 已将 `public/index.html` 中 CSS 和 JS 引用从 `/style.css`、`/app.js`、`/vendor/...` 改为相对路径。
- 已在 `public/app.js` 中根据当前 `app.js` 地址推导反代子路径前缀，后台 `/admin/*` 请求会自动带上该前缀。
- 验证：
  - `node --check public/app.js` 通过。
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 本机 `HEAD /`、`HEAD /style.css`、`HEAD /app.js` 返回 `200 OK`。
