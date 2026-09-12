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

### data 目录文件性质

- 用户询问 `data/` 下是否都是临时文件。
- 检查到 `data/server.log` 是服务运行日志，`data/api-debug/*.json` 是每次动态 API 执行的调试快照，可按需清理。
- `data/apis.json` 是旧版本 API 配置文件，当前启动迁移逻辑会在 MySQL 表为空时读取它迁移到数据库，不建议随手删除。
- `data/logs.json` 是旧版本调用日志遗留文件，当前代码未继续写入。
- `data/.gitkeep` 用于保留空目录。

### 修复 data 删除后 server.log 写入失败

- 用户反馈 `Error: ENOENT: no such file or directory, open '/home/unixname/ssql/data/server.log'`。
- 原因是 `data/` 被清理后，`Logger.write()` 直接 `appendFileSync(data/server.log)`，没有重新创建目录。
- 已调整 `src/logger.js`，构造 Logger 时创建 `data/`，每次写日志前也重新确保 `data/` 存在。
- 已新增 `test/logger.test.js`，覆盖运行中删除 `data/` 后日志写入会自动恢复目录和 `server.log`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 文件下载 Capability 实现

- 用户要求：采用 capability 权限模型，为脚本增加文件下载和读取文件内容大小能力。
- 已新增 `src/capabilities.js`，注册 `files.inspectUrl` 和 `files.downloadTemp`：
  - `files.inspectUrl(url, options)`: 优先通过 `HEAD` 读取 `Content-Length`，缺失时用 `GET` 流式统计字节数。
  - `files.downloadTemp(url, options)`: 下载到受控临时目录并返回 `fileId`、`filename`、`contentType`、`size`。
- 已在 `src/scriptWorker.js` 注入冻结的 `files` 对象，脚本只能通过 Worker 消息请求主线程代理执行能力。
- 已在 `src/scriptRunner.js` 增加 capability 消息校验，并移除对 URL 字符串中 `http/https` 的误拦截。
- 已在 `src/runtime.js` 接入按 API 授权的 `executeScriptCapability`，能力调用会写入结构化审计日志。
- 已在 `src/store.js` 增加 `script_capabilities` 字段、迁移逻辑和 `scriptCapabilities` 读写映射。
- 已在管理页增加“脚本能力”勾选项：`探测网络文件大小`、`下载到临时文件`，并补充 JS 编辑器补全。
- 默认安全限制：
  - 文件能力默认只允许 `https:`。
  - 默认禁止访问内网地址。
  - 默认最大文件大小 10MB。
  - 支持通过 `FILE_CAPABILITY_ALLOWED_PROTOCOLS`、`FILE_CAPABILITY_ALLOWED_HOSTS`、`FILE_CAPABILITY_ALLOW_PRIVATE_NETWORK`、`FILE_CAPABILITY_MAX_BYTES`、`FILE_CAPABILITY_TIMEOUT_MS`、`FILE_CAPABILITY_TEMP_DIR` 调整。
- 已更新 `readme.md` 和测试。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/capabilities.test.js test/scriptRunner.test.js` 通过。
  - `npm test` 通过。
  - 已用 `PORT=3015 npm run dev` 启动服务，启动时自动迁移 `ssql_api_definitions.script_capabilities` 字段，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### 本次配置文件调整记录

- 本次 `loadConfig` 运行配置迁移到 `app.config.json` 的完整记录见本文件前文同名章节。

### 重启服务

- 用户再次要求重启服务。
- 已停止上一轮运行在 `3015` 的服务进程，并重新执行 `PORT=3015 npm run dev`。
- 新服务启动成功，监听 `http://0.0.0.0:3015`。
- 验证：`curl -I http://127.0.0.1:3015/` 返回 `200 OK`，`ss -ltnp` 确认 `0.0.0.0:3015` 由 node 进程监听。
- 停止旧服务时观察到近期文件 capability 请求被默认策略拦截：未授权调用和内网 IP 禁止访问。

### 关闭 3015 服务

- 用户要求关闭 `3015`。
- 已停止当前运行在 `3015` 的服务进程。
- 验证：`ss -ltnp` 不再显示 `0.0.0.0:3015`，`curl -I http://127.0.0.1:3015/` 返回 connection refused。

### 保存 Loading 和完成提示

- 用户要求：保存的时候需要 loading，完成后要有提示。
- 已在管理页顶部增加 `toast` 提示容器。
- 已在 `public/app.js` 中为 `saveApi()` 增加保存中状态：保存时按钮显示 `保存中...`、禁用保存按钮并显示旋转 loading，完成或失败后恢复。
- 直接点击保存成功后显示顶部状态 `保存完成 ...` 和 toast `保存完成`；保存失败时显示 `保存失败: ...`。
- 执行 SQL 和发布时仍会自动保存，但不额外弹保存完成提示，避免覆盖后续操作状态。
- 已在 `public/style.css` 增加 loading 按钮和 toast 样式。
- 验证：
  - `node --check public/app.js` 通过。
  - `for file in src/*.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 已用 `PORT=3015 npm run dev` 启动服务，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### 重启服务

- 用户要求重启服务。
- 已停止上一轮运行在 `3015` 的服务进程，并重新执行 `PORT=3015 npm run dev`。
- 新服务启动成功，监听 `http://0.0.0.0:3015`。
- 验证：`curl -I http://127.0.0.1:3015/` 返回 `200 OK`，`ss -ltnp` 确认 `0.0.0.0:3015` 由 node 进程监听。

### loadConfig 运行配置迁移到配置文件

- 用户要求：`src/config.js` 的 `loadConfig` 中环境配置放到配置文件中，不要写死在程序里。
- 已新增 `app.config.json`，集中保存服务监听、目录、SQL/JS 超时、内部调用深度和文件 capability 默认策略。
- 已调整 `src/config.js`：`loadConfig()` 先读取 `app.config.json`，再允许环境变量作为部署时临时覆盖；相对路径会解析到项目根目录。
- 已移除 `src/capabilities.js` 中重复的环境变量兜底，文件能力只消费规范化后的配置。
- 已将 JS Worker 内层执行超时改为使用 `runScript` 传入的 `timeoutMs`，不再固定写死 `1000ms`。
- 已更新 `INSTALL.md` 和 `readme.md` 的运行配置说明。
- 已补充 `test/config.test.js` 覆盖运行配置读取和环境变量覆盖。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/config.test.js test/capabilities.test.js` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### 身份说明

- 用户询问“你是谁”。
- 回复说明：我是 Codex，一个在当前工作区协助阅读、修改、运行和验证代码的 AI 编程助手。

### 结果集处理能力说明

- 用户询问“现在结果集处理有什么能力”。
- 已检查 `src/runtime.js`、`src/scriptRunner.js`、`src/scriptWorker.js`、`src/sqlExecutor.js` 和 `readme.md`。
- 结论：当前结果集处理是 SQL 执行后的 JS 沙箱脚本，支持读取 `params`、过滤后的 `headers`、首个结果集 `rows`、全部结果集 `resultSets`、请求 `context`，并可通过 `callApi.get/post` 调用内部 API；脚本返回值即最终 API 响应，且必须可 JSON 序列化。

### 网络下载与文件大小能力咨询

- 用户询问：需要从网络下载文件并读取文件内容大小，需要放开什么功能。
- 已检查当前 JS 沙箱限制：脚本黑名单包含 `require`、`fs`、`net`、`http`、`https`、`Buffer` 等，沙箱也未注入 `fetch` 或文件访问能力。
- 建议：不要直接开放 Node 原生模块，改为在主线程实现受控下载/探测 helper，再把白名单方法注入脚本。

### 脚本开放能力管控咨询

- 用户询问：如果后面开放的能力越来越多，要怎么管控。
- 建议采用 capability 权限模型：能力按工具注册、按 API 授权、按参数校验、按运行时审计和限额控制，而不是向脚本开放底层 Node 能力。

### API 请求安全与 Authenticator 咨询

- 用户询问：想借助 authenticator 的能力让 API 请求更安全，或如何使 API 请求更安全。
- 已检查当前实现：`/admin/login` 仍返回固定 `dev-token`，动态 `/api/*` 调用固定 `userId: 0`、`roles: []`，README 规划了 JWT/Session、权限校验和角色控制但代码尚未完整实现。
- 建议：管理端登录使用密码 + TOTP 二次验证；机器调用动态 API 使用 API Key + HMAC 签名、时间戳、nonce、防重放、权限范围和审计日志。
  - 已创建回当前缺失的 `data/` 目录。
  - 使用 `PORT=3014 npm run dev` 启动新代码成功，`GET/HEAD /` 返回 `200 OK`，并自动写入新的 `data/server.log`。

### JS 使用外部 API 和文件上传方案

- 用户希望 JS 处理中可以使用外部 API 接口和文件上传服务，先给方案。
- 建议不直接在沙箱中开放 `http`、`https`、`fs`、`Buffer` 等能力，而是注入受控函数，例如 `callHttp()`、`uploadFile()`。
- 外部 API 通过白名单域名、方法、超时、大小限制、敏感 header 过滤和请求日志控制。
- 文件上传建议走独立上传服务，脚本只拿 `fileId`、临时上传 URL 或 base64 小文件内容，由主线程完成上传并返回文件元数据。

### 降级处理 client request timeout 日志

- 用户贴出 `client error` 日志，错误为 `ERR_HTTP_REQUEST_TIMEOUT: Request timeout`。
- 该错误来自 Node HTTP Server 的 `clientError` 事件，通常是客户端或 Nginx 连接建立后请求未按时完整发送，不代表动态 API 业务执行失败。
- 已调整 `src/server.js`：`ERR_HTTP_REQUEST_TIMEOUT` 记录为 `info` 级别 `client request timeout`，并返回原始 HTTP `408 Request Timeout`。
- 已调整 `ECONNRESET` 为 `info` 级别连接重置日志；其它解析错误仍按 `client error` 记录，并返回 `400` 或 `431`。
- 已调整 `src/logger.js`，错误日志中补充 `error.code`，便于后续定位。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 已停止之前用于验证的 `3014` 进程；当前仍有 `3010` 和 `3012` 监听，未主动修改。

### 日志时间改为中国时区

- 用户反馈日志时间有问题，要求采用中国时区。
- 原因是 `server.log`、API 调试快照和调用记录使用 `new Date().toISOString()`，该格式输出 UTC 时间。
- 已新增 `src/time.js`，统一输出 UTC+08:00 时间，格式如 `2026-08-20T11:22:54.804+08:00`。
- 已调整 `src/logger.js` 的 `time` 字段、`src/runtime.js` 的调试快照 `createdAt` 和文件名时间、`src/store.js` 的新写入时间。
- 已新增 `test/time.test.js` 覆盖中国时区格式和文件名格式。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 使用 `PORT=3015 npm run dev` 临时启动新代码，`data/server.log` 新增记录为 `2026-08-20T11:30:23.574+08:00`。
  - 临时 `3015` 已停止，当前只剩旧 `3012` 监听，需要重启 `3012` 后新时间格式生效。

### API 增加整体超时时间

- 用户要求 API 接口增加一个超时时间，默认 30 秒。
- 已新增运行配置 `API_TIMEOUT_MS`，默认 `30000`。
- 已新增 API 持久化字段 `api_timeout_ms`，启动迁移会给旧表补列，默认 `30000`。
- 前端接口信息区新增“超时(秒)”输入框，默认 30 秒，保存时转换为毫秒。
- 动态 API 运行时增加整体截止时间，覆盖参数 JS、SQL、结果 JS 和内部 `callApi` 的等待时间；超时返回 `408 api execute timeout`。
- 已更新 `readme.md`、`test/runtime.test.js` 和 `test/config.test.js`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 使用 `PORT=3015 npm run dev` 临时启动新代码，MySQL 迁移日志显示已新增 `api_timeout_ms`。
  - 直接查询 `information_schema.columns` 确认 `api_timeout_ms` 默认值为 `30000`。
  - 临时 `3015` 已停止；当前仍有旧 `3010` 和 `3012` 监听，未主动修改。

### 撤销 API 整体超时时间并梳理现有超时

- 用户指出理解错误，要求先去掉新增的 API 整体超时，数据库表字段也移除，并询问当前程序中有哪些默认超时。
- 已移除 `API_TIMEOUT_MS`、`apiTimeoutMs`、`api_timeout_ms`、前端“超时(秒)”输入框和运行时整体 `withApiTimeout` 逻辑。
- 已执行 MySQL 元数据库变更，删除 `ssql_api_definitions.api_timeout_ms` 字段。
- 已确认 `information_schema.columns` 中 `api_timeout_ms` 数量为 `0`。
- 当前程序显式默认超时：
  - SQL 超时：`SQL_TIMEOUT_MS` 默认 `5000ms`，API 字段 `sql_timeout_ms` 默认 `5000ms`。
  - JS 超时：`SCRIPT_TIMEOUT_MS` 默认 `1000ms`，API 字段 `script_timeout_ms` 默认 `1000ms`。
  - JS Worker 内 `vm.Script.runInContext` 也硬编码 `1000ms`。
  - 内部调用深度不是时间超时，`MAX_CALL_DEPTH` 默认 `5`。
  - Node HTTP Server 未显式配置业务总超时，当前 Node 默认 `requestTimeout=300000ms`、`headersTimeout=60000ms`、`timeout=0`、`keepAliveTimeout=5000ms`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### SQL/JS 超时显示到 UI 并移除废弃字段

- 用户要求 SQL 超时和 JS 超时显示在 UI 中并可修改，同时检查 `ssql_api_definitions.max_rows` 是否不用并移除废弃字段。
- 已在接口信息区新增 `SQL超时(秒)` 和 `JS超时(秒)` 输入框。
- 前端保存时将秒转换为现有字段 `sqlTimeoutMs` / `scriptTimeoutMs` 的毫秒值；回填时将毫秒显示为秒。
- 新建 API 默认 SQL 超时 `5` 秒，JS 超时 `1` 秒。
- 检查代码后确认 `max_rows` 已无读写引用，当前表结构中只有该字段属于已废弃字段。
- 已执行 MySQL 元数据库变更，删除 `ssql_api_definitions.max_rows` 字段。
- 已重新查询 `ssql_api_definitions` 表结构，确认字段为：`id`、`name`、`path`、`method`、`status`、`description`、`request_params`、`test_params`、`database_alias`、`sql_text`、`sql_mode`、`param_script_text`、`script_text`、`sql_timeout_ms`、`script_timeout_ms`、`deleted_at`、`created_at`、`updated_at`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### JS 沙箱支持 setTimeout

- 用户反馈接口返回 `script execute failed`，原因是 `setTimeout is not defined`。
- 原因是 JS Worker 沙箱只注入了白名单变量和 `callApi`，没有浏览器/Node 全局定时器。
- 已在 `src/scriptWorker.js` 注入受控 `setTimeout` 和 `clearTimeout`，返回数字 id，不暴露 Node Timer 对象。
- 外层 `scriptRunner` 的 `timeoutMs` 仍会终止整个 Worker，长定时器不能绕过 JS 超时。
- 已新增 `test/scriptRunner.test.js`，覆盖定时器可用、`clearTimeout` 有效，以及长定时器仍触发脚本超时。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### callApi 支持 GET 避免 api not found

- 用户反馈 JS 返回 `script execute failed`，原因是 `api not found`。
- 检查发现脚本内 `callApi(path, params)` 在运行时和管理端测试中都被硬编码为按 `POST` 查找目标 API；如果目标接口是 `GET`，会找不到。
- 已调整 `callApi` 支持第三个参数：`callApi(path, params, { method: "GET" })` 或 `callApi(path, params, "GET")`。
- 旧写法 `callApi(path, params)` 保持兼容：先按历史逻辑尝试 `POST`，如果 `POST` 找不到，再尝试 `GET`。
- 已更新 `src/scriptWorker.js`、`src/scriptRunner.js`、`src/runtime.js`、`src/server.js` 和 `readme.md`。
- 已新增测试覆盖 `callApi` method options 传递和 method 解析。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### callApi 改为对象方法

- 用户要求将 `callApi` 变更为对象，包含 `callApi.get` 和 `callApi.post` 方法。
- 已将 JS 沙箱内的 `callApi` 改为冻结对象：`callApi.get(path, params)` 和 `callApi.post(path, params)`。
- `callApi.get` 会以 `GET` 方法调用内部动态 API，`callApi.post` 会以 `POST` 方法调用。
- 已给 JS 编辑器增加 `callApi.get` / `callApi.post` 属性补全。
- 已更新 `readme.md` 和 `test/scriptRunner.test.js`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 本次配置文件调整记录

- 本次 `loadConfig` 运行配置迁移到 `app.config.json` 的完整记录见本文件前文同名章节。

### 文件下载 Capability 实现

- 用户要求：采用 capability 权限模型，为脚本增加文件下载和读取文件内容大小能力。
- 已新增 `src/capabilities.js`，注册 `files.inspectUrl` 和 `files.downloadTemp`。
- `files.inspectUrl(url, options)` 优先通过 `HEAD` 读取 `Content-Length`，缺失时用 `GET` 流式统计字节数。
- `files.downloadTemp(url, options)` 下载到受控临时目录，并返回 `fileId`、`filename`、`contentType`、`size`。
- 已在 `src/scriptWorker.js` 注入冻结的 `files` 对象，脚本只能通过 Worker 消息请求主线程代理执行能力。
- 已在 `src/scriptRunner.js` 增加 capability 消息校验，并移除对 URL 字符串中 `http/https` 的误拦截。
- 已在 `src/runtime.js` 接入按 API 授权的 `executeScriptCapability`，能力调用会写入结构化审计日志。
- 已在 `src/store.js` 增加 `script_capabilities` 字段、迁移逻辑和 `scriptCapabilities` 读写映射。
- 已在管理页增加“脚本能力”勾选项：`探测网络文件大小`、`下载到临时文件`，并补充 JS 编辑器补全。
- 默认安全限制：只允许 `https:`、禁止内网地址、最大文件大小 10MB。
- 可通过 `FILE_CAPABILITY_ALLOWED_PROTOCOLS`、`FILE_CAPABILITY_ALLOWED_HOSTS`、`FILE_CAPABILITY_ALLOW_PRIVATE_NETWORK`、`FILE_CAPABILITY_MAX_BYTES`、`FILE_CAPABILITY_TIMEOUT_MS`、`FILE_CAPABILITY_TEMP_DIR` 调整。
- 已更新 `readme.md` 和测试。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/capabilities.test.js test/scriptRunner.test.js` 通过。
  - `npm test` 通过。
  - 已用 `PORT=3015 npm run dev` 启动服务，启动时自动迁移 `ssql_api_definitions.script_capabilities` 字段，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。
### 本次配置文件调整记录

- 本次 `loadConfig` 运行配置迁移到 `app.config.json` 的完整记录见本文件前文同名章节。
### callApi 和 files 异常封装建议

- 用户提出：`callApi`、`files` 需要对异常做封装处理，先给出建议。
- 建议方向：脚本能力调用统一返回稳定错误结构，区分内部日志详情和脚本可见错误，避免把底层网络、数据库、调用链等实现细节直接暴露给用户脚本和最终 API 响应。

### callApi 和 files 异常封装实现

- 用户确认按建议实现。
- 已新增 `src/scriptErrors.js`，统一把 `callApi` 和 `files` 的底层异常转换为脚本可见的稳定错误结构。
- 默认方法 `callApi.get/post`、`files.inspectUrl/downloadTemp` 失败时会抛出 `ScriptCapabilityError`，脚本可读取 `code`、`message`、`statusCode`、`capability`、`details`。
- 已新增 `callApi.tryGet`、`callApi.tryPost`、`files.tryInspectUrl`、`files.tryDownloadTemp`，失败时返回 `{ ok: false, error }`，成功时返回 `{ ok: true, data }`。
- 已更新前端 JS 补全和帮助文本，补充 `try*` 方法。
- 已更新 `readme.md`，记录错误结构和 try 方法用法。
- 已新增测试覆盖结构化异常捕获和 try 方法返回。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/scriptRunner.test.js` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### callApi/files 返回对象是否可修改咨询

- 用户询问：已实现 `callApi` 和 `files` 的异常封装后，返回的对象不能修改吗。
- 说明：当前被冻结的是脚本注入的 `callApi` 和 `files` 工具对象，防止脚本替换能力方法；普通成功返回数据和 `try*` 返回对象不是冻结对象，脚本内可以修改，但建议把错误对象视为只读结构使用。

### 修复返回 Error 变空对象

- 用户反馈：`catch` 已进入，但 `return error` 时没有内容，且 `error.b = 2` 没有保留。
- 原因：`Error` 实例跨 Worker 结构化克隆和后续 JSON 序列化时会丢失自定义字段，直接返回 `Error` 容易变成 `{}`。
- 已在 `src/scriptWorker.js` 增加 `normalizeReturnValue()`，脚本返回值中如包含 `Error`，会先转成普通 JSON 对象，并保留脚本追加的可枚举字段。
- 已补充测试：
  - catch 后 `error.b = 2; return error;` 能返回完整错误对象和 `b: 2`。
  - 嵌套 `{ error }` 返回也能归一化。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/scriptRunner.test.js` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### try 结果双 ok 结构反馈

- 用户反馈：`files.tryInspectUrl` 失败返回 `{ ok: false, error: { ok: false, ... } }`，询问为什么有两个 `ok`。
- 原因：外层 `ok` 是 try 方法调用是否成功；内层 `ok` 来自复用的错误序列化结构。该设计语义重复，建议移除内层 `error.ok`，保留外层 `ok`。

### 移除 try 结果内层 ok

- 用户确认调整。
- 已修改 `src/scriptWorker.js` 的 `tryCapability()`：`try*` 失败返回 `{ ok: false, error }`，其中 `error` 不再包含重复的 `ok` 字段。
- 直接 `catch` 后 `return error` 的结构不变，仍保留错误对象自身的 `ok: false`。
- 已更新 `test/scriptRunner.test.js` 断言。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `node --test test/scriptRunner.test.js` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`，`curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### 固定 Toolbar

- 用户询问 toolbar 是否可以固定在上面。
- 已修改 `public/style.css`，将 `.toolbar` 改为 `position: sticky; top: 0`。
- 为 toolbar 增加背景、底部分隔线、轻微阴影和 `backdrop-filter`，滚动时避免内容透出或按钮不可读。
- 验证：
  - `node --check public/app.js` 通过。
  - `curl -I http://127.0.0.1:3015/style.css` 返回 `200 OK`。

### 编辑器插件和智能提示咨询

- 用户询问：JS 和 SQL 当前使用什么插件编辑器，以及有没有更智能的提示插件/软件。
- 已确认当前项目使用 CodeMirror 5.65.21，加载了 `show-hint`、`sql-hint`、`javascript-hint`、`matchbrackets`、`closebrackets` 以及 SQL/JavaScript mode，并在 `public/app.js` 中实现了 rows、params、callApi、files 等自定义补全。
- 建议路线：轻量增强可继续基于 CodeMirror 5；更智能可选 CodeMirror 6、Monaco Editor、Monaco + LSP、CodeMirror SQL 扩展或自研 AI 补全服务。

### 对象点号补全需求分析

- 用户询问：在编辑器里写代码时，输入对象名加点，能否弹出补全。
- 现状：JS 编辑器已经在 `public/app.js` 中通过 `extraKeys["."]` 监听点号并触发 `showHint()`，`customFieldHint()` 已支持 `params.`、`row.`、`rows[0].`、`callApi.`、`files.` 等固定对象补全。
- 初步结论：该能力可实现；固定运行时对象和已知结构对象成本低，任意 JS 对象或接口返回对象需要类型/样例/schema 支撑，否则只能做有限静态推断。

### CodeMirror 原生补全边界确认

- 用户补充：需要加载 `codemirror/addon/hint/show-hint.js` 和对应语言提示插件，如 `javascript-hint`，再通过 `Ctrl+Space` 或 `Cmd+Space` 手动触发补全。
- 结论：CodeMirror 5 原生 `javascript-hint` 的补全主要基于当前文档词法分析，不具备完整类型推断能力；要实现对象点号联想，需要在项目中维护自定义对象/能力/schema 提示逻辑。

### Monaco / LSP 能力咨询

- 用户询问：Monaco / LSP 能做到什么。
- 结论：Monaco 提供接近 VS Code 的浏览器编辑器体验；LSP 提供语言级智能能力。组合后可实现点号补全、类型推断、悬浮说明、参数提示、错误诊断、格式化、跳转定义、引用查找、重命名、代码片段和业务对象/schema 补全。

### Monaco + LSP + Schema 方案难点

- 用户询问：Monaco + LSP + 数据库 schema + API schema 这套方案有什么难点。
- 分析结论：主要难点不在 Monaco 编辑器本身，而在语言服务接入、数据库/API 元数据采集与同步、动态脚本类型建模、SQL 方言兼容、权限隔离、性能和诊断准确性控制。

### 脚本能力弹窗和状态切换按钮

- 用户要求：脚本能力会越来越多，需要改成弹窗选择；主界面只显示已选择能力；发布和停用互为状态，考虑只保留一个按钮，并在状态切换时弹窗提示。
- 已将主表单的脚本能力区域改为摘要展示和“选择能力”按钮，能力复选框移动到弹窗中。
- 弹窗采用“确定才生效”模式；取消、关闭、点击遮罩或按 Esc 会恢复打开前的能力选择，避免未确认修改被保存。
- 已将工具栏的“发布”“停用”两个按钮合并为 `statusToggleBtn`：已发布状态显示“停用”，草稿/已停用状态显示“发布”。
- 状态切换前使用确认弹窗提示影响；发布前仍会自动保存当前编辑内容，停用后外部请求将无法调用该 API。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/` 返回 `200 OK`。

### Toast 遮挡工具栏按钮修正

- 用户反馈：`id="toast"` 会遮挡 `class="actions"` 工具栏按钮。
- 原因：toast 固定在右上角，位置与 sticky toolbar 的右侧操作按钮重叠。
- 已修改 `public/style.css`：toast 改为右下角显示，并增加 `pointer-events: none`，避免提示层拦截按钮点击。
- 验证：
  - `node --check public/app.js` 通过。
  - `curl -I http://127.0.0.1:3015/style.css` 返回 `200 OK`。

### files.downloadTemp 能力说明

- 用户询问：`files.downloadTemp` 的能力是什么。
- 已确认实现：脚本在 API 勾选 `files.downloadTemp` 能力后，可调用 `await files.downloadTemp(url, options)`，由主线程按 capability 策略校验 URL、协议、主机、内网限制、重定向、超时和最大大小后，使用 GET 下载到受控临时目录，并返回 `{ url, contentType, size, fileId, filename }`。

### 点号补全三档需求拆分

- 用户提到“需求上可以分三档”，延续前面对编辑器对象点号补全能力的讨论。
- 结论：可按固定对象补全、已知返回结构补全、动态业务 schema/类型推断补全三档推进；当前项目适合先实现前两档。

### 完成第二档业务对象点号补全

- 用户要求：完成第二档，基于现有 CodeMirror 5 增加“对象能力元数据表”，让能力方法返回对象赋值给变量后可继续点号补全。
- 已在 `public/app.js` 增加 `capabilityReturnSchemas`，维护 `files.inspectUrl`、`files.downloadTemp`、`files.tryInspectUrl`、`files.tryDownloadTemp`、`callApi.tryGet`、`callApi.tryPost` 的返回字段结构。
- 已新增轻量变量来源分析：识别 `const/let/var name = await files.xxx(...)` 和普通 `name = await files.xxx(...)` 赋值，并跳过字符串和注释中的伪代码。
- 已接入现有 `localObjectPropertyHint()`，支持 `file.`、`result.`，以及嵌套的 `result.data.`、`result.error.` 字段补全。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - Node 样例验证可识别 `files.inspectUrl`、`files.downloadTemp`、`callApi.tryGet` 的变量赋值来源。
  - `curl -I http://127.0.0.1:3015/app.js` 返回 `200 OK`。

### SQL/JS 超时控制说明

- 用户询问：`SQL超时(秒)` 和 `JS超时(秒)` 是怎么控制的。
- 已确认链路：前端以秒展示，保存时转换为 `sqlTimeoutMs` 和 `scriptTimeoutMs` 毫秒字段；API 保存后执行时优先使用 API 自身配置，没有值才使用 `app.config.json` 中的默认超时。
- SQL 超时：MySQL 使用 `connectTimeout` 和 query `timeout`；MSSQL 使用 `connectionTimeout` 和 `requestTimeout`。
- JS 超时：每次脚本执行在独立 Worker 中运行，外层 `setTimeout` 到期后终止 Worker，内层 `vm.Script.runInContext({ timeout })` 限制同步代码执行时间；参数处理脚本和结果集处理脚本都会使用同一个 `scriptTimeoutMs`。

### 两个 JS 过程入参和智能提示差异分析

- 用户要求分析参数处理 JS 和结果集处理 JS 两个过程中 `main()` 函数入参；指出不是所有入参都有智能提示。
- 已确认实际 Worker 调用统一为 `main({ params, headers, rows, resultSets, context, callApi, files })`。
- 参数处理阶段：`params` 来自请求参数，`headers` 是过滤后的请求头，`rows` 和 `resultSets` 为空数组，`context` 包含请求和调用链信息，`callApi`/`files` 可用但受权限控制。
- 结果集处理阶段：`params` 为参数处理后的参数，`rows` 是首个结果集行数组，`resultSets` 是全部结果集，其他入参与参数处理阶段一致。
- 当前智能提示覆盖不完整：已支持 `params.`、`row.`/`rows[0].`、`callApi.`、`files.` 和部分能力返回对象；尚未系统支持 `headers.`、`context.`、`resultSets[0].`、`resultSets[0].rows[0].`、`resultSets[0].fields` 等入参路径。
- 发现细节：`runtime.runParamScript()` 设置了 `context.scriptType`，但 `scriptRunner.buildSafeContext()` 当前没有透传 `scriptType` 到沙箱。

### 补齐 JS 入参智能提示

- 用户要求补齐两个 JS 过程中的入参智能提示。
- 已在 `src/scriptRunner.js` 的 `buildSafeContext()` 中透传 `scriptType`，并在结果集处理和管理端脚本测试上下文中设置 `scriptType: "result"`。
- 已在 `public/app.js` 增加 `context.` 补全：`requestId`、`userId`、`roles`、`callDepth`、`callChain`、`scriptType`。
- 已在 `public/app.js` 增加 `resultSets` 相关补全：`resultSets.` 数组方法、`resultSets[0].` 的 `fields`/`rows`、`resultSets[0].rows[0].` 的 SQL 字段、`resultSets[0].fields.`/`rows.` 的数组方法。
- 已补充 `headers` 提示：由于常见请求头包含短横线，`headers.` 会补成合法的 `headers["content-type"]` 形式；也支持 `headers["` 后选择常见请求头。
- 已新增 `test/scriptRunner.test.js` 用例，验证脚本只能拿到安全 context 字段且包含 `scriptType`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 返回 `200 OK`。

### SQL/JS 编辑器快捷键

- 用户询问：SQL 和 JS 是否没有快捷键。
- 已确认此前只有 `Tab`、`Shift-Tab`、`Ctrl/Cmd+Space` 补全和 JS 点号触发补全，没有执行 SQL/JS 的快捷键。
- 已为所有 CodeMirror 编辑器增加 `Ctrl/Cmd+S` 保存。
- 已为 SQL 编辑器增加 `Ctrl/Cmd+Enter` 执行 SQL。
- 已为 JS 编辑器增加 `Ctrl/Cmd+Enter` 测试 JS，并在 JS 面板增加“测试 JS”按钮，复用现有 `/admin/apis/:id/test-script` 链路。
- JS 测试会自动保存当前 API，执行参数处理脚本、准备 SQL 结果，再执行结果集处理脚本，并把结果输出到日志区。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/` 和 `/app.js` 返回 `200 OK`。

### 注释/格式化快捷键和 JS 测试日志精简

- 用户反馈：注释快捷键和格式化代码没有快捷键；JS 编辑器 `Ctrl/Cmd+Enter` 测试 JS 时结果显示很多其他信息。
- 已为 CodeMirror 编辑器增加 `Ctrl/Cmd+/` 切换行注释；SQL 使用 `-- `，JS 使用 `// `，JSON 参数编辑器提示不支持注释。
- 已为 CodeMirror 编辑器增加 `Shift+Alt+F` 格式化；JSON 使用严格 JSON 格式化，SQL 使用轻量关键字换行，JS 使用轻量缩进整理。
- 已将 JS 测试日志默认输出改为只显示脚本返回的 `result`；完整的 params、rows、resultSets 仍在内部用于更新字段缓存，不再默认铺到日志区。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 返回 `200 OK`。

### 格式化改为右键菜单

- 用户要求：去掉格式化快捷键，改用右击菜单选择格式化，支持原生 SQL、MyBatis XML 和 JS。
- 已移除 CodeMirror 的 `Shift+Alt+F` 格式化快捷键绑定，保留保存、执行、补全和注释快捷键。
- 已新增编辑器右键菜单：参数 JSON 编辑器显示“格式化 JSON”；SQL 编辑器显示“格式化原生 SQL”和“格式化 MyBatis XML”；JS 编辑器显示“格式化 JS”。
- 选择 SQL 的格式化类型时，会同步切换上方 SQL 输入模式，避免高亮模式和格式化类型不一致。
- 已新增轻量 MyBatis XML 格式化器，只处理标签层级缩进，不解析或改写表达式逻辑。
- 右键菜单会在点击空白、滚动、窗口尺寸变化或按 Esc 时关闭。
- 验证：
  - `rg -n "Shift-Alt-F|formatEditor:|contextMenuItems|editor-context-menu|setupEditorContextMenu" public/app.js public/style.css public/index.html` 确认快捷键已移除、右键菜单已接入。
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 和 `/style.css` 返回 `200 OK`。

### JS/SQL/XML 格式化方案分析

- 用户反馈：当前 JS 格式化效果不好，询问 JS、原生 SQL、MyBatis XML 分别有几种格式化方案。
- 分析结论：当前正则/轻量格式化只能作为兜底；JS 建议优先接 Prettier 或 js-beautify，原生 SQL 建议接 SQL Formatter 或数据库方言格式化器，MyBatis XML 需要 XML 格式化和内部 SQL 格式化组合处理。

### 服务端标准格式化和 SQL 自动识别

- 用户确认接入标准格式化方案，并要求 SQL 右键菜单时自动识别原生 SQL 还是 MyBatis XML。
- 已安装 `prettier`、`sql-formatter`、`xml-formatter`，用于服务端格式化 JS、原生 SQL 和 MyBatis XML。
- 已新增 `src/formatter.js`：`formatCode()` 统一处理格式化；`detectSqlKind()` 自动识别 SQL 文本是原生 SQL 还是 MyBatis XML。
- 已新增 `POST /admin/format-code` 管理端接口，前端右键格式化通过该接口获取格式化结果，避免浏览器加载大型 formatter 包。
- 已将 SQL 右键菜单改为单项“格式化 SQL”，内部自动识别 `sql`/`xml` 并同步切换上方 SQL 输入模式。
- JS 格式化已改为 Prettier，JSON 格式化也改为 Prettier；原生 SQL 使用 `sql-formatter` 的 MySQL 方言；MyBatis XML 使用 `xml-formatter`。
- 已新增 `test/formatter.test.js` 覆盖 JS 格式化、原生 SQL 格式化和 MyBatis XML 自动识别。
- 已重启 `PORT=3015 npm run dev`，加载新增格式化接口。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 直接请求 `http://127.0.0.1:3015/admin/format-code` 验证 JS、原生 SQL、MyBatis XML 均返回 `code: 0`，SQL 自动识别分别返回 `kind: "sql"` 和 `kind: "xml"`。
  - `curl -I http://127.0.0.1:3015/app.js` 和 `/style.css` 返回 `200 OK`。

### SQL 格式化报错排查和状态栏单行显示

- 用户反馈：`server.log` 中 SQL 格式化报错，要求先将 `statusText` 显示内容控制在一行里，并排查报错原因。
- 已修改 `public/style.css`：工具栏左侧允许收缩，`.toolbar p` 使用 `white-space: nowrap`、`overflow: hidden`、`text-overflow: ellipsis`，`.actions` 固定不被状态文字挤压。
- 已排查 `data/server.log`：报错来自 `POST /admin/format-code`，`sql-formatter` 在 `src/formatter.js:42` 解析原生 SQL 时抛出 `Parse error at token: ; at line 8 column 17`。
- 根因：自动识别结果是原生 SQL，但 `sql-formatter` 对部分合法片段、方言片段或子查询/过程中的分号容错不足，解析失败后旧逻辑直接返回 HTTP 500。
- 已调整 `src/formatter.js`：原生 SQL 格式化失败时返回保守关键字换行结果，并携带 `warning`，不再让格式化接口因为解析失败返回 500。
- 已调整 `public/app.js`：SQL 自动格式化收到 `warning` 时在 `statusText` 中显示一行警告，编辑器仍填入降级后的格式化结果。
- 已补充 `test/formatter.test.js` 回归测试，覆盖 `select (select 1;) as a` 这类会触发解析失败的 SQL 片段。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`。
  - 直接请求 `/admin/format-code` 验证同类 SQL 返回 HTTP 200，并带 `warning`。

### SQL 格式化失败时不改写内容

- 用户补充要求：如果 SQL 格式化报错就不用格式化。
- 已调整 `src/formatter.js`：`sql-formatter` 解析失败时返回原 SQL 文本、`skipped: true` 和一行 `warning`，不再执行保守关键字换行。
- 已调整 `public/app.js`：格式化接口返回 `skipped: true` 时不调用 `editor.setValue()`，toast 显示“格式化失败，已保留原内容”。
- 已更新 `test/formatter.test.js`：覆盖解析失败时文本保持原样、返回 `skipped: true`。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`。
  - 直接请求 `/admin/format-code` 验证同类 SQL 返回 HTTP 200、`skipped: true` 和原 SQL 文本。

### JS Worker 内存超限错误处理

- 用户反馈错误：`Worker terminated due to reaching memory limit: JS heap out of memory`。
- 原因：JS 脚本在独立 Worker 中执行，旧代码硬编码 `maxOldGenerationSizeMb: 32`、`maxYoungGenerationSizeMb: 8`；脚本分配对象过多或注入的结果集过大时，Node 会终止 Worker 并抛出底层内存错误。
- 已调整 `src/scriptRunner.js`：将 Worker 内存超限错误归一化为 `script memory limit exceeded`，HTTP 状态为 `507`，并返回配置的内存限制信息，避免直接暴露 Node 原始错误文案。
- 已将 Worker 内存上限改为配置项：`runtime.scriptWorker.maxOldGenerationSizeMb`、`runtime.scriptWorker.maxYoungGenerationSizeMb`，并支持环境变量 `SCRIPT_WORKER_MAX_OLD_MB`、`SCRIPT_WORKER_MAX_YOUNG_MB` 临时覆盖。
- 已调整 `src/runtime.js` 和 `src/server.js`：正式 API 执行、参数脚本、结果集脚本、管理端测试 JS 都传入同一份 Worker 内存配置。
- 已更新 `app.config.json`、`readme.md`、`INSTALL.md` 和测试。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - 已重启 `PORT=3015 npm run dev`。
  - `loadConfig()` 验证当前 Worker 内存配置为 `{ maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 }`。

### app.config.json 注释能力说明

- 用户询问：`app.config.json` 能否写注释。
- 结论：标准 JSON 不支持注释，当前 `src/config.js` 使用 `JSON.parse` 读取配置，因此直接写 `//` 或 `/* */` 会导致服务启动时报配置解析错误。
- 可选方案：保持标准 JSON 并用文档说明；改成 `app.config.jsonc` 并引入 JSONC 解析；或在 JSON 中增加 `_comment` / `_description` 这类说明字段。

### 运行配置改为 JSONC

- 用户要求：把 `app.config.json` 改成 JSONC。
- 已将运行配置文件改名为 `app.config.jsonc`，并在配置文件中加入 `//` 注释，说明服务监听、路径、超时、Worker 内存和文件 capability 边界。
- 已调整 `src/config.js`：`loadConfig()` 优先读取 `app.config.jsonc`，并支持行注释、块注释和尾逗号；如果 `.jsonc` 不存在，会兼容读取旧的 `app.config.json`。
- `database.config.json` 仍保持标准 JSON 读取，避免把数据库配置格式一起扩大。
- 已更新 `readme.md` 和 `INSTALL.md` 中的配置文件名和示例代码块语言。
- 已补充 `test/config.test.js`：覆盖 JSONC 注释、尾逗号，以及字符串中的 `//` / `/* */` 不被误删。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `loadConfig()` 可读取 `app.config.jsonc` 中的注释配置。
  - 已重启 `PORT=3015 npm run dev`。
  - `curl -I http://127.0.0.1:3015/app.js` 返回 `200 OK`。

### SQL 和 JS 编辑器自动高度

- 用户要求：SQL 和 JS 处理设置成拥有最小高度；如果内容超过最小高度，内容全部显示。
- 已修改 `public/style.css`：SQL CodeMirror 最小高度为 `240px`，JS CodeMirror 最小高度为 `300px`，并隐藏纵向内部滚动以便页面整体展示完整内容。
- 已修改 `public/app.js`：新增 `syncAutoHeightEditor()` 和 `setupAutoHeightEditor()`，按 CodeMirror 内容高度动态设置编辑器高度。
- 自动高度同步场景包括：输入内容变化、格式化后、切换 SQL/XML 模式、切换 JS 参数处理/结果集处理、切换或回填 API 表单。
- 示例参数 JSON 编辑器保持原固定高度，避免接口信息区被过长参数撑开。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 和 `/style.css` 返回 `200 OK`。

### 接口信息区高度对齐和折叠状态缓存

- 用户要求：`form-grid` 和 `params-field` 高度调整到一致；`panel-title` 右上角增加隐藏/显示 `api-info-grid`；隐藏/显示状态按接口保存在浏览器中，下次打开再读取。
- 已修改 `public/index.html`：在“接口信息”面板右上角增加 `apiInfoToggleBtn`，并为接口信息内容区增加 `apiInfoGrid` id。
- 已修改 `public/style.css`：`api-info-grid` 子项改为 stretch，对齐左侧表单和右侧示例参数区域高度；`params-field` 改为两行网格布局，参数 CodeMirror 高度撑满右侧区域。
- 已修改 `public/app.js`：新增 `apiInfoCollapsePrefix`、按 API id 生成 localStorage key，并实现读取、保存和应用折叠状态。
- 切换 API 或回填表单时会读取当前 API 的折叠状态；点击右上角按钮会写入浏览器，下次打开同一 API 自动恢复。
- 未保存的新 API 没有稳定 id，因此折叠状态不持久化。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 和 `/style.css` 返回 `200 OK`。

### Workspace 滚动条宽度稳定性设计

- 用户询问：有什么设计可以使 `workspace` 宽度在有滚动条和没滚动条的情况下保持不变。
- 初步建议：优先使用 CSS `scrollbar-gutter: stable` 为滚动条预留空间；兼容性要求更强时让固定滚动容器始终显示纵向滚动条；也可将滚动限制在 `.workspace` 内，避免 body 滚动条影响整页布局。

### 固定整页滚动到 Workspace

- 用户确认采用“整页不滚动，只让 `.workspace` 滚动”的更可控布局方案。
- 已修改 `public/style.css`：`html`、`body` 设置 `height: 100%` 和 `overflow: hidden`，禁止 body 产生整页滚动条。
- `.app` 改为固定 `height: 100vh`，右侧 `.workspace` 设置 `height: 100vh`、`overflow-y: auto`、`scrollbar-gutter: stable`，让右侧滚动条出现/消失时宽度稳定。
- 左侧 `.sidebar` 改为固定视口高度的网格布局，头部、筛选和分页固定，API 列表区域内部滚动，避免列表过长时内容被裁掉。
- 小屏幕下 `.app` 改为上下两行，侧栏最多占 `42vh`，右侧 workspace 使用剩余区域滚动。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/style.css` 返回 `200 OK`。

### 测试 SQL/JS Loading 和 SQL 日志精简

- 用户要求：执行 SQL 中去除调试信息；“执行 SQL”改为“测试 SQL”；测试 SQL 和测试 JS 执行时要有 loading。
- 已修改 `public/index.html`：SQL 按钮文案从“执行 SQL”改为“测试 SQL”，日志初始文案改为“等待测试 SQL”。
- 已修改 `public/app.js`：新增 `setButtonLoading()`，测试 SQL 和测试 JS 执行期间按钮显示“测试中...”并禁用，完成或失败后恢复。
- 已修改 SQL 测试日志展示：普通 SQL 只显示 `rows`；多结果集只显示每个结果集的 `rows`；参数脚本直接返回时显示 `result`。调试字段仍保留在内部 `logData` 中用于 rows 字段补全和缓存。
- 已同步状态文案为“SQL 测试中/完成”和“JS 测试中/完成”。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3015/app.js` 和 `/style.css` 返回 `200 OK`。

### 示例参数固定高度

- 用户要求：示例参数不用根据内容切换高度。
- 已修改 `public/style.css`：示例参数 CodeMirror 固定为 `240px` 高度，不再随内容或父级拉伸变化。
- 示例参数内容超过固定高度时使用编辑器内部纵向滚动，避免撑开接口信息区。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。
  - `curl -I http://127.0.0.1:3010/` 和 `/style.css` 返回 `200 OK`。

### API 标签管理和标签筛选

- 用户要求：数据库增加标签表；新建按钮旁增加标签管理；标签管理可查看和新增标签；接口信息中在 JS 超时后增加多选标签；保存 API 时一起保存标签；API 查找支持选择多个标签并查出包含所选标签的 API。
- 已修改 `src/store.js`：新增 `ssql_tags` 和 `ssql_api_tags` 表，增加标签列表/新增、API 标签关联保存、API 详情和列表返回 `tagIds`/`tags`，并支持 `tagIds` 多标签包含筛选。
- 已修改 `src/server.js`：新增 `GET /admin/tags` 和 `POST /admin/tags` 管理接口，`GET /admin/apis` 透传标签筛选查询参数。
- 已修改 `public/index.html`、`public/app.js`、`public/style.css`：新增标签管理弹窗、API 标签多选、列表筛选标签多选和 API 列表标签展示。
- 已更新 `INSTALL.md` 和 `readme.md` 记录新增表和管理接口。
- 已新增 `test/store.test.js` 覆盖标签名称和标签 id 归一化。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `PORT=3016 npm run dev` 启动当前代码并完成 MySQL 初始化。
  - `curl -L http://127.0.0.1:3016/admin/tags` 返回 `code: 0`。
  - `curl -L 'http://127.0.0.1:3016/admin/apis?tagIds=__missing_tag__'` 返回空分页结果。
  - `curl -I http://127.0.0.1:3016/app.js` 返回 `200 OK`。

### 数据库表名改为 adata 前缀

- 用户要求：数据库表命名按 `adata_` 开头；数据库中的表名用户自行修改，程序中的表名全部替换成 `adata_` 开头。
- 已修改 `src/store.js`：运行时和迁移逻辑中的表名改为 `adata_api_definitions`、`adata_api_call_logs`、`adata_tags`、`adata_api_tags`。
- 已同步索引/唯一键命名为 `idx_adata_*`、`ux_adata_*`，保持数据库对象命名一致。
- 已更新 `INSTALL.md` 中自动建表说明。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。
  - `rg -n "ssql_" src test public INSTALL.md readme.md package.json app.config.jsonc database.config.json` 无匹配。

### API 标签弹窗选择和未保存颜色

- 用户要求：API 标签选择使用弹出窗口，选择完成后返回显示在界面上；保存前标签颜色和已保存标签颜色做区分。
- 已修改 `public/index.html`：接口信息里的标签区域改为“选择标签”按钮和已选标签回显，并新增 `tagSelectModal` 标签选择弹窗。
- 已修改 `public/app.js`：API 标签选择改为页面状态保存，弹窗确定后回显到表单；保存时提交当前已选标签；API 回填时记录已保存标签集合用于颜色对比。
- 已修改 `public/style.css`：已保存标签使用青绿色，待保存标签使用橙色，标签选择弹窗列表支持内部滚动。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 筛选标签弹窗选择

- 用户要求：筛选中的标签选择也使用弹窗选择。
- 已修改 `public/index.html`：筛选区标签改为“选择标签”按钮和已选标签回显。
- 已修改 `public/app.js`：复用标签选择弹窗，按 API 标签和筛选标签两种模式读取、回填和提示；筛选标签选择后先回显，点击“查找”时才提交到 API 列表查询。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### API 标签按钮位置调整

- 用户要求：`tag-field half-span` 参考 `capability-control span-2`，移动“选择标签”按钮的位置。
- 已修改 `public/index.html`：API 标签区域改为左侧标题和已选标签、右侧“选择标签”按钮的结构。
- 已修改 `public/style.css`：`.tag-field.half-span` 使用类似 `.capability-control` 的边框、间距、对齐和小屏幕纵向布局。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 说明和标签位置对调

- 用户要求：说明和标签位置对调。
- 已修改 `public/index.html`：将“说明”移动到原 API 标签区域位置，将“标签”移动到原说明区域位置。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 说明和超时字段同排

- 用户要求：“说明”“SQL超时(秒)”“JS超时(秒)”三者放在一行，说明占前 2 列。
- 已修改 `public/index.html`：将说明字段调整为 `half-span`，并放在 SQL 超时和 JS 超时前面，使三者在 4 列表单中同排显示。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 标签整行和说明单行输入

- 用户要求：`tag-field half-span` 占满一行，说明 `textarea` 改成 `input`。
- 已修改 `public/index.html`：说明字段改为单行输入框。
- 已修改 `public/style.css`：`.tag-field.half-span` 在表单网格中占满整行。
- 验证：
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 测试按钮移动和中断测试

- 用户要求：“测试 SQL”和“测试 JS”放在日志右边，且都需要增加中断测试功能。
- 已修改 `public/index.html`：将测试 SQL、测试 JS 按钮移动到日志面板标题右侧，并新增中断 SQL、中断 JS 按钮。
- 已修改 `public/style.css`：补充日志标题操作区换行布局和中断按钮样式。
- 已修改 `public/app.js`：测试 SQL、测试 JS 使用 `AbortController` 管理请求；点击中断按钮会取消当前测试请求并恢复按钮状态。
- 已修改 `src/server.js`、`src/scriptRunner.js`、`src/sqlExecutor.js`、`src/runtime.js`：管理端测试请求断开时，后端会向下游传递中断信号，JS Worker 会终止，SQL 查询会尽量取消并关闭连接。
- 已更新 `test/scriptRunner.test.js` 和 `test/sqlExecutor.test.js`：覆盖 JS 测试中断和 SQL 已中断信号提前退出。
- 验证：
  - `for file in src/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### API 请求安全验证建议

- 用户询问：每个 API 请求建议使用什么安全验证。
- 建议方向：外部动态 API 优先使用 HTTPS、调用方身份认证、权限控制、时间戳签名防重放、限流、参数校验、审计日志和敏感数据脱敏；管理端接口需要更强的登录态和权限隔离。

### 用户注册和 Authenticator 身份设计

- 用户想做用户注册，使用 Google Authenticator 登记，并在 API 请求时带上身份。
- 设计建议：注册时建立用户账号和 TOTP 密钥绑定；登录时先校验账号密码，再校验 Authenticator 动态码；API 调用使用登录后签发的访问令牌携带身份，并在运行时注入 userId、roles 等身份上下文。

### API 授权和授权页 IP 白名单

- 用户询问：用户需要每个 API 授权，授权页面打开需要在 IP 白名单里，这样是否可行。
- 设计建议：方案可行；API 执行权限应按用户/角色/API 维度独立校验，授权管理页面可额外增加 IP 白名单作为管理入口保护，但不能只依赖 IP 白名单替代登录、二次验证和操作审计。

### 用户到 API 权限和 API 调用 IP 白名单

- 用户确认只使用“用户 -> API 权限”模型，并询问 API 调用 IP 白名单限制某些 API 只能从指定服务器调用时配置什么。
- 设计建议：API 调用 IP 白名单应作为每个 API 的独立配置，保存允许访问该 API 的来源 IP/CIDR 列表；请求执行时在用户授权校验之外，再校验请求来源 IP 是否命中该 API 的白名单。

### 权限设计总结和目录存放建议

- 用户要求总结用户注册、Authenticator、用户到 API 权限、授权页 IP 白名单和 API 调用 IP 白名单方案，并说明项目需要建一个文件夹存放。
- 设计建议：可新增独立安全模块目录，集中存放用户认证、TOTP、访问令牌、API 授权、IP 白名单和审计相关代码，避免分散在 server/runtime/store 中。

### 管理员权限定义和授权位置

- 用户询问：授权页面访问流程中的管理员权限指什么、在哪里授权。
- 设计建议：在只使用“用户 -> API 权限”作为 API 执行授权模型时，管理后台权限应单独作为用户管理权限字段或管理权限表维护，用于控制是否能进入授权页面和修改权限配置。

### 安全认证授权设计和操作文档落盘

- 用户要求：写一份详细的设计文档和操作文档存盘。
- 已新增 `docs/security/AUTH_DESIGN.md`：记录用户注册、Google Authenticator、token、用户到 API 权限、授权页面 IP 白名单、API 调用 IP 白名单、数据表和模块目录设计。
- 已新增 `docs/security/AUTH_OPERATION.md`：记录初始化、注册、绑定、登录、授权、IP 白名单配置、调用方使用、审计和应急处理流程。
- 已修改 `readme.md`：在顶部增加两份安全文档入口链接。
- 验证：已检查两份文档文件存在，`readme.md` 入口链接已写入。

### 安全文档表名前缀调整

- 用户要求：表名使用 `adata_security` 开头。
- 已修改 `docs/security/AUTH_DESIGN.md` 和 `docs/security/AUTH_OPERATION.md`：安全相关表名统一改为 `adata_security_` 前缀，索引名同步调整。
- 验证：`rg -n "adata_(users|user_sessions|user_api_permissions|api_ip_whitelist|admin_ip_whitelist|user_recovery_codes)" docs/security/AUTH_DESIGN.md docs/security/AUTH_OPERATION.md` 无旧表名残留。

## 2026-09-05

### 安全认证授权模块开发

- 用户要求：单独新开一个文件夹用于存放这个项目，并根据设计文档开发。
- 已新增 `src/security/` 独立安全模块目录，包含用户认证、TOTP、token、用户到 API 授权、IP 白名单、安全审计、数据访问和统一中间件。
- 已新增安全相关自动建表逻辑：`adata_security_users`、`adata_security_user_sessions`、`adata_security_user_api_permissions`、`adata_security_api_ip_whitelist`、`adata_security_admin_ip_whitelist`、`adata_security_audit_logs`。
- 已新增后端安全接口：注册、登录、登出、当前用户、Authenticator 绑定/确认、用户列表、用户管理权限更新、用户 API 授权、API 调用 IP 白名单、授权入口 IP 白名单和安全审计日志。
- 已修改 `src/server.js` 和 `src/runtime.js`：`security.enabled=true` 时，动态 API 会校验 Bearer token、用户到 API 权限和 API 调用 IP 白名单；内部 `callApi` 也会按同一用户继续逐个 API 校验。
- 已修改 `src/scriptRunner.js`：脚本上下文增加 `username`、`displayName`、`authType`。
- 已修改 `app.config.jsonc` 和 `src/config.js`：增加 `security` 配置段，默认 `enabled=false`，支持环境变量覆盖。
- 已更新 `docs/security/AUTH_DESIGN.md`、`docs/security/AUTH_OPERATION.md`、`readme.md`、`INSTALL.md`，同步当前实现和配置说明。
- 已新增 `test/security.test.js`，并更新配置和脚本上下文测试。
- 验证：


- 验证：
  - `for file in src/*.js src/security/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 助手能力说明

- 用户询问“你能做什么”。
- 回复将围绕当前项目说明可提供的代码阅读、功能开发、问题排查、测试验证、文档维护、安全设计和服务运维协助能力。

### 安全认证授权前端页面

- 用户询问“对应的前端页面呢”，随后要求继续。
- 已修改 `public/index.html`：在主工具栏增加登录、当前用户、安全管理和退出入口；新增登录/注册/Authenticator 绑定弹窗；新增安全管理弹窗，包含用户、API 授权、API IP、授权页 IP 和审计五个页签。
- 已修改 `public/app.js`：统一请求封装自动携带 Bearer token；接入注册、登录、退出、当前用户、TOTP 绑定；接入用户管理、用户到 API 授权、API 调用 IP 白名单、授权页 IP 白名单和审计日志接口；未登录或 401 时自动打开登录弹窗。
- 已修改 `public/style.css`：补充认证和安全管理弹窗样式，增加窄屏单列布局，避免用户/API/IP 规则列表在小屏幕挤压。
- 已微调 `src/security/securityMiddleware.js` 和 `src/server.js`：当前用户、登出和 TOTP 绑定接口要求真实登录会话，避免开发兜底用户误绑定。
- 验证：
  - `node -e '...'` DOM ID 校验通过，`public/app.js` 中 118 个 `getElementById` 都能在 `public/index.html` 找到。
  - `for file in src/*.js src/security/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 关闭 3010 开发服务

- 用户要求关闭 `3010` 端口。
- 已向本轮启动的 `npm run dev` 会话发送中断信号，停止 `node src/server.js`。
- 验证：`ss -ltnp` 中已无 `0.0.0.0:3010` 监听。

### 修复安全用户注册 datetime 写入错误

- 用户提供 `/admin/security/register` 报错日志：MySQL `datetime` 字段不接受 `2026-09-05T20:21:21.907+08:00` 格式。
- 已修改 `src/security/securityStore.js`：创建安全用户时不再把日志用的带时区时间字符串写入 `created_at`、`updated_at`，改为使用表字段默认 `current_timestamp`。
- 已修改 `test/security.test.js`：新增测试覆盖安全用户创建 SQL，确认不再手动写入 `created_at`、`updated_at`。
- 验证：
  - `node --check src/security/securityStore.js` 通过。
  - `node --check test/security.test.js` 通过。
  - `npm test` 通过。

### 管理员绑定 Google Authenticator 操作说明

- 用户询问管理员如何绑定 Google Authenticator。
- 回复将说明：先注册首个管理员或使用已有管理员登录，再在前端账号/Authenticator 弹窗生成绑定密钥，用 Google Authenticator 扫描/录入密钥后输入 6 位验证码确认绑定。

### Google Authenticator 二维码生成说明

- 用户询问如何生成 Google Authenticator 绑定二维码。
- 回复将说明：二维码内容就是后端返回的 `otpauth://` URL，应在本地前端或后端生成二维码图片，不能调用第三方二维码 API；推荐使用本地 `qrcode` 类库渲染 canvas/svg。

### 生成 Authenticator 绑定密钥说明

- 用户提出“生成绑定密钥”。
- 回复将说明：绑定密钥必须通过 `/admin/security/totp/begin` 为当前已登录用户生成并写入数据库，前端可在账号/Authenticator 页签点击“生成绑定密钥”，也可使用 Bearer token 调接口生成。

### Authenticator 手动密钥去除空格

- 用户反馈点击“生成绑定密钥”后页面显示的手动密钥有空格。
- 已修改 `src/security/totpService.js`：`/admin/security/totp/begin` 返回无空格 `secret`，并让兼容字段 `secretPreview` 也保持无空格。
- 已修改 `public/app.js`：前端显示手动密钥时去除所有空白，兼容旧返回数据。
- 已修改 `docs/security/AUTH_DESIGN.md`：同步 TOTP 绑定接口示例。
- 验证：
  - `node --check src/security/totpService.js` 通过。
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 修改密码入口说明

- 用户询问“修改密码在哪”。
- 检查当前代码后确认：项目暂未实现修改密码接口和前端入口；建议放在右上角“账号”弹窗中，与 Authenticator 绑定同级。

### 再次说明生成 Authenticator 绑定密钥

- 用户再次提出“生成绑定密钥”。
- 回复将强调：绑定密钥必须通过当前登录用户调用 `/admin/security/totp/begin` 生成并写入数据库，不能只在聊天中离线生成一个密钥；前端入口是右上角“账号” -> `Authenticator` -> “生成绑定密钥”。

### 优化 Authenticator 密钥展示

- 用户反馈点击“生成绑定密钥”后页面展示文字不清晰。
- 已修改 `public/index.html`：Authenticator 面板中将“手动密钥”和“绑定地址”拆成独立字段，并增加复制按钮。
- 已修改 `public/app.js`：生成绑定密钥后只更新密钥值和绑定地址值，避免按钮文字和密钥内容混在一起；复制按钮在有内容后显示。
- 已修改 `public/style.css`：补充密钥展示行样式和移动端布局，长密钥和 `otpauth://` 地址会自动换行。
- 验证：
  - DOM ID 校验通过，`public/app.js` 中 122 个 `getElementById` 都能在 `public/index.html` 找到。
  - `node --check public/app.js` 通过。
  - `npm test` 通过。

### 账号弹窗按登录状态动态显示

- 用户要求：`currentUserInfo` 增加 `padding-top:7px`；账号弹窗未登录时显示登录/注册，已登录未绑定 Authenticator 时显示退出/绑定密钥，已登录且已绑定时显示修改密码/退出；主界面的退出按钮不要。
- 已修改 `public/style.css`：为 `#currentUserInfo` 增加 `padding-top: 7px`。
- 已修改 `public/index.html`：移除主工具栏退出按钮；账号弹窗新增“修改密码”和“退出”操作，并增加修改密码表单。
- 已修改 `public/app.js`：账号弹窗按登录态和 `totpEnabled` 动态显示登录/注册、绑定密钥/退出、修改密码/退出；退出操作移入账号弹窗；前端接入修改密码提交。
- 已修改 `src/security/securityStore.js`、`src/security/authService.js`、`src/server.js`：新增当前用户修改密码接口 `/admin/security/password/change`，校验旧密码，并在已绑定 Authenticator 时校验 6 位验证码。
- 已修改 `test/security.test.js`：新增修改密码测试。
- 验证：
  - DOM ID 校验通过，`public/app.js` 中 128 个 `getElementById` 都能在 `public/index.html` 找到。
  - `for file in src/*.js src/security/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 注册和修改密码二次确认

- 用户要求：修改密码时输入两次新密码，前端先校验一致；注册时密码也输入两次；页面显示密码规则；保存密码失败提示放在账号弹窗内；安全管理未登录时不要显示。
- 已修改 `public/index.html`：注册表单增加确认密码；修改密码表单增加确认新密码；账号弹窗增加固定错误提示区域；注册和修改密码表单都显示密码规则。
- 已修改 `public/app.js`：注册和修改密码先校验密码规则和两次输入一致；修改密码失败显示在账号弹窗内，且不触发 401 自动跳登录；安全管理按钮改为只有已登录且具备 `isAdmin` 或 `canManageAuth` 时显示。
- 已修改 `public/style.css`：增加账号弹窗内错误/成功提示和密码规则样式。
- 验证：
  - DOM ID 校验通过，`public/app.js` 中 131 个 `getElementById` 都能在 `public/index.html` 找到。
  - `for file in src/*.js src/security/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 账号弹窗 Caps Lock 提示和关闭规则

- 用户要求：注册和修改密码时，如果按了大写键需要提示用户当前是大写状态；账号设置弹窗只有点击关闭时才关闭。
- 已修改 `public/index.html`：注册表单和修改密码表单增加“大写锁定已开启”提示区域。
- 已修改 `public/style.css`：增加 Caps Lock 提示样式。
- 已修改 `public/app.js`：注册密码、注册确认密码、原密码、新密码、确认新密码输入框监听 Caps Lock 状态；账号弹窗不再支持点击遮罩、按 Esc、登录成功、绑定成功或退出后自动关闭，只能点击右上角关闭按钮关闭。
- 验证：
  - DOM ID 校验通过，`public/app.js` 中 133 个 `getElementById` 都能在 `public/index.html` 找到。
  - `for file in src/*.js src/security/*.js public/app.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 安全管理拆分为独立页面

- 用户要求：安全管理独立成一个 Web 页面，点击主界面“安全”跳转到新页面。
- 已新增 `public/security.html`：独立安全管理页面，包含用户、API 授权、API IP、授权页 IP、审计五个管理页签。
- 已新增 `public/security.js`：独立页面复用 `ssql.security.token` 和现有安全管理接口；未登录或无管理权限时显示阻断提示，不展示管理页签。
- 已修改 `public/app.js`：主界面“安全”按钮改为跳转 `/security.html`；删除主页面旧安全弹窗状态、DOM 引用、函数和事件绑定。
- 已修改 `public/index.html`：删除主页面旧安全管理弹窗 DOM。
- 已修改 `public/style.css`：增加独立安全页面布局样式。
- 已修改 `docs/security/AUTH_OPERATION.md`：授权页面入口同步为主界面“安全”按钮跳转到 `/security.html`。
- 验证：
  - DOM ID 校验通过，`public/app.js` 中 111 个 `getElementById` 都能在 `public/index.html` 找到，`public/security.js` 中 25 个 `getElementById` 都能在 `public/security.html` 找到。
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 登录失败提示放入账号弹窗

- 用户要求：登录时的操作失败提示放在窗口上。
- 已修改 `public/app.js`：登录请求失败时关闭自动 401 跳转处理，错误信息显示在账号弹窗内的 `authMessage` 区域，不再由全局 `runEditorAction` 走右下角 toast。
- 验证：
  - 主页面和安全页 DOM ID 校验通过。
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 登录成功后关闭账号弹窗

- 用户要求：登录成功后账号设置窗口关闭。
- 已修改 `public/app.js`：登录成功更新登录状态后调用 `closeAuthModal()`，只恢复登录成功自动关闭行为。
- 验证：
  - `node --check public/app.js` 通过。
  - 主页面和安全页 DOM ID 校验通过。

### 未登录不加载接口数据并自动登录

- 用户要求：`security.html` 中 `securityCurrentUser` 增加 `padding-top:7px`；未登录时 API 接口页面不查询任务数据，自动弹出登录窗口，登录成功后刷新 API 接口页面。
- 已修改 `public/style.css`：为 `#securityCurrentUser` 增加 `padding-top: 7px`。
- 已修改 `public/app.js`：抽出 `loadInitialAdminData()`；启动时先校验当前登录用户，没有有效登录态则只打开登录窗口并停止加载数据库源、标签和 API 列表；登录成功后关闭窗口并调用 `loadInitialAdminData({ selectFirst: true })` 刷新 API 接口页面。
- 验证：
  - 主页面和安全页 DOM ID 校验通过。
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 未登录禁用保存和发布

- 用户要求：没有登录时关闭保存/发布按钮。
- 已修改 `public/app.js`：新增 `syncAuthProtectedActions()`，未登录时禁用 `保存` 和 `发布/停用` 按钮，并设置提示；登录状态变化和保存中状态变化都会重新同步按钮状态。
- 验证：
  - 主页面和安全页 DOM ID 校验通过。
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 登录密码 Caps Lock 提示

- 用户要求：用户登录时，如果按了大写键需要提示用户是大写状态。
- 已修改 `public/index.html`：登录表单密码框下方增加“大写锁定已开启”提示区域。
- 已修改 `public/app.js`：登录密码输入框接入 Caps Lock 状态检测。
- 验证：
  - 主页面和安全页 DOM ID 校验通过。
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 补充可信代理影响说明

- 用户要求：在 `docs/security/AUTH_OPERATION.md` 中写清楚配置可信代理时，如果请求不是来自可信代理，具体会影响什么。
- 已修改 `docs/security/AUTH_OPERATION.md`：补充可信代理定义、白名单判断和审计日志影响；说明未命中可信代理时系统会忽略 `X-Forwarded-For`/`X-Real-IP`，使用 TCP `remoteAddress`，可能导致授权页 IP 白名单、API 调用 IP 白名单匹配失败，审计日志记录代理 IP。
- 已补充错误配置风险和排查步骤。
- 验证：已检查文档 3.2 节内容和关键词。

### 补充授权页面 IP 白名单配置说明

- 用户要求：在 `docs/security/AUTH_OPERATION.md` 中写清楚授权页面 IP 白名单在哪里配置，以及不配置会影响什么。
- 已修改 `docs/security/AUTH_OPERATION.md`：补充配置入口“主界面 -> 安全 -> /security.html -> 授权页 IP”、数据库表 `adata_security_admin_ip_whitelist`、接口 `GET/PUT /admin/security/admin-ip-whitelist`。
- 已补充不配置时的当前实现行为：无启用规则且 `adminIpWhitelistRequired=false` 时不限制 IP；无启用规则但 `adminIpWhitelistRequired=true` 时所有来源都无法进入授权管理接口；已有启用规则时必须命中规则。
- 已补充受影响接口、不影响内容、上线建议流程和锁定恢复方式。
- 验证：已检查文档 3.3 节内容和关键词。

### 修复安全管理静态页面未走 IP 白名单

- 用户询问授权页面 IP 白名单逻辑实现位置，并反馈配置了 `adata_security_admin_ip_whitelist` 后没有限制安全管理页面。
- 已确认原实现中 `src/security/ipWhitelistService.js` 和 `src/security/securityMiddleware.js` 已限制 `/admin/security/*` 安全管理接口，但 `/security.html` 静态页面由 `serveStatic()` 直接返回，未经过授权页 IP 白名单校验。
- 已修改 `src/security/securityMiddleware.js`：新增 `requireAdminPageIp(req)`，用于静态安全管理页面入口 IP 校验。
- 已修改 `src/server.js`：返回 `/security.html` 静态文件前调用 `security.middleware.requireAdminPageIp(req)`。
- 已修改 `docs/security/AUTH_OPERATION.md`：在授权页面 IP 白名单章节补充具体实现位置。
- 已修改 `test/security.test.js`：新增测试覆盖开启安全时页面入口会执行授权页 IP 校验，关闭安全时不执行。
- 验证：
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 核对授权页面 IP 白名单规则

- 用户要求再次核对 `docs/security/AUTH_OPERATION.md` 中 `### 3.3 配置授权页面 IP 白名单` 的规则。
- 已对照 `src/security/ipWhitelistService.js`、`src/security/securityMiddleware.js`、`src/server.js` 和 `app.config.jsonc` 核对。
- 已修改 `docs/security/AUTH_OPERATION.md`：明确授权页 IP 白名单只在 `security.enabled=true` 时生效；`/security.html` 静态页面只做 IP 入口校验；`/admin/security/*` 接口继续校验登录态、授权页 IP、Authenticator 和管理权限；只有 `enabled=1` 的规则参与匹配。
- 验证：已检查文档 3.3 节内容和关键词。

### 记录 admin permission is required 原因

- 用户要求：在 `docs/security/AUTH_OPERATION.md` 记录 `admin permission is required` 是什么问题引起的。
- 已修改 `docs/security/AUTH_OPERATION.md`：新增“常见管理权限错误”小节，说明该错误表示当前用户不是系统管理员，即 `adata_security_users.is_admin != 1`。
- 已补充典型触发场景：系统已有用户后调用 `POST /admin/security/register` 创建用户，必须使用 `is_admin = 1` 的系统管理员；只有 `can_manage_auth = 1` 的授权管理员不能创建用户。
- 已补充和 `auth management permission is required` 的区别。

### 说明用户中的管理员和授权字段用法

- 用户询问：用户中的“管理员”和“授权”各是什么用法。
- 已说明：管理员对应 `is_admin`，用于系统级管理和创建用户；授权对应 `can_manage_auth`，用于维护用户到 API 的授权、API 调用 IP 白名单、授权页 IP 白名单和审计查询。

### 说明授权管理员出现 admin permission is required 的原因

- 用户询问：授权管理员为什么会提示 `admin permission is required`。
- 已说明：授权管理员只有 `can_manage_auth = 1`，不等于系统管理员；如果当前操作调用的是要求 `is_admin = 1` 的接口，例如已有用户后创建/注册用户，就会返回 `admin permission is required`。

### 修复授权管理员打开主页和安全管理提示 admin permission is required

- 用户反馈：授权管理员打开主页和安全管理都会提示 `admin permission is required`。
- 已定位原因：主页登录后自动调用普通 `/admin/*` API 编辑接口，这些接口要求 `is_admin = 1`；安全管理页加载 API 目录时也调用了 `/admin/apis`，导致只有 `can_manage_auth = 1` 的授权管理员被系统管理员权限挡住。
- 已修改 `src/server.js`：新增 `GET /admin/security/apis`，走 `requireAuthManager(req)`，供安全管理页加载 API 目录使用。
- 已修改 `public/security.js`：安全管理页改用 `/admin/security/apis`；授权管理员打开页面不再因为 API 目录加载触发系统管理员权限校验；用户列表里的用户状态、管理员、授权保存控件对非系统管理员禁用。
- 已修改 `public/app.js`：主页仅系统管理员加载 API 编辑数据；授权管理员登录后只保留安全管理入口，不再自动请求普通 API 编辑接口。

### 修复授权管理员主页 renderSelectedTags 未定义

- 用户反馈：授权管理员打开主页显示 `renderSelectedTags is not defined`。
- 已定位原因：授权管理员主页分支调用了不存在的 `renderSelectedTags()`。
- 已修改 `public/app.js`：改为调用已有的 `renderTagControls()`，统一刷新 API 标签、筛选标签和标签管理显示。

### 说明注册接口返回 authorization bearer token is required

- 用户反馈：访问 `http://127.0.0.1:3010/admin/security/register` 返回 `401 authorization bearer token is required`，询问是否弄错。
- 已说明：当前实现中只有第一个用户注册不需要 token；数据库已有用户后，`POST /admin/security/register` 被当作管理员创建用户接口，需要系统管理员 Bearer token。未带 token 返回 401，带非系统管理员 token 会返回 `admin permission is required`。

### 说明用户状态 active/disabled/locked

- 用户询问：用户管理里的 `active`、`disabled`、`locked` 是什么意思。
- 已核对代码：当前只有 `active` 用户可以登录和继续使用 token；`disabled` 和 `locked` 在登录及 token 校验时都会被拒绝，返回 `user is not active`。
- 已说明建议用法：`disabled` 用于管理员手工停用账号，`locked` 用于风控或异常登录后的临时锁定；当前实现两者行为相同，只是业务含义不同。

### 说明管理员创建新用户流程

- 用户询问：按流程管理员用户怎么创建新用户。
- 已说明：当前实现中已有用户后，创建新用户使用 `POST /admin/security/register`，必须由 `is_admin = 1` 的系统管理员登录后携带 Bearer token 调用；新用户默认普通用户，后续在安全管理页设置 `active`、`管理员`、`授权` 和 API 权限。

### 说明现有注册入口逻辑

- 用户询问：现有注册入口的逻辑是什么，是否区分第一个用户。
- 已核对 `src/server.js`、`src/security/authService.js` 和 `public/app.js`：前端注册入口只提交 `POST /admin/security/register`；后端通过 `countUsers()` 区分是否已有用户。
- 已说明：第一个用户不需要 Bearer token，会自动设置 `is_admin=1` 和 `can_manage_auth=1`；已有用户后注册接口要求系统管理员 Bearer token，否则未带 token 返回 401，非系统管理员返回 `admin permission is required`。

### 修复系统管理员登录后找不到注册入口

- 用户反馈：系统管理员登录后找不到注册入口。
- 已定位原因：`public/app.js` 中账号弹窗已登录后统一隐藏注册页签，并且 `getDefaultAuthMode()` 会把已登录用户切到绑定密钥或修改密码页签。
- 已修改 `public/app.js`：系统管理员已登录且已绑定 Authenticator 时显示“新增用户”页签；点击后进入原注册表单并调用 `POST /admin/security/register` 携带管理员 Bearer token 创建用户。
- 已调整新增成功后的前端行为：管理员新增用户成功后不跳到登录页，清空表单并在窗口内提示用户已创建。

### 说明“当前账号可进入安全管理，不能编辑 API”提示条件

- 用户询问：`当前账号可进入安全管理，不能编辑 API` 什么时候会提示。
- 已核对 `public/app.js`：主页调用 `loadInitialAdminData()` 时，如果当前用户存在但 `isAdmin` 不为真，就不会加载普通 API 编辑数据，并显示该提示。
- 已说明：典型是授权管理员 `canManageAuth=1` 且 `isAdmin=0` 登录主页时出现；普通用户如果能登录主页也会触发同一分支，但通常不会显示安全入口。

### 说明用户状态种类

- 用户询问：用户有几种状态。
- 已说明：当前前端用户管理下拉框提供 3 种状态：`active`、`disabled`、`locked`；数据库默认是 `active`；后端实际只允许 `active` 登录和使用 token。

### 修复普通用户误提示可进入安全管理

- 用户反馈：`当前账号可进入安全管理，不能编辑 API` 应该只有授权管理员提示，普通用户也提示了。
- 已定位原因：`public/app.js` 的主页初始化只判断了 `!isAdmin`，把普通用户和授权管理员合并成同一提示。
- 已修改 `public/app.js`：非系统管理员仍不加载 API 编辑接口；`canManageAuth=1` 时提示可进入安全管理，普通用户提示 `当前账号没有后台管理权限`。

### 调整普通用户主页提示文案

- 用户要求：`当前账号没有后台管理权限` 显示为 `普通用户` 即可。
- 已修改 `public/app.js`：普通用户登录主页后的状态提示改为 `普通用户`，权限判断不变。

### Authenticator 绑定密钥增加二维码扫码

- 用户要求：绑定密钥生成二维码，可以直接扫码。
- 已安装本地依赖 `qrcode`，避免调用第三方二维码接口泄露 `otpauth://` 密钥内容。
- 已修改 `src/security/totpService.js`：`beginBind()` 生成绑定密钥时同步生成 `qrCodeSvg` 并返回给前端。
- 已修改 `public/index.html`、`public/app.js`、`public/style.css`：账号弹窗的“绑定密钥”页签显示二维码，Google Authenticator 可直接扫码；手动密钥和绑定地址仍保留。
- 已新增 `test/security.test.js` 覆盖 TOTP 绑定响应包含本地二维码 SVG。

### 解释 loadInitialAdminData 非系统管理员分支

- 用户询问：`loadInitialAdminData()` 中 `if (!state.auth.user?.isAdmin)` 分支的作用，并询问普通用户能不能获取 API 列表。
- 已说明：该分支是主页前端保护，非系统管理员不加载 `/admin/apis`、`/admin/tags`、`/admin/database-sources` 等 API 编辑数据，避免触发系统管理员权限校验。
- 已说明：普通用户不能获取后台 API 管理列表 `/admin/apis`；普通用户只能携带 token 调用自己已授权的动态 API，不能查看全部 API 列表。

### 说明普通用户获取 token

- 用户询问：普通用户如何获取自己的 token。
- 已说明：普通用户通过 `POST /admin/security/login` 使用账号、密码和已绑定后的 Google Authenticator 6 位验证码登录，响应中的 `data.accessToken` 就是调用动态 API 时使用的 Bearer token。

### 说明 token 失效机制

- 用户询问：token 失效机制。
- 已核对 `src/security/tokenService.js`、`src/security/securityStore.js`、`src/security/authService.js` 和配置：登录成功生成 32 字节随机 token，只保存 SHA-256 hash 到 `adata_security_user_sessions`；过期时间由 `security.tokenTtlSeconds`/`SECURITY_TOKEN_TTL_SECONDS` 控制，默认 8 小时。
- 已说明失效条件：超过 `expires_at`、退出登录写入 `revoked_at`、token 不存在或被篡改、用户状态不是 `active`；当前没有滑动续期，也没有自动清理过期 session 的定时任务。

### 实现改密撤销 session 和管理员踢下线

- 用户要求：修改密码后撤销该用户所有 session，管理员可手工踢下线。
- 已修改 `src/security/securityStore.js`：新增 `revokeUserSessions(userId)`，撤销指定用户所有未撤销的会话。
- 已修改 `src/security/authService.js`：修改密码成功后撤销该用户所有有效 session，并在审计详情记录撤销数量。
- 已修改 `src/server.js`：新增 `POST /admin/security/users/{userId}/sessions/revoke`，仅系统管理员可调用，用于手工踢用户下线并写审计日志。
- 已修改 `public/security.js`、`public/style.css`：安全管理用户列表增加“踢下线”按钮，非系统管理员禁用，当前登录账号不允许踢自己。
- 已修改 `public/app.js`：修改密码成功后清空本地 token，切回登录表单，提示用户重新登录。
- 已更新 `test/security.test.js`：覆盖修改密码成功后撤销 session 和审计详情。

### 讨论多 API 开发者实现方式

- 用户询问：多 API 开发者怎么实现。
- 已说明：当前项目还没有独立的“API 开发者”权限模型，`is_admin=1` 才能编辑全部 API；如要支持多人开发，建议新增 API 所有者/协作者权限表，实现用户对单个 API 的编辑、测试、发布权限，而不是把所有开发者都设为系统管理员。

### 讨论用户表是否需要 API 开发者标识

- 用户询问：API 开发者对应的用户表是否需要增加字段区分是否是 API 开发者。
- 已说明：不建议只在用户表增加全局 `is_api_developer` 字段，因为 API 开发权限通常是按 API 分配；可以只通过 `adata_security_api_developers` 权限表判断，也可以加一个用户级总开关作为入口权限，但最终仍要查用户到 API 的开发权限表。

### 实现 can_develop_api 和 adata_security_api_developers

- 用户要求：`can_develop_api` 和 `adata_security_api_developers` 两个都要加。
- 已修改 `src/security/securityStore.js`：`adata_security_users` 新增 `can_develop_api` 字段和旧表补列迁移；新增 `adata_security_api_developers` 表，保存用户到 API 的 `can_edit`、`can_test`、`can_publish` 开发权限；新增开发权限查询、保存和校验方法。
- 已修改 `src/security/permissionService.js`、`src/security/securityMiddleware.js`：新增 API 开发者总权限和单 API 动作权限校验。
- 已修改 `src/server.js`、`src/store.js`：普通 `/admin/apis` 改为系统管理员或 API 开发者可访问；开发者列表只返回自己有开发权限的 API；保存、测试、发布分别校验 `can_edit`、`can_test`、`can_publish`；开发者新建 API 后自动获得该 API 的完整开发权限。
- 已修改 `public/app.js`：`canDevelopApi=1` 的用户可以加载 API 编辑主页；普通用户仍只显示 `普通用户`，授权管理员仍提示只能进入安全管理。
- 已修改 `public/security.html`、`public/security.js`、`public/style.css`：安全管理增加“开发”用户开关和“API 开发”页签，用于系统管理员配置用户到 API 的编辑、测试、发布权限。
- 已修改 `docs/security/AUTH_OPERATION.md`：补充 API 开发者角色和开发权限判断规则。
- 已更新 `test/security.test.js`：补充 API 开发权限动作校验测试。

### 形成前端接口权限文档并复核脚本绕过

- 用户要求：列出所有前端执行的接口及对应权限，查看是否存在直接执行脚本绕开控制的问题，形成单独文档；后续调整权限需要更新该文档。
- 已新增 `docs/security/FRONTEND_API_PERMISSIONS.md`：列出主页 `public/app.js`、安全管理页 `public/security.js` 当前实际调用的接口、后端权限校验函数、允许身份和补充限制。
- 已在文档中写明维护要求：前端新增/删除/调整接口调用，或后端调整接口权限时，必须同步更新该文档。
- 已复核脚本执行链路：前端没有直接提交任意 JS 到后端执行的接口；脚本执行入口为 API 测试接口和动态 API 执行。
- 已发现并修复管理端测试脚本内 `callApi` 的跨 API 权限绕过风险：`allowDraft=true` 测试场景下，脚本调用目标 API 时现在必须继续校验目标 API 的 `can_test`。
- 已修改 `src/runtime.js`：新增 `executeCallApiWithMethod()`，解析脚本内 `callApi` 目标 API 后执行 `authorizeCallApi` 回调，并将该回调传递到嵌套调用。
- 已修改 `src/server.js`：管理端 `test-sql`、`test-script`、`test-api` 使用当前登录用户作为脚本上下文，并通过 `createTestCallAuthorizer()` 对脚本内 `callApi` 目标 API 校验 `can_test`。
- 已更新 `test/runtime.test.js`：覆盖 `executeCallApi` 会先授权目标 API 再执行。

### 说明 SQL 执行技术和高并发连接风险

- 用户询问：SQL 是用什么技术执行的，高并发情况下会不会把数据库连接打到无响应。
- 已核对 `src/sqlExecutor.js`、`src/store.js`、`app.config.jsonc` 和 `database.config.json`。
- 已说明：元数据表使用 `mysql2/promise` 连接池，`connectionLimit=10`；业务 API SQL 按数据源类型执行，MySQL 使用 `mysql2/promise`，SQL Server 使用 `mssql`。
- 已说明当前业务 SQL 执行是每次请求创建业务数据库连接或 mssql 连接池，用完关闭，不是长期复用业务库连接池；高并发会大量新建连接，可能耗尽数据库最大连接数、认证资源、网络端口或让连接排队，导致响应变慢或失败。
- 已说明现有保护：SQL 超时、脚本超时、调用深度、SQL 安全关键字限制；但当前缺少全局并发限制、每数据源业务连接池上限、队列上限、熔断和慢查询隔离。

### 说明并发限流设计

- 用户询问：并发限流怎么做。
- 已说明建议按三层做：全局 API 并发、按数据源并发、按单个 API 并发；超过并发上限时进入有限队列，队列满或等待超时返回 429/503。
- 已说明代码落点：在 `src/runtime.js` 的 `executeApi()` 包住动态 API 总执行，在 `src/sqlExecutor.js` 执行 SQL 前按 `databaseAlias` 限制数据库并发；API 级限流按 `api.id` 维度。

### 实现业务连接池和按数据源并发限制

- 用户要求：先处理业务连接池和按数据源并发限制。
- 已新增 `src/concurrencyLimiter.js`：实现轻量并发限制器，支持 `max`、`queueLimit`、`queueTimeoutMs`，队列满返回 429，等待超时返回 503，请求中断返回 499。
- 已修改 `src/config.js` 和 `app.config.jsonc`：新增 `runtime.sqlExecution.businessPool` 和 `runtime.sqlExecution.datasourceConcurrency` 配置；支持按数据源 alias 覆盖并发参数。
- 已修改 `src/sqlExecutor.js`：业务 MySQL 改为按数据源复用 `mysql2/promise` pool，业务 MSSQL 改为按数据源复用 `mssql.ConnectionPool`；`executeSqlWithFields()` 在执行 SQL 前按数据源拿并发令牌，并在 `finally` 中释放。
- 已修改 `src/server.js`：服务收到 `SIGINT`/`SIGTERM` 时关闭元数据库连接池和业务数据库连接池。
- 已新增 `docs/CONCURRENCY_LIMITS.md`：记录配置位置、错误返回、实现位置和调参建议。
- 已新增 `test/concurrencyLimiter.test.js`，并扩展 `test/config.test.js`、`test/sqlExecutor.test.js`，覆盖配置归一化、业务池复用和数据源并发限制。

### 前端按钮跟随单 API 开发权限

- 用户要求：API 开发已经按每个 API 设置编辑、测试和发布权限，前端页面按钮也要跟着设置。
- 已修改 `src/server.js`：`/admin/apis` 列表、详情、新建、保存、发布和停用响应附带当前用户对该 API 的 `developerPermission.canEdit/canTest/canPublish`。
- 已修改 `public/app.js`：新建、保存、测试 SQL、测试 JS、发布/停用按钮按当前用户和当前 API 权限禁用；快捷键 `Ctrl/Cmd+S`、`Ctrl/Cmd+Enter` 同样走权限判断，避免绕过按钮。
- 已调整测试行为：只有测试权限但没有编辑权限时，测试按钮可用，但不会先保存页面草稿，后端使用数据库中已保存的 API 配置测试；只有发布权限但没有编辑权限时，发布/停用也不会先保存草稿。
- 已更新 `docs/security/FRONTEND_API_PERMISSIONS.md`：补充主页按钮控制规则和后端返回的开发权限字段。
- 验证：
  - `for file in src/*.js src/security/*.js public/app.js public/security.js test/*.js; do node --check "$file" || exit 1; done` 通过。
  - `npm test` 通过。

### 新建 API 默认开发权限去掉发布

- 用户要求：API 开发者新建接口后默认可编辑、可测试，但去掉可发布。
- 已修改 `src/server.js`：非系统管理员创建 API 后自动授予 `canEdit=true`、`canTest=true`、`canPublish=false`。
- 已更新 `docs/security/FRONTEND_API_PERMISSIONS.md`：同步 `POST /admin/apis` 权限说明。

### 说明登录 expiresAt 时间

- 用户询问：`admin/security/login` 返回的 `expiresAt` 是什么时间。
- 已核对 `src/security/tokenService.js`、`src/security/index.js`、`src/config.js` 和 `app.config.jsonc`。
- 结论：`expiresAt` 是登录成功时的 token 过期时间，按 `Date.now() + tokenTtlSeconds` 计算，当前配置 `tokenTtlSeconds = 28800` 秒，即登录后 8 小时；响应值为 ISO UTC 时间。
- 用户进一步确认：中国用户实际过期时间需要按北京时间理解；例如北京时间 2026-09-12 14:52:34 登录，返回 `2026-09-12T14:52:34.000Z` 对应北京时间 2026-09-12 22:52:34。
