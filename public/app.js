const state = {
  // 页面级状态集中保存，避免多个控件各自维护重复数据。
  apis: [],
  current: null,
  tags: [],
  apiTagIds: [],
  apiSavedTagIds: [],
  searchTagIds: [],
  tagSelectMode: "api",
  auth: {
    token: "",
    user: null,
    authMode: "login"
  },
  testControllers: {
    sql: null,
    script: null
  },
  databaseSources: [],
  defaultDatabaseAlias: "default",
  list: {
    name: "",
    sql: "",
    tagIds: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1
  },
  rowFields: [],
  scriptType: "result",
  scriptDrafts: {
    params: "",
    result: ""
  },
  capabilityModalSnapshot: [],
  saving: false,
  toastTimer: null,
  editorContextMenu: null,
  editors: {
    params: null,
    sql: null,
    script: null
  }
};

const sqlResultCachePrefix = "ssql.sqlResult.";
const apiInfoCollapsePrefix = "ssql.apiInfoCollapsed.";

function getAppBasePath() {
  // 反向代理挂在 /ssql/ 这类子路径时，app.js 的实际地址会带前缀。
  // 用当前脚本地址反推出前缀，后续 /admin/* 请求才能走同一个 Nginx location。
  const script = document.currentScript || document.querySelector('script[src$="app.js"]');
  if (!script) return "";
  const scriptPath = new URL(script.getAttribute("src"), window.location.href).pathname;
  return scriptPath.endsWith("/app.js") ? scriptPath.slice(0, -"/app.js".length) : "";
}

const appBasePath = getAppBasePath();

const els = {
  // DOM 引用只在启动时获取一次，后续逻辑通过 els 访问页面控件。
  apiList: document.getElementById("apiList"),
  newApiBtn: document.getElementById("newApiBtn"),
  tagManageBtn: document.getElementById("tagManageBtn"),
  apiSearchForm: document.getElementById("apiSearchForm"),
  nameSearchInput: document.getElementById("nameSearchInput"),
  sqlSearchInput: document.getElementById("sqlSearchInput"),
  searchTagSelectBtn: document.getElementById("searchTagSelectBtn"),
  searchTagSummary: document.getElementById("searchTagSummary"),
  pageSizeInput: document.getElementById("pageSizeInput"),
  resetSearchBtn: document.getElementById("resetSearchBtn"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  pageInfo: document.getElementById("pageInfo"),
  saveBtn: document.getElementById("saveBtn"),
  authOpenBtn: document.getElementById("authOpenBtn"),
  securityOpenBtn: document.getElementById("securityOpenBtn"),
  currentUserInfo: document.getElementById("currentUserInfo"),
  statusToggleBtn: document.getElementById("statusToggleBtn"),
  pageTitle: document.getElementById("pageTitle"),
  statusText: document.getElementById("statusText"),
  statusBadge: document.getElementById("statusBadge"),
  apiInfoToggleBtn: document.getElementById("apiInfoToggleBtn"),
  apiInfoGrid: document.getElementById("apiInfoGrid"),
  toast: document.getElementById("toast"),
  nameInput: document.getElementById("nameInput"),
  pathInput: document.getElementById("pathInput"),
  methodInput: document.getElementById("methodInput"),
  databaseAliasInput: document.getElementById("databaseAliasInput"),
  sqlTimeoutInput: document.getElementById("sqlTimeoutInput"),
  scriptTimeoutInput: document.getElementById("scriptTimeoutInput"),
  apiTagSelectBtn: document.getElementById("apiTagSelectBtn"),
  apiTagSummary: document.getElementById("apiTagSummary"),
  tagSelectModal: document.getElementById("tagSelectModal"),
  tagSelectCloseBtn: document.getElementById("tagSelectCloseBtn"),
  tagSelectList: document.getElementById("tagSelectList"),
  tagSelectCancelBtn: document.getElementById("tagSelectCancelBtn"),
  tagSelectApplyBtn: document.getElementById("tagSelectApplyBtn"),
  tagModal: document.getElementById("tagModal"),
  tagCloseBtn: document.getElementById("tagCloseBtn"),
  tagCreateForm: document.getElementById("tagCreateForm"),
  tagNameInput: document.getElementById("tagNameInput"),
  tagAddBtn: document.getElementById("tagAddBtn"),
  tagDoneBtn: document.getElementById("tagDoneBtn"),
  tagManageList: document.getElementById("tagManageList"),
  capabilitySummary: document.getElementById("capabilitySummary"),
  capabilityOpenBtn: document.getElementById("capabilityOpenBtn"),
  capabilityModal: document.getElementById("capabilityModal"),
  capabilityCloseBtn: document.getElementById("capabilityCloseBtn"),
  capabilityCancelBtn: document.getElementById("capabilityCancelBtn"),
  capabilityApplyBtn: document.getElementById("capabilityApplyBtn"),
  capFilesInspectInput: document.getElementById("capFilesInspectInput"),
  capFilesDownloadInput: document.getElementById("capFilesDownloadInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  paramsInput: document.getElementById("paramsInput"),
  sqlModeInput: document.getElementById("sqlModeInput"),
  sqlHelpBtn: document.getElementById("sqlHelpBtn"),
  rawSqlHelpBtn: document.getElementById("rawSqlHelpBtn"),
  xmlSqlHelpBtn: document.getElementById("xmlSqlHelpBtn"),
  sqlHelpBox: document.getElementById("sqlHelpBox"),
  sqlHelpCloseBtn: document.getElementById("sqlHelpCloseBtn"),
  sqlHelpContent: document.getElementById("sqlHelpContent"),
  runSqlBtn: document.getElementById("runSqlBtn"),
  abortSqlBtn: document.getElementById("abortSqlBtn"),
  runScriptBtn: document.getElementById("runScriptBtn"),
  abortScriptBtn: document.getElementById("abortScriptBtn"),
  logBox: document.getElementById("logBox"),
  rowFieldsInfo: document.getElementById("rowFieldsInfo"),
  sqlInput: document.getElementById("sqlInput"),
  scriptTypeInput: document.getElementById("scriptTypeInput"),
  scriptHelpBtn: document.getElementById("scriptHelpBtn"),
  scriptHelpBox: document.getElementById("scriptHelpBox"),
  scriptHelpCloseBtn: document.getElementById("scriptHelpCloseBtn"),
  scriptInput: document.getElementById("scriptInput"),
  authModal: document.getElementById("authModal"),
  authMessage: document.getElementById("authMessage"),
  authCloseBtn: document.getElementById("authCloseBtn"),
  authLoginTabBtn: document.getElementById("authLoginTabBtn"),
  authRegisterTabBtn: document.getElementById("authRegisterTabBtn"),
  authTotpTabBtn: document.getElementById("authTotpTabBtn"),
  authPasswordTabBtn: document.getElementById("authPasswordTabBtn"),
  authLogoutTabBtn: document.getElementById("authLogoutTabBtn"),
  loginForm: document.getElementById("loginForm"),
  loginUsernameInput: document.getElementById("loginUsernameInput"),
  loginPasswordInput: document.getElementById("loginPasswordInput"),
  loginCapsLockWarning: document.getElementById("loginCapsLockWarning"),
  loginTotpInput: document.getElementById("loginTotpInput"),
  loginSubmitBtn: document.getElementById("loginSubmitBtn"),
  registerForm: document.getElementById("registerForm"),
  registerUsernameInput: document.getElementById("registerUsernameInput"),
  registerDisplayNameInput: document.getElementById("registerDisplayNameInput"),
  registerPasswordInput: document.getElementById("registerPasswordInput"),
  registerPasswordConfirmInput: document.getElementById("registerPasswordConfirmInput"),
  registerCapsLockWarning: document.getElementById("registerCapsLockWarning"),
  registerSubmitBtn: document.getElementById("registerSubmitBtn"),
  totpPanel: document.getElementById("totpPanel"),
  totpBeginBtn: document.getElementById("totpBeginBtn"),
  totpSecretBox: document.getElementById("totpSecretBox"),
  totpQrCode: document.getElementById("totpQrCode"),
  totpSecretValue: document.getElementById("totpSecretValue"),
  totpSecretCopyBtn: document.getElementById("totpSecretCopyBtn"),
  totpUrlValue: document.getElementById("totpUrlValue"),
  totpUrlCopyBtn: document.getElementById("totpUrlCopyBtn"),
  totpConfirmInput: document.getElementById("totpConfirmInput"),
  totpConfirmBtn: document.getElementById("totpConfirmBtn"),
  passwordForm: document.getElementById("passwordForm"),
  oldPasswordInput: document.getElementById("oldPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  newPasswordConfirmInput: document.getElementById("newPasswordConfirmInput"),
  passwordTotpInput: document.getElementById("passwordTotpInput"),
  passwordCapsLockWarning: document.getElementById("passwordCapsLockWarning"),
  passwordSubmitBtn: document.getElementById("passwordSubmitBtn")
};

const defaultParamScript = "";
const authTokenKey = "ssql.security.token";

const defaultResultScript = `async function main({ params, resultSets, callApi, files }) {
  return resultSets;
}`;

const scriptCapabilityDefinitions = [
  {
    name: "files.inspectUrl",
    label: "探测网络文件大小"
  },
  {
    name: "files.downloadTemp",
    label: "下载到临时文件"
  }
];

const capabilityReturnSchemas = {
  "files.inspectUrl": {
    properties: {
      url: null,
      contentType: null,
      size: null,
      downloaded: null
    }
  },
  "files.downloadTemp": {
    properties: {
      url: null,
      contentType: null,
      size: null,
      fileId: null,
      filename: null
    }
  },
  "files.tryInspectUrl": {
    properties: {
      ok: null,
      data: {
        properties: {
          url: null,
          contentType: null,
          size: null,
          downloaded: null
        }
      },
      error: {
        properties: {
          name: null,
          capability: null,
          code: null,
          message: null,
          statusCode: null,
          details: null
        }
      }
    }
  },
  "files.tryDownloadTemp": {
    properties: {
      ok: null,
      data: {
        properties: {
          url: null,
          contentType: null,
          size: null,
          fileId: null,
          filename: null
        }
      },
      error: {
        properties: {
          name: null,
          capability: null,
          code: null,
          message: null,
          statusCode: null,
          details: null
        }
      }
    }
  },
  "callApi.tryGet": {
    properties: {
      ok: null,
      data: null,
      error: {
        properties: {
          name: null,
          capability: null,
          code: null,
          message: null,
          statusCode: null,
          details: null
        }
      }
    }
  },
  "callApi.tryPost": {
    properties: {
      ok: null,
      data: null,
      error: {
        properties: {
          name: null,
          capability: null,
          code: null,
          message: null,
          statusCode: null,
          details: null
        }
      }
    }
  }
};

const contextHintFields = ["requestId", "userId", "username", "displayName", "authType", "roles", "callDepth", "callChain", "scriptType"];
const resultSetHintFields = ["fields", "rows"];
const arrayHintFields = ["length", "at", "concat", "entries", "every", "filter", "find", "findIndex", "forEach", "includes", "indexOf", "join", "map", "slice", "some"];
const commonHeaderNames = ["accept", "accept-language", "content-type", "host", "origin", "referer", "user-agent", "x-forwarded-for", "x-request-id"];

const sqlHelpText = {
  raw: `select *
from students
where id = #{id}

-- 参数从示例参数或请求入参读取:
-- { "id": 1 }

-- 多结果集和临时表示例:
create temporary table tmp_students (id int);
insert into tmp_students values (#{id});
select * from tmp_students;
select count(*) as total from tmp_students;
drop temporary table tmp_students;`,
  xml: `<select>
  select *
  from students
  <where>
    <if test="id != null">
      and id = #{id}
    </if>
    <if test="name != null and name != ''">
      and name like #{name}
    </if>
  </where>
</select>`
};

function timeoutMsToSeconds(value, fallbackMs) {
  return Math.max(1, Math.round(Number(value || fallbackMs) / 1000));
}

function timeoutSecondsToMs(value, fallbackSeconds) {
  return Math.floor(Math.max(1, Number(value) || fallbackSeconds) * 1000);
}

function showStatus(message) {
  els.statusText.textContent = message;
}

function showToast(message, type = "success") {
  if (state.toastTimer) clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast${type === "error" ? " error" : ""}`;
  state.toastTimer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2600);
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value || value === "点击生成后显示") {
    showToast("请先生成绑定密钥", "error");
    return;
  }
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
  } else {
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast("已复制");
}

function getLocalPageUrl(path) {
  const pagePath = path.startsWith("/") ? path : `/${path}`;
  return `${appBasePath}${pagePath}`;
}

function getCurrentDeveloperPermission(api = state.current) {
  const user = state.auth.user;
  if (!user) return { canEdit: false, canTest: false, canPublish: false };
  if (user.isAdmin) return { canEdit: true, canTest: true, canPublish: true };
  if (!user.canDevelopApi) return { canEdit: false, canTest: false, canPublish: false };
  if (!api || !api.id) return { canEdit: true, canTest: true, canPublish: true };
  const permission = api.developerPermission || {};
  return {
    canEdit: Boolean(permission.canEdit),
    canTest: Boolean(permission.canTest),
    canPublish: Boolean(permission.canPublish)
  };
}

function canCreateApi() {
  const user = state.auth.user;
  return Boolean(user?.isAdmin || user?.canDevelopApi);
}

function permissionDeniedMessage(action) {
  if (!state.auth.user) return "请先登录后继续操作";
  if (!state.auth.user.isAdmin && !state.auth.user.canDevelopApi) return "当前账号没有 API 开发权限";
  const actionText = {
    edit: "编辑",
    test: "测试",
    publish: "发布或停用"
  }[action] || "操作";
  return `当前账号没有此 API 的${actionText}权限`;
}

function assertCurrentApiPermission(action) {
  const permission = getCurrentDeveloperPermission();
  const allowed = action === "edit"
    ? permission.canEdit
    : action === "test"
      ? permission.canTest
      : permission.canPublish;
  if (!allowed) throw new Error(permissionDeniedMessage(action));
}

function syncAuthProtectedActions() {
  const permission = getCurrentDeveloperPermission();
  const isSqlTesting = Boolean(state.testControllers.sql);
  const isScriptTesting = Boolean(state.testControllers.script);
  els.newApiBtn.disabled = !canCreateApi();
  els.newApiBtn.title = canCreateApi() ? "" : permissionDeniedMessage("edit");
  els.saveBtn.disabled = state.saving || !permission.canEdit;
  els.statusToggleBtn.disabled = !permission.canPublish;
  els.runSqlBtn.disabled = isSqlTesting || !permission.canTest;
  els.runScriptBtn.disabled = isScriptTesting || !permission.canTest;
  els.saveBtn.title = permission.canEdit ? "" : permissionDeniedMessage("edit");
  els.statusToggleBtn.title = permission.canPublish ? "" : permissionDeniedMessage("publish");
  els.runSqlBtn.title = permission.canTest ? "Ctrl/Cmd+Enter" : permissionDeniedMessage("test");
  els.runScriptBtn.title = permission.canTest ? "Ctrl/Cmd+Enter" : permissionDeniedMessage("test");
}

function setSaveLoading(loading) {
  // 保存请求未完成前禁用按钮，避免重复提交同一份 API 定义。
  state.saving = Boolean(loading);
  els.saveBtn.classList.toggle("loading", state.saving);
  els.saveBtn.textContent = state.saving ? "保存中..." : "保存";
  syncAuthProtectedActions();
}

function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = Boolean(loading);
  button.classList.toggle("loading", Boolean(loading));
  button.textContent = loading ? text : button.dataset.defaultText;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function setTestRunning(type, running) {
  const isSql = type === "sql";
  const runButton = isSql ? els.runSqlBtn : els.runScriptBtn;
  const abortButton = isSql ? els.abortSqlBtn : els.abortScriptBtn;
  setButtonLoading(runButton, running, "测试中...");
  if (abortButton) {
    abortButton.disabled = !running;
    abortButton.classList.toggle("hidden", !running);
  }
  syncAuthProtectedActions();
}

function beginTestRun(type) {
  // 每类测试只保留一个 AbortController，避免重复点击导致日志和按钮状态互相覆盖。
  if (state.testControllers[type]) return null;
  const controller = new AbortController();
  state.testControllers[type] = controller;
  setTestRunning(type, true);
  return controller;
}

function finishTestRun(type, controller) {
  if (state.testControllers[type] !== controller) return;
  state.testControllers[type] = null;
  setTestRunning(type, false);
}

function abortTestRun(type) {
  const controller = state.testControllers[type];
  if (!controller) return;
  controller.abort();
  showStatus(type === "sql" ? "正在中断 SQL 测试..." : "正在中断 JS 测试...");
}

function showLog(value) {
  els.logBox.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function buildSqlTestDisplay(data) {
  if (data && data.directReturn) return data.result === undefined ? null : data.result;
  const resultSets = Array.isArray(data && data.resultSets) ? data.resultSets : [];
  if (resultSets.length > 1) {
    return resultSets.map((item) => Array.isArray(item.rows) ? item.rows : []);
  }
  return Array.isArray(data && data.rows) ? data.rows : [];
}

function selectedLineRange(editor) {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  return {
    fromLine: from.line,
    toLine: to.ch === 0 && to.line > from.line ? to.line - 1 : to.line
  };
}

function toggleLineComment(editor, commentToken) {
  if (!commentToken) {
    showToast("当前编辑器不支持注释", "error");
    return;
  }
  const range = selectedLineRange(editor);
  const lines = [];
  for (let lineNo = range.fromLine; lineNo <= range.toLine; lineNo += 1) {
    const line = editor.getLine(lineNo);
    if (line.trim()) lines.push({ lineNo, line });
  }
  if (lines.length === 0) return;

  const everyCommented = lines.every(({ line }) => line.trimStart().startsWith(commentToken.trim()));
  editor.operation(() => {
    for (const { lineNo, line } of lines) {
      const indentLength = line.match(/^\s*/)[0].length;
      if (everyCommented) {
        const contentStart = line.slice(indentLength);
        const tokenText = commentToken.trim();
        if (!contentStart.startsWith(tokenText)) continue;
        let removeLength = tokenText.length;
        if (contentStart[removeLength] === " ") removeLength += 1;
        editor.replaceRange("", CodeMirror.Pos(lineNo, indentLength), CodeMirror.Pos(lineNo, indentLength + removeLength));
      } else {
        editor.replaceRange(commentToken, CodeMirror.Pos(lineNo, indentLength));
      }
    }
  });
}

function formatJsonEditor(editor) {
  const value = JSON.parse(editor.getValue() || "{}");
  editor.setValue(JSON.stringify(value, null, 2));
}

function formatSqlText(text) {
  const keywords = [
    "select", "from", "where", "left join", "right join", "inner join", "join", "on",
    "group by", "order by", "having", "limit", "union", "insert into", "update", "delete from", "values", "set"
  ];
  let output = text.replace(/\s+/g, " ").trim();
  for (const keyword of keywords) {
    const pattern = new RegExp(`\\s+(${keyword.replace(/\s+/g, "\\s+")})\\b`, "ig");
    output = output.replace(pattern, "\n$1");
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function formatXmlText(text) {
  // MyBatis XML 只做标签层级缩进，不解析表达式，避免改动 test 条件中的业务逻辑。
  const compact = text
    .replace(/\r\n/g, "\n")
    .replace(/>\s+</g, "><")
    .replace(/</g, "\n<")
    .replace(/>/g, ">\n");
  let indent = 0;
  return compact
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const closing = /^<\//.test(line);
      const selfClosing = /\/>$/.test(line) || /^<!(?:--|\[CDATA\[)/.test(line);
      if (closing) indent = Math.max(0, indent - 1);
      const formatted = `${"  ".repeat(indent)}${line}`;
      if (!closing && !selfClosing && /^<[^!?][^>]*>$/.test(line)) indent += 1;
      return formatted;
    })
    .join("\n");
}

function formatJsText(text) {
  // 轻量 JS 格式化只调整缩进和括号换行；复杂场景后续应接入 Prettier/Monaco。
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/([{}])/g, "\n$1\n")
    .replace(/;\s*/g, ";\n");
  let indent = 0;
  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^[}\])]/.test(line)) indent = Math.max(0, indent - 1);
      const formatted = `${"  ".repeat(indent)}${line}`;
      if (/[{[(]$/.test(line)) indent += 1;
      return formatted;
    })
    .join("\n");
}

async function formatEditor(editor, formatter) {
  if (typeof formatter !== "function") {
    showToast("当前编辑器不支持格式化", "error");
    return null;
  }
  const result = await formatter(editor);
  syncAutoHeightEditor(editor);
  showToast(result && result.skipped ? "格式化失败，已保留原内容" : "格式化完成", result && result.skipped ? "error" : "success");
  return result;
}

function formatSqlEditor(editor) {
  editor.setValue(formatSqlText(editor.getValue()));
}

function formatXmlEditor(editor) {
  editor.setValue(formatXmlText(editor.getValue()));
}

function formatScriptEditor(editor) {
  editor.setValue(formatJsText(editor.getValue()));
}

async function formatRemoteEditor(editor, payload) {
  const result = await request("/admin/format-code", {
    method: "POST",
    body: JSON.stringify({
      text: editor.getValue(),
      ...payload
    })
  });
  if (!result.skipped) {
    editor.setValue(result.text || "");
  }
  return result;
}

async function formatJsonRemoteEditor(editor) {
  return formatRemoteEditor(editor, { language: "json" });
}

async function formatScriptRemoteEditor(editor) {
  return formatRemoteEditor(editor, { language: "javascript" });
}

async function formatSqlAutoEditor(editor) {
  const result = await formatRemoteEditor(editor, {
    language: "sql",
    sqlMode: "auto",
    dialect: "mysql"
  });
  els.sqlModeInput.value = result.kind === "xml" ? "xml" : "sql";
  applySqlEditorMode();
  if (result.warning) {
    showStatus(result.warning);
  } else {
    showStatus(result.kind === "xml" ? "已按 MyBatis XML 格式化" : "已按原生 SQL 格式化");
  }
  return result;
}

function readScriptCapabilities() {
  // 能力按 API 单独授权；未勾选时脚本里的同名方法会被后端拒绝。
  return scriptCapabilityDefinitions
    .filter((capability) => {
      const input = document.querySelector(`input[name="scriptCapability"][value="${capability.name}"]`);
      return input && input.checked;
    })
    .map((capability) => capability.name);
}

function fillScriptCapabilities(capabilities) {
  const allowed = new Set(Array.isArray(capabilities) ? capabilities : []);
  for (const capability of scriptCapabilityDefinitions) {
    const input = document.querySelector(`input[name="scriptCapability"][value="${capability.name}"]`);
    if (input) input.checked = allowed.has(capability.name);
  }
  renderScriptCapabilitySummary();
}

function renderScriptCapabilitySummary() {
  els.capabilitySummary.innerHTML = "";
  const selected = readScriptCapabilities();
  if (selected.length === 0) {
    const empty = document.createElement("span");
    empty.className = "capability-empty";
    empty.textContent = "未选择脚本能力";
    els.capabilitySummary.appendChild(empty);
    return;
  }

  for (const name of selected) {
    const definition = scriptCapabilityDefinitions.find((item) => item.name === name);
    const chip = document.createElement("span");
    chip.className = "capability-chip";
    chip.textContent = definition ? definition.label : name;
    els.capabilitySummary.appendChild(chip);
  }
}

function openCapabilityModal() {
  state.capabilityModalSnapshot = readScriptCapabilities();
  els.capabilityModal.classList.remove("hidden");
}

function closeCapabilityModal(options = {}) {
  if (options.restore) fillScriptCapabilities(state.capabilityModalSnapshot);
  els.capabilityModal.classList.add("hidden");
}

function setSqlHelpType(type) {
  // SQL 帮助只切换示例文本，不改变当前 SQL 编辑模式和用户输入。
  const helpType = type === "xml" ? "xml" : "raw";
  els.sqlHelpContent.textContent = sqlHelpText[helpType];
  els.rawSqlHelpBtn.classList.toggle("active", helpType === "raw");
  els.xmlSqlHelpBtn.classList.toggle("active", helpType === "xml");
}

function sqlResultCacheKey(api) {
  // SQL 结果缓存按 API 名称隔离，用于刷新页面后保留 rows 字段提示。
  const name = String(api && api.name || "").trim();
  return name ? `${sqlResultCachePrefix}${encodeURIComponent(name)}` : null;
}

function apiInfoCollapseKey(api) {
  // 接口信息区折叠状态按 API id 保存；未保存的新 API 没有稳定 id，因此不持久化。
  const id = String(api && api.id || "").trim();
  return id ? `${apiInfoCollapsePrefix}${encodeURIComponent(id)}` : null;
}

function isApiInfoCollapsed() {
  return els.apiInfoGrid.classList.contains("hidden");
}

function readApiInfoCollapsed(api) {
  const key = apiInfoCollapseKey(api);
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch (error) {
    return false;
  }
}

function saveApiInfoCollapsed(api, collapsed) {
  const key = apiInfoCollapseKey(api);
  if (!key) return;
  try {
    if (collapsed) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch (error) {
    showStatus(`接口信息显示状态保存失败: ${error.message}`);
  }
}

function setApiInfoCollapsed(collapsed, options = {}) {
  const shouldCollapse = Boolean(collapsed);
  els.apiInfoGrid.classList.toggle("hidden", shouldCollapse);
  els.apiInfoToggleBtn.textContent = shouldCollapse ? "⌄" : "⌃";
  els.apiInfoToggleBtn.title = shouldCollapse ? "显示接口信息" : "隐藏接口信息";
  els.apiInfoToggleBtn.setAttribute("aria-label", els.apiInfoToggleBtn.title);
  els.apiInfoToggleBtn.setAttribute("aria-expanded", String(!shouldCollapse));
  if (options.persist !== false) saveApiInfoCollapsed(state.current, shouldCollapse);
}

function applyApiInfoCollapsed(api, options = {}) {
  const collapsed = options.collapsed ?? readApiInfoCollapsed(api);
  setApiInfoCollapsed(collapsed, { persist: false });
}

function loadCachedSqlResult(api) {
  const key = sqlResultCacheKey(api);
  if (!key) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    // 名称不一致时丢弃缓存，避免重名变更或旧数据污染当前编辑器。
    if (!cached || cached.apiName !== String(api.name || "").trim()) return null;
    return cached;
  } catch (error) {
    return null;
  }
}

function saveCachedSqlResult(api, result) {
  const key = sqlResultCacheKey(api);
  if (!key) return;
  // 只缓存前 50 行，字段补全足够使用，同时避免 localStorage 写入过大。
  const rows = Array.isArray(result.rows) ? result.rows.slice(0, 50) : [];
  const cache = {
    apiName: String(api.name || "").trim(),
    apiId: api.id || null,
    path: api.path || "",
    method: api.method || "",
    params: result.params || {},
    total: Number(result.total || 0),
    rowFields: Array.isArray(result.rowFields) ? result.rowFields : [],
    rows,
    updatedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch (error) {
    showStatus(`SQL 结果缓存失败: ${error.message}`);
  }
}

function applyCachedSqlResult(api) {
  const cached = loadCachedSqlResult(api);
  if (!cached) {
    updateRowFields([]);
    showLog("等待测试 SQL");
    return;
  }

  const fields = Array.isArray(cached.rowFields) && cached.rowFields.length > 0
    ? cached.rowFields
    : collectRowFields(cached.rows || []);
  // 缓存字段会驱动 JS 编辑器中 row/rows 的属性提示。
  updateRowFields(fields);
  showLog({
    cached: true,
    updatedAt: cached.updatedAt,
    apiName: cached.apiName,
    params: cached.params,
    total: cached.total,
    rowFields: fields,
    rows: cached.rows
  });
}

function formatStatus(status) {
  const map = {
    draft: "草稿",
    published: "已发布",
    disabled: "已停用"
  };
  return map[status] || status || "草稿";
}

function parseJsonEditor(editor, fallback) {
  const text = editor.getValue().trim();
  if (!text) return fallback;
  return JSON.parse(text);
}

function validateParamsEditor() {
  // 参数编辑器实时校验 JSON 合法性，并要求顶层必须是对象。
  try {
    const params = parseJsonEditor(state.editors.params, {});
    const valid = params && typeof params === "object" && !Array.isArray(params);
    return {
      valid,
      error: valid ? "" : "params 必须是 JSON 对象"
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

function updateParamsEditorValidity() {
  const result = validateParamsEditor();
  const wrapper = state.editors.params.getWrapperElement();
  wrapper.classList.toggle("CodeMirror-invalid", !result.valid);
  wrapper.title = result.valid ? "" : `示例参数 JSON 无效: ${result.error}`;
  return result.valid;
}

function readParamsEditor() {
  const params = parseJsonEditor(state.editors.params, {});
  // 示例参数必须是对象，因为后端会把它作为 SQL 命名参数来源。
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new Error("params 必须是 JSON 对象");
  }
  return params;
}

function detectSqlMode(sql) {
  // SQL 模式只影响编辑器提示；后端执行时仍会自动识别纯 SQL 或 MyBatis XML。
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<\s*(mapper|select)\b/i.test(String(sql || ""))
    ? "xml"
    : "sql";
}

function applySqlMode(api) {
  // 新数据使用后端保存的 sqlMode；旧数据没有该字段时才按内容自动识别。
  els.sqlModeInput.value = api.sqlMode === "xml" || api.sqlMode === "sql"
    ? api.sqlMode
    : detectSqlMode(api.sqlText || "");
  applySqlEditorMode();
}

function getDefaultDatabaseAlias() {
  return state.defaultDatabaseAlias || state.databaseSources[0]?.alias || "default";
}

function renderDatabaseOptions(selectedAlias) {
  // 数据源列表来自后端脱敏配置，API 只保存 alias，不保存连接密码。
  const selected = selectedAlias || getDefaultDatabaseAlias();
  const sources = state.databaseSources.length > 0
    ? state.databaseSources
    : [{ alias: selected, type: "mysql", label: `${selected} (mysql)` }];
  els.databaseAliasInput.innerHTML = "";
  for (const source of sources) {
    const option = document.createElement("option");
    option.value = source.alias;
    option.textContent = source.label || `${source.alias} (${source.type})`;
    els.databaseAliasInput.appendChild(option);
  }
  els.databaseAliasInput.value = sources.some((source) => source.alias === selected) ? selected : getDefaultDatabaseAlias();
}

function normalizeTagIds(value) {
  const items = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  return [...new Set(items
    .map((item) => typeof item === "object" && item ? item.id : item)
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function readCheckedTagIds(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function renderTagChoices(container, inputName, selectedIds, emptyText) {
  const selected = new Set(normalizeTagIds(selectedIds));
  container.innerHTML = "";
  if (state.tags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  for (const tag of state.tags) {
    const label = document.createElement("label");
    label.className = "tag-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = inputName;
    input.value = tag.id;
    input.checked = selected.has(tag.id);
    const text = document.createElement("span");
    text.textContent = tag.name;
    label.append(input, text);
    container.appendChild(label);
  }
}

function renderTagManageList() {
  els.tagManageList.innerHTML = "";
  if (state.tags.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = "暂无标签";
    els.tagManageList.appendChild(empty);
    return;
  }

  for (const tag of state.tags) {
    const item = document.createElement("span");
    item.className = "tag-chip";
    item.textContent = tag.name;
    els.tagManageList.appendChild(item);
  }
}

function renderApiTagSummary(apiTagIds = state.apiTagIds) {
  // API 标签选择在弹窗中完成；表单区只回显结果，并用颜色区分已保存和待保存。
  const selectedIds = normalizeTagIds(apiTagIds);
  const savedIds = new Set(state.apiSavedTagIds);
  const tagById = new Map(state.tags.map((tag) => [tag.id, tag]));
  state.apiTagIds = selectedIds;
  els.apiTagSummary.innerHTML = "";

  if (selectedIds.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = state.tags.length === 0 ? "暂无标签，可先到标签管理新增" : "未选择标签";
    els.apiTagSummary.appendChild(empty);
    return;
  }

  for (const tagId of selectedIds) {
    const tag = tagById.get(tagId) || { id: tagId, name: tagId };
    const chip = document.createElement("span");
    chip.className = `tag-chip ${savedIds.has(tag.id) ? "saved" : "pending"}`;
    chip.textContent = tag.name;
    els.apiTagSummary.appendChild(chip);
  }
}

function renderSearchTagSummary(searchTagIds = state.searchTagIds) {
  const selectedIds = normalizeTagIds(searchTagIds);
  const tagById = new Map(state.tags.map((tag) => [tag.id, tag]));
  state.searchTagIds = selectedIds;
  els.searchTagSummary.innerHTML = "";

  if (selectedIds.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag-empty";
    empty.textContent = state.tags.length === 0 ? "暂无标签" : "未选择标签";
    els.searchTagSummary.appendChild(empty);
    return;
  }

  for (const tagId of selectedIds) {
    const tag = tagById.get(tagId) || { id: tagId, name: tagId };
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag.name;
    els.searchTagSummary.appendChild(chip);
  }
}

function renderTagControls(apiTagIds = state.apiTagIds, searchTagIds = state.searchTagIds) {
  renderApiTagSummary(apiTagIds);
  renderSearchTagSummary(searchTagIds);
  renderTagManageList();
}

async function loadTags() {
  const apiTagIds = state.apiTagIds;
  const searchTagIds = state.searchTagIds;
  state.tags = await request("/admin/tags");
  renderTagControls(apiTagIds, searchTagIds);
}

function collectRowFields(rows) {
  // 根据 SQL 结果行推断字段，用于 JS 编辑器的 rows[0].xxx 补全。
  const fields = new Set();
  for (const row of rows || []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of Object.keys(row)) fields.add(key);
  }
  return [...fields].sort();
}

function updateRowFields(fields) {
  state.rowFields = fields;
  els.rowFieldsInfo.textContent = `rows: ${fields.length} 个字段`;
}

function getParamFields() {
  try {
    return Object.keys(readParamsEditor()).sort();
  } catch (error) {
    return [];
  }
}

function isIdentifierStart(char) {
  return /[a-zA-Z_$]/.test(char || "");
}

function isIdentifierPart(char) {
  return /[a-zA-Z0-9_$]/.test(char || "");
}

function isKeywordAt(code, index, keyword) {
  const before = code[index - 1];
  const after = code[index + keyword.length];
  return code.slice(index, index + keyword.length) === keyword
    && !isIdentifierPart(before)
    && !isIdentifierPart(after);
}

function skipQuoted(code, index, quote) {
  let i = index + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
      continue;
    }
    if (code[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipLineComment(code, index) {
  let i = index + 2;
  while (i < code.length && code[i] !== "\n") i += 1;
  return i;
}

function skipBlockComment(code, index) {
  const end = code.indexOf("*/", index + 2);
  return end === -1 ? code.length : end + 2;
}

function skipIgnored(code, index) {
  // 对象补全扫描器需要跳过空白和注释，避免把注释里的代码当成真实声明。
  let i = index;
  while (i < code.length) {
    if (/\s/.test(code[i])) {
      i += 1;
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (code[i] === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    break;
  }
  return i;
}

function readIdentifier(code, index) {
  if (!isIdentifierStart(code[index])) return null;
  let i = index + 1;
  while (isIdentifierPart(code[i])) i += 1;
  return {
    name: code.slice(index, i),
    end: i
  };
}

function readStringKey(code, index) {
  const quote = code[index];
  let i = index + 1;
  let value = "";
  while (i < code.length) {
    if (code[i] === "\\") {
      if (i + 1 < code.length) value += code[i + 1];
      i += 2;
      continue;
    }
    if (code[i] === quote) {
      return {
        name: value,
        end: i + 1
      };
    }
    value += code[i];
    i += 1;
  }
  return null;
}

function skipNested(code, index, open, close) {
  // 跳过成对括号内容，防止对象属性值中的数组/函数/对象打断外层解析。
  let i = index + 1;
  let depth = 1;
  while (i < code.length && depth > 0) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) depth -= 1;
    i += 1;
  }
  return i;
}

function skipObjectValue(code, index) {
  let i = index;
  while (i < code.length) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }
    if (char === "{") {
      i = skipNested(code, i, "{", "}");
      continue;
    }
    if (char === "[") {
      i = skipNested(code, i, "[", "]");
      continue;
    }
    if (char === "(") {
      i = skipNested(code, i, "(", ")");
      continue;
    }
    if (char === "," || char === "}") break;
    i += 1;
  }
  return i;
}

function parseObjectLiteral(code, index) {
  // 轻量解析对象字面量，只记录属性名和嵌套对象，不求值也不执行代码。
  const node = { properties: {} };
  let i = index + 1;

  while (i < code.length) {
    i = skipIgnored(code, i);
    if (code[i] === "}") {
      return {
        node,
        end: i + 1
      };
    }

    if (code[i] === "." && code[i + 1] === "." && code[i + 2] === ".") {
      i = skipObjectValue(code, i + 3);
    } else {
      let key = null;
      if (code[i] === "\"" || code[i] === "'") {
        key = readStringKey(code, i);
      } else {
        key = readIdentifier(code, i);
      }

      if (!key) {
        i = skipObjectValue(code, i);
      } else {
        i = skipIgnored(code, key.end);
        if (code[i] === ":") {
          i = skipIgnored(code, i + 1);
          if (code[i] === "{") {
            const child = parseObjectLiteral(code, i);
            node.properties[key.name] = child.node;
            i = child.end;
          } else {
            node.properties[key.name] = null;
            i = skipObjectValue(code, i);
          }
        } else {
          node.properties[key.name] = null;
          if (code[i] === "(") i = skipNested(code, i, "(", ")");
          i = skipObjectValue(code, i);
        }
      }
    }

    i = skipIgnored(code, i);
    if (code[i] === ",") i += 1;
  }

  return {
    node,
    end: i
  };
}

function collectObjectLiteralVariables(code) {
  // 收集光标前 const/let/var name = { ... }，为 name.xxx 提供本地属性提示。
  const variables = {};
  let i = 0;

  while (i < code.length) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuoted(code, i, char);
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      i = skipLineComment(code, i);
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      i = skipBlockComment(code, i);
      continue;
    }

    const keyword = ["const", "let", "var"].find((item) => isKeywordAt(code, i, item));
    if (!keyword) {
      i += 1;
      continue;
    }

    i += keyword.length;
    while (i < code.length) {
      i = skipIgnored(code, i);
      const variable = readIdentifier(code, i);
      if (!variable) break;
      i = skipIgnored(code, variable.end);
      if (code[i] === "=") {
        i = skipIgnored(code, i + 1);
        if (code[i] === "{") {
          const parsed = parseObjectLiteral(code, i);
          variables[variable.name] = parsed.node;
          i = parsed.end;
        } else {
          i = skipObjectValue(code, i);
        }
      }
      i = skipIgnored(code, i);
      if (code[i] !== ",") break;
      i += 1;
    }
  }

  return variables;
}

function maskIgnoredCode(code) {
  // 变量来源分析只看真实代码；字符串和注释用空格占位，保持索引位置稳定。
  let output = "";
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    if (char === "\"" || char === "'" || char === "`") {
      const end = skipQuoted(code, i, char);
      output += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (char === "/" && code[i + 1] === "/") {
      const end = skipLineComment(code, i);
      output += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (char === "/" && code[i + 1] === "*") {
      const end = skipBlockComment(code, i);
      output += " ".repeat(end - i);
      i = end;
      continue;
    }
    output += char;
    i += 1;
  }
  return output;
}

function collectCapabilityReturnVariables(code) {
  // 识别 const/let/var 或普通赋值中来自已知能力方法的返回值，为变量点号补全提供字段。
  const safeCode = maskIgnoredCode(code);
  const matches = [];
  const methodNames = Object.keys(capabilityReturnSchemas)
    .map((name) => name.replace(".", "\\."))
    .join("|");
  const declarationPattern = new RegExp(`\\b(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:await\\s+)?(${methodNames})\\s*\\(`, "g");
  const assignmentPattern = new RegExp(`(?:^|[;\\n])\\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:await\\s+)?(${methodNames})\\s*\\(`, "g");

  for (const pattern of [declarationPattern, assignmentPattern]) {
    let match = pattern.exec(safeCode);
    while (match) {
      matches.push({
        index: match.index,
        variableName: match[1],
        schema: capabilityReturnSchemas[match[2]]
      });
      match = pattern.exec(safeCode);
    }
  }

  return matches
    .sort((left, right) => left.index - right.index)
    .reduce((variables, match) => {
      variables[match.variableName] = match.schema;
      return variables;
    }, {});
}

function resolveObjectPath(variables, objectPath) {
  // 支持 obj.child.deep 这种嵌套路径，找不到时交给 CodeMirror 原生补全。
  const parts = objectPath.split(".");
  let node = variables[parts[0]];
  for (const part of parts.slice(1)) {
    if (!node || !node.properties || !node.properties[part]) return null;
    node = node.properties[part];
  }
  return node;
}

function localObjectPropertyHint(editor, cursor, line) {
  // 当光标位于 obj. 或 obj.prefix 后面时，返回对象字面量或能力返回值中的属性列表。
  const propertyMatch = line.match(/([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)\.([a-zA-Z_$][a-zA-Z0-9_$]*)?$/);
  if (!propertyMatch) return null;

  const objectPath = propertyMatch[1];
  const prefix = propertyMatch[2] || "";
  const codeBeforeCursor = editor.getRange(CodeMirror.Pos(0, 0), cursor);
  const variables = {
    ...collectObjectLiteralVariables(codeBeforeCursor),
    ...collectCapabilityReturnVariables(codeBeforeCursor)
  };
  const objectNode = resolveObjectPath(variables, objectPath);
  if (!objectNode) return null;

  return {
    list: Object.keys(objectNode.properties).filter((field) => field.startsWith(prefix)).sort(),
    from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
    to: cursor
  };
}

async function request(path, options = {}) {
  // 管理端接口统一使用 { code, message, data }，这里拆出 data 并抛出错误信息。
  const { authRedirect = true, headers = {}, ...fetchOptions } = options;
  const requestPath = path.startsWith("/") ? `${appBasePath}${path}` : path;
  const token = state.auth.token || loadAuthToken();
  const response = await fetch(requestPath || path, {
    ...fetchOptions,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    const error = new Error(data.message || `request failed: ${response.status}`);
    error.statusCode = response.status;
    error.data = data.data;
    if (response.status === 401 && authRedirect) {
      saveAuthToken("");
      state.auth.user = null;
      renderAuthState();
      openAuthModal("login");
    }
    throw error;
  }
  return data.data;
}

function loadAuthToken() {
  try {
    return localStorage.getItem(authTokenKey) || "";
  } catch (error) {
    return "";
  }
}

function saveAuthToken(token) {
  state.auth.token = String(token || "");
  try {
    if (state.auth.token) localStorage.setItem(authTokenKey, state.auth.token);
    else localStorage.removeItem(authTokenKey);
  } catch (error) {
    showStatus(`登录状态保存失败: ${error.message}`);
  }
}

function renderAuthState() {
  const user = state.auth.user;
  const canOpenSecurity = user && (user.isAdmin || user.canManageAuth);
  els.currentUserInfo.textContent = user ? `${user.username}${user.totpEnabled ? "" : " · 未绑定"}` : "未登录";
  els.authOpenBtn.textContent = user ? "账号" : "登录";
  els.securityOpenBtn.classList.toggle("hidden", !canOpenSecurity);
  syncAuthProtectedActions();
}

function setAuthMessage(message = "", type = "error") {
  els.authMessage.textContent = message;
  els.authMessage.classList.toggle("hidden", !message);
  els.authMessage.classList.toggle("success", type === "success");
}

function validatePasswordInput(username, password) {
  const value = String(password || "");
  if (value.length < 12) return "密码至少需要 12 位";
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) return "密码必须同时包含字母和数字";
  if (value.toLowerCase() === String(username || "").toLowerCase()) return "密码不能与账号相同";
  return "";
}

function bindCapsLockWarning(inputs, warning) {
  const update = (event) => {
    if (!event || typeof event.getModifierState !== "function") return;
    warning.classList.toggle("hidden", !event.getModifierState("CapsLock"));
  };
  const hide = () => warning.classList.add("hidden");
  for (const input of inputs) {
    input.addEventListener("keydown", update);
    input.addEventListener("keyup", update);
    input.addEventListener("focus", update);
    input.addEventListener("blur", hide);
  }
}

function getDefaultAuthMode(mode) {
  const user = state.auth.user;
  if (!user) return mode === "register" ? "register" : "login";
  if (mode === "register" && user.isAdmin && user.totpEnabled) return "register";
  if (!user.totpEnabled) return "totp";
  return "password";
}

function renderAuthTabs(mode) {
  const user = state.auth.user;
  const loggedIn = Boolean(user);
  const needsTotpBind = loggedIn && !user.totpEnabled;
  const canChangePassword = loggedIn && user.totpEnabled;
  const canCreateUser = loggedIn && user.isAdmin && user.totpEnabled;
  els.authLoginTabBtn.classList.toggle("hidden", loggedIn);
  els.authRegisterTabBtn.classList.toggle("hidden", loggedIn && !canCreateUser);
  els.authRegisterTabBtn.textContent = canCreateUser ? "新增用户" : "注册";
  els.authTotpTabBtn.classList.toggle("hidden", !needsTotpBind);
  els.authPasswordTabBtn.classList.toggle("hidden", !canChangePassword);
  els.authLogoutTabBtn.classList.toggle("hidden", !loggedIn);
  els.authLoginTabBtn.classList.toggle("active", mode === "login");
  els.authRegisterTabBtn.classList.toggle("active", mode === "register");
  els.authTotpTabBtn.classList.toggle("active", mode === "totp");
  els.authPasswordTabBtn.classList.toggle("active", mode === "password");
}

function setAuthMode(mode) {
  const targetMode = getDefaultAuthMode(mode);
  state.auth.authMode = targetMode;
  setAuthMessage("");
  const isLogin = targetMode === "login";
  const isRegister = targetMode === "register";
  const isTotp = targetMode === "totp";
  const isPassword = targetMode === "password";
  els.loginForm.classList.toggle("hidden", !isLogin);
  els.registerForm.classList.toggle("hidden", !isRegister);
  els.totpPanel.classList.toggle("hidden", !isTotp);
  els.passwordForm.classList.toggle("hidden", !isPassword);
  renderAuthTabs(targetMode);
  els.registerSubmitBtn.textContent = state.auth.user?.isAdmin ? "新增用户" : "注册";
  document.getElementById("authModalTitle").textContent = state.auth.user
    ? isRegister ? "新增用户" : "账号设置"
    : isRegister ? "用户注册" : "用户登录";
}

function openAuthModal(mode = "") {
  const targetMode = getDefaultAuthMode(mode);
  setAuthMode(targetMode);
  els.authModal.classList.remove("hidden");
  if (targetMode === "login") els.loginUsernameInput.focus();
  if (targetMode === "register") els.registerUsernameInput.focus();
  if (targetMode === "totp") els.totpConfirmInput.focus();
  if (targetMode === "password") els.oldPasswordInput.focus();
}

function closeAuthModal() {
  els.authModal.classList.add("hidden");
}

async function loadInitialAdminData(options = {}) {
  if (!state.auth.user?.isAdmin && !state.auth.user?.canDevelopApi) {
    // 没有 API 开发权限的账号不加载 API 编辑接口，避免触发开发权限校验。
    state.apis = [];
    state.current = null;
    state.tags = [];
    state.apiTagIds = [];
    state.apiSavedTagIds = [];
    state.searchTagIds = [];
    state.databaseSources = [];
    renderList();
    renderTagControls();
    renderDatabaseOptions(state.defaultDatabaseAlias);
    syncAuthProtectedActions();
    if (!state.auth.user) {
      showStatus("请先登录后继续操作");
    } else if (state.auth.user.canManageAuth) {
      showStatus("当前账号可进入安全管理，不能编辑 API");
    } else {
      showStatus("普通用户");
    }
    return;
  }
  await Promise.all([loadDatabaseSources(), loadTags()]);
  await loadApis(options);
}

async function refreshCurrentUser(options = {}) {
  state.auth.token = loadAuthToken();
  if (!state.auth.token) {
    state.auth.user = null;
    renderAuthState();
    return null;
  }
  try {
    state.auth.user = await request("/admin/security/me");
    renderAuthState();
    return state.auth.user;
  } catch (error) {
    if (options.clearOnFailure !== false) saveAuthToken("");
    state.auth.user = null;
    renderAuthState();
    return null;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  setAuthMessage("");
  setButtonLoading(els.loginSubmitBtn, true, "登录中...");
  try {
    const data = await request("/admin/security/login", {
      method: "POST",
      authRedirect: false,
      body: JSON.stringify({
        username: els.loginUsernameInput.value.trim(),
        password: els.loginPasswordInput.value,
        totpCode: els.loginTotpInput.value.trim()
      })
    });
    saveAuthToken(data.accessToken);
    state.auth.user = data.user;
    renderAuthState();
    setAuthMode();
    closeAuthModal();
    showToast("登录成功");
    showStatus(`已登录 · ${data.user.username}`);
    await loadInitialAdminData({ selectFirst: true });
  } catch (error) {
    setAuthMessage(`登录失败: ${error.message}`);
  } finally {
    setButtonLoading(els.loginSubmitBtn, false);
  }
}

async function submitRegister(event) {
  event.preventDefault();
  const creatingUserAsAdmin = Boolean(state.auth.user?.isAdmin);
  const username = els.registerUsernameInput.value.trim();
  const passwordError = validatePasswordInput(username, els.registerPasswordInput.value);
  if (passwordError) {
    setAuthMessage(passwordError);
    return;
  }
  if (els.registerPasswordInput.value !== els.registerPasswordConfirmInput.value) {
    setAuthMessage("两次输入的密码不一致");
    return;
  }
  setButtonLoading(els.registerSubmitBtn, true, "注册中...");
  try {
    await request("/admin/security/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        displayName: els.registerDisplayNameInput.value.trim(),
        password: els.registerPasswordInput.value
      })
    });
    els.registerPasswordInput.value = "";
    els.registerPasswordConfirmInput.value = "";
    if (creatingUserAsAdmin) {
      els.registerUsernameInput.value = "";
      els.registerDisplayNameInput.value = "";
      setAuthMessage("用户已创建，请通知用户登录后绑定 Authenticator", "success");
      showToast("用户已创建");
    } else {
      els.loginUsernameInput.value = username;
      setAuthMode("login");
      showToast("注册完成，请登录后绑定 Authenticator");
    }
  } catch (error) {
    setAuthMessage(`${creatingUserAsAdmin ? "新增用户" : "注册"}失败: ${error.message}`);
  } finally {
    setButtonLoading(els.registerSubmitBtn, false);
  }
}

async function beginTotpBind() {
  setButtonLoading(els.totpBeginBtn, true, "生成中...");
  try {
    const data = await request("/admin/security/totp/begin", { method: "POST", body: "{}" });
    const secret = String(data.secret || data.secretPreview || "").replace(/\s+/g, "");
    els.totpQrCode.innerHTML = data.qrCodeSvg || "";
    els.totpQrCode.classList.toggle("hidden", !data.qrCodeSvg);
    els.totpSecretValue.textContent = secret || "生成失败";
    els.totpUrlValue.textContent = data.otpauthUrl || "生成失败";
    els.totpSecretCopyBtn.classList.toggle("hidden", !secret);
    els.totpUrlCopyBtn.classList.toggle("hidden", !data.otpauthUrl);
    showToast("绑定密钥已生成");
  } finally {
    setButtonLoading(els.totpBeginBtn, false);
  }
}

async function confirmTotpBind() {
  setButtonLoading(els.totpConfirmBtn, true, "确认中...");
  try {
    await request("/admin/security/totp/confirm", {
      method: "POST",
      body: JSON.stringify({ code: els.totpConfirmInput.value.trim() })
    });
    await refreshCurrentUser();
    setAuthMode();
    setAuthMessage("Authenticator 已绑定", "success");
  } finally {
    setButtonLoading(els.totpConfirmBtn, false);
  }
}

async function submitPasswordChange(event) {
  event.preventDefault();
  const username = state.auth.user?.username || "";
  const passwordError = validatePasswordInput(username, els.newPasswordInput.value);
  if (passwordError) {
    setAuthMessage(passwordError);
    return;
  }
  if (els.newPasswordInput.value !== els.newPasswordConfirmInput.value) {
    setAuthMessage("两次输入的新密码不一致");
    return;
  }
  setButtonLoading(els.passwordSubmitBtn, true, "保存中...");
  try {
    await request("/admin/security/password/change", {
      method: "POST",
      authRedirect: false,
      body: JSON.stringify({
        oldPassword: els.oldPasswordInput.value,
        newPassword: els.newPasswordInput.value,
        totpCode: els.passwordTotpInput.value.trim()
      })
    });
    els.oldPasswordInput.value = "";
    els.newPasswordInput.value = "";
    els.newPasswordConfirmInput.value = "";
    els.passwordTotpInput.value = "";
    const username = state.auth.user?.username || "";
    saveAuthToken("");
    state.auth.user = null;
    renderAuthState();
    setAuthMode("login");
    els.loginUsernameInput.value = username;
    setAuthMessage("密码已修改，请重新登录", "success");
  } catch (error) {
    setAuthMessage(`保存密码失败: ${error.message}`);
  } finally {
    setButtonLoading(els.passwordSubmitBtn, false);
  }
}

async function logout() {
  try {
    if (state.auth.token) await request("/admin/security/logout", { method: "POST", body: "{}" });
  } finally {
    saveAuthToken("");
    state.auth.user = null;
    renderAuthState();
    setAuthMode("login");
    showToast("已退出");
  }
}

function runEditorAction(action) {
  Promise.resolve()
    .then(action)
    .catch((error) => {
      showStatus(`操作失败: ${error.message}`);
      showToast(`操作失败: ${error.message}`, "error");
    });
}

function closeEditorContextMenu() {
  if (!state.editorContextMenu) return;
  state.editorContextMenu.remove();
  state.editorContextMenu = null;
}

function showEditorContextMenu(event, editor, items) {
  closeEditorContextMenu();
  if (!Array.isArray(items) || items.length === 0) return;
  event.preventDefault();

  const menu = document.createElement("div");
  menu.className = "editor-context-menu";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      closeEditorContextMenu();
      runEditorAction(() => item.action(editor));
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const left = Math.min(event.clientX, window.innerWidth - rect.width - 8);
  const top = Math.min(event.clientY, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  state.editorContextMenu = menu;
}

function setupEditorContextMenu(editor, items) {
  // CodeMirror 没有内置业务菜单；这里只在编辑区拦截右键，页面其他位置保留浏览器菜单。
  if (!Array.isArray(items) || items.length === 0) return;
  editor.getWrapperElement().addEventListener("contextmenu", (event) => {
    showEditorContextMenu(event, editor, items);
  });
}

function syncAutoHeightEditor(editor) {
  if (!editor || !editor.getWrapperElement().classList.contains("auto-height-editor")) return;
  const wrapper = editor.getWrapperElement();
  const minHeight = Number(wrapper.dataset.minHeight || 0);
  const scroller = wrapper.querySelector(".CodeMirror-scroll");
  const sizer = wrapper.querySelector(".CodeMirror-sizer");
  if (!scroller || !sizer) return;
  // 先清空固定高度再读内容高度，避免删除行后编辑器无法回缩到最小高度。
  editor.setSize(null, "auto");
  const nextHeight = Math.max(minHeight, sizer.scrollHeight + 12);
  editor.setSize(null, `${nextHeight}px`);
  scroller.style.minHeight = `${minHeight}px`;
}

function setupAutoHeightEditor(editor, minHeight) {
  // SQL/JS 内容经常是完整脚本或长 SQL，按内容展开可避免内部滚动隐藏后续内容。
  const wrapper = editor.getWrapperElement();
  wrapper.classList.add("auto-height-editor");
  wrapper.dataset.minHeight = String(minHeight);
  editor.on("changes", () => {
    window.requestAnimationFrame(() => syncAutoHeightEditor(editor));
  });
  window.requestAnimationFrame(() => syncAutoHeightEditor(editor));
}

function setupEditorContextMenuLifecycle() {
  document.addEventListener("click", closeEditorContextMenu);
  window.addEventListener("resize", closeEditorContextMenu);
  document.addEventListener("scroll", closeEditorContextMenu, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEditorContextMenu();
  });
}

function createCodeMirror(input, options) {
  // 所有编辑器共用基础快捷键和样式，具体语言配置由调用方覆盖。
  const extraKeys = {
    Tab: (editor) => {
      if (editor.somethingSelected()) {
        editor.indentSelection("add");
        return;
      }
      editor.replaceSelection("  ", "end");
    },
    "Shift-Tab": (editor) => editor.indentSelection("subtract"),
    "Ctrl-Space": (editor) => editor.showHint(),
    "Cmd-Space": (editor) => editor.showHint(),
    "Ctrl-S": () => runEditorAction(() => saveApi()),
    "Cmd-S": () => runEditorAction(() => saveApi()),
    "Ctrl-/": (editor) => toggleLineComment(editor, options.lineComment),
    "Cmd-/": (editor) => toggleLineComment(editor, options.lineComment),
    ...(options.extraKeys || {})
  };

  const editor = CodeMirror.fromTextArea(input, {
    theme: "eclipse",
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    smartIndent: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    viewportMargin: Infinity,
    ...options,
    extraKeys
  });
  setupEditorContextMenu(editor, options.contextMenuItems || []);
  return editor;
}

function registerSqlParamMode() {
  // MySQL mode 会把 # 当成注释开头；这里先识别 #{param}，再交回原生 MySQL 高亮。
  CodeMirror.defineMode("ssql-mysql", (config) => {
    const baseMode = CodeMirror.getMode(config, "text/x-mysql");
    const paramPattern = /^#\{\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s*,[^}]*)?\s*\}/;
    const isBaseTokenizer = (state) => state.base && state.base.tokenize && state.base.tokenize.name === "tokenBase";

    return {
      startState: () => ({
        base: CodeMirror.startState(baseMode)
      }),
      copyState: (state) => ({
        base: CodeMirror.copyState(baseMode, state.base)
      }),
      token: (stream, state) => {
        if (isBaseTokenizer(state) && stream.match(paramPattern)) return "variable-3 ssql-param";
        return baseMode.token(stream, state.base);
      },
      indent: (state, textAfter) => baseMode.indent ? baseMode.indent(state.base, textAfter) : CodeMirror.Pass,
      blockCommentStart: baseMode.blockCommentStart,
      blockCommentEnd: baseMode.blockCommentEnd,
      lineComment: baseMode.lineComment,
      closeBrackets: baseMode.closeBrackets
    };
  });

  CodeMirror.defineMode("ssql-mybatis-xml", () => {
    const sqlKeywords = /^(select|from|where|and|or|inner|left|right|join|on|group|by|order|having|limit|top|with|as|case|when|then|else|end|in|is|null|not|like|between|exists|desc|show)\b/i;
    const paramPattern = /^#\{\s*[a-zA-Z_][a-zA-Z0-9_.]*(?:\s*,[^}]*)?\s*\}/;

    return {
      startState: () => ({
        inTag: false,
        inComment: false,
        inCdata: false
      }),
      copyState: (state) => ({ ...state }),
      token: (stream, state) => {
        if (state.inComment) {
          if (stream.skipTo("-->")) {
            stream.match("-->");
            state.inComment = false;
          } else {
            stream.skipToEnd();
          }
          return "comment";
        }

        if (state.inCdata) {
          if (stream.skipTo("]]>")) {
            stream.match("]]>");
            state.inCdata = false;
          } else {
            stream.skipToEnd();
          }
          return null;
        }

        if (stream.match(paramPattern)) return "variable-3 ssql-param";

        if (state.inTag) {
          if (stream.match(/^\s+/)) return null;
          if (stream.match(/^\/?>/)) {
            state.inTag = false;
            return "tag bracket";
          }
          if (stream.match(/^[a-zA-Z_:][a-zA-Z0-9_:.-]*(?=\s*=)/)) return "attribute";
          if (stream.match(/^=/)) return "operator";
          if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
          stream.next();
          return "tag";
        }

        if (stream.match(/^<!--/)) {
          state.inComment = true;
          return "comment";
        }
        if (stream.match(/^<!\[CDATA\[/)) {
          state.inCdata = true;
          return "meta";
        }
        if (stream.match(/^<\/?\s*[a-zA-Z][a-zA-Z0-9_:-]*/)) {
          state.inTag = true;
          return "tag";
        }
        if (stream.match(/^"[^"]*"?/) || stream.match(/^'[^']*'?/)) return "string";
        if (stream.match(/^-?\d+(?:\.\d+)?\b/)) return "number";
        if (stream.match(sqlKeywords)) return "keyword";
        stream.next();
        return null;
      }
    };
  });
}

function applySqlEditorMode() {
  if (!state.editors.sql) return;
  state.editors.sql.setOption("mode", els.sqlModeInput.value === "xml" ? "ssql-mybatis-xml" : "ssql-mysql");
  state.editors.sql.refresh();
  syncAutoHeightEditor(state.editors.sql);
}

function buildHintResult(cursor, prefix, items, fromCh = cursor.ch - prefix.length) {
  const normalized = items.map((item) => typeof item === "string" ? { text: item, displayText: item } : item);
  const list = normalized.filter((item) => {
    const label = item.displayText || item.text || "";
    return label.startsWith(prefix);
  });
  return {
    list,
    from: CodeMirror.Pos(cursor.line, fromCh),
    to: cursor
  };
}

function headerBracketHint(cursor, quote, prefix) {
  // HTTP 头常带短横线，优先补成 headers["content-type"] 这种合法访问形式。
  const items = commonHeaderNames.map((name) => ({
    text: `${name}${quote}]`,
    displayText: name
  }));
  return buildHintResult(cursor, prefix, items);
}

function headerDotHint(cursor, prefix) {
  const items = commonHeaderNames.map((name) => ({
    text: name.includes("-") ? `["${name}"]` : `.${name}`,
    displayText: name
  }));
  return buildHintResult(cursor, prefix, items, cursor.ch - prefix.length - 1);
}

function customFieldHint(editor) {
  // JS 编辑器补全顺序：具体运行时对象路径、示例参数、本地对象字面量、运行时全局变量、原生提示。
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line).slice(0, cursor.ch);
  const resultSetRowMatch = line.match(/resultSets\s*\[\s*\d+\s*\]\.rows\s*\[\s*\d+\s*\]\.([a-zA-Z0-9_]*)$/);
  const resultSetMatch = line.match(/resultSets\s*\[\s*\d+\s*\]\.([a-zA-Z0-9_]*)$/);
  const resultSetsMatch = line.match(/resultSets\.([a-zA-Z0-9_]*)$/);
  const resultArrayMatch = line.match(/(?:resultSets|resultSets\s*\[\s*\d+\s*\]\.(?:rows|fields)|context\.(?:roles|callChain))\.([a-zA-Z0-9_]*)$/);
  const rowMatch = line.match(/(?:rows\s*\[\s*\d+\s*\]|row)\.([a-zA-Z0-9_]*)$/);
  const paramsMatch = line.match(/params\.([a-zA-Z0-9_]*)$/);
  const contextMatch = line.match(/context\.([a-zA-Z0-9_]*)$/);
  const headersBracketMatch = line.match(/headers\[\s*(["'])([^"']*)$/);
  const headersDotMatch = line.match(/headers\.([a-zA-Z0-9_-]*)$/);
  const callApiMatch = line.match(/callApi\.([a-zA-Z0-9_]*)$/);
  const filesMatch = line.match(/files\.([a-zA-Z0-9_]*)$/);
  const wordMatch = line.match(/([a-zA-Z_$][a-zA-Z0-9_$]*)$/);

  if (resultSetRowMatch) {
    return buildHintResult(cursor, resultSetRowMatch[1], state.rowFields);
  }

  if (resultSetMatch) {
    return buildHintResult(cursor, resultSetMatch[1], resultSetHintFields);
  }

  if (resultArrayMatch) {
    return buildHintResult(cursor, resultArrayMatch[1], arrayHintFields);
  }

  if (resultSetsMatch) {
    return buildHintResult(cursor, resultSetsMatch[1], arrayHintFields);
  }

  if (rowMatch) {
    return buildHintResult(cursor, rowMatch[1], state.rowFields);
  }

  if (paramsMatch) {
    return buildHintResult(cursor, paramsMatch[1], getParamFields());
  }

  if (contextMatch) {
    return buildHintResult(cursor, contextMatch[1], contextHintFields);
  }

  if (headersBracketMatch) {
    return headerBracketHint(cursor, headersBracketMatch[1], headersBracketMatch[2]);
  }

  if (headersDotMatch) {
    return headerDotHint(cursor, headersDotMatch[1]);
  }

  if (callApiMatch) {
    return buildHintResult(cursor, callApiMatch[1], ["get", "post", "tryGet", "tryPost"]);
  }

  if (filesMatch) {
    return buildHintResult(cursor, filesMatch[1], ["inspectUrl", "downloadTemp", "tryInspectUrl", "tryDownloadTemp"]);
  }

  const objectHint = localObjectPropertyHint(editor, cursor, line);
  if (objectHint) return objectHint;

  if (wordMatch) {
    const prefix = wordMatch[1];
    const globals = ["params", "rows", "resultSets", "row", "headers", "context", "callApi", "files"];
    const list = globals.filter((item) => item.startsWith(prefix));
    if (list.length > 0) {
      return {
        list,
        from: CodeMirror.Pos(cursor.line, cursor.ch - prefix.length),
        to: cursor
      };
    }
  }

  return CodeMirror.hint.javascript(editor);
}

function maybeShowScriptHint(editor, change) {
  // 输入标识符字符时自动弹出提示；点号由 extraKeys 单独处理。
  const text = change.text.join("");
  if (!/^[a-zA-Z0-9_$]$/.test(text)) return;
  if (editor.state.completionActive) return;
  setTimeout(() => editor.showHint({ completeSingle: false }), 0);
}

function syncCurrentScriptDraft() {
  if (!state.editors.script) return;
  state.scriptDrafts[state.scriptType] = state.editors.script.getValue();
}

function setScriptType(type) {
  syncCurrentScriptDraft();
  state.scriptType = type === "params" ? "params" : "result";
  els.scriptTypeInput.value = state.scriptType;
  state.editors.script.setValue(state.scriptDrafts[state.scriptType] || "");
  state.editors.script.refresh();
  syncAutoHeightEditor(state.editors.script);
}

function setupEditors() {
  // 三个 textarea 替换为 CodeMirror，并分别启用 JSON、SQL、JavaScript 模式。
  registerSqlParamMode();

  state.editors.params = createCodeMirror(els.paramsInput, {
    mode: {
      name: "javascript",
      json: true
    },
    contextMenuItems: [
      {
        label: "格式化 JSON",
        action: (editor) => formatEditor(editor, formatJsonRemoteEditor)
      }
    ]
  });
  state.editors.params.on("change", () => updateParamsEditorValidity());

  state.editors.sql = createCodeMirror(els.sqlInput, {
    mode: "ssql-mysql",
    lineComment: "-- ",
    contextMenuItems: [
      {
        label: "格式化 SQL",
        action: (editor) => formatEditor(editor, formatSqlAutoEditor)
      }
    ],
    hintOptions: {
      disableKeywords: false
    },
    extraKeys: {
      "Ctrl-Enter": () => runEditorAction(runSql),
      "Cmd-Enter": () => runEditorAction(runSql)
    }
  });
  setupAutoHeightEditor(state.editors.sql, 240);
  els.sqlModeInput.addEventListener("change", () => {
    applySqlEditorMode();
    syncAutoHeightEditor(state.editors.sql);
    showStatus(els.sqlModeInput.value === "xml" ? "SQL 输入模式: MyBatis XML" : "SQL 输入模式: 原生 SQL");
  });

  state.editors.script = createCodeMirror(els.scriptInput, {
    mode: "javascript",
    lineComment: "// ",
    contextMenuItems: [
      {
        label: "格式化 JS",
        action: (editor) => formatEditor(editor, formatScriptRemoteEditor)
      }
    ],
    hintOptions: {
      hint: customFieldHint
    },
    extraKeys: {
      "Ctrl-Enter": () => runEditorAction(runScriptTest),
      "Cmd-Enter": () => runEditorAction(runScriptTest),
      ".": (editor) => {
        editor.replaceSelection(".", "end");
        setTimeout(() => editor.showHint({ completeSingle: false }), 0);
      }
    }
  });
  setupAutoHeightEditor(state.editors.script, 300);
  state.editors.script.on("inputRead", maybeShowScriptHint);
  els.scriptTypeInput.addEventListener("change", () => {
    setScriptType(els.scriptTypeInput.value);
    showStatus(state.scriptType === "params" ? "JS 处理类型: 参数处理" : "JS 处理类型: 结果集处理");
  });
  updateParamsEditorValidity();
}

function readForm() {
  // 保存前从普通输入框和 CodeMirror 中读取完整 API 定义。
  syncCurrentScriptDraft();
  return {
    name: els.nameInput.value.trim(),
    path: els.pathInput.value.trim(),
    method: els.methodInput.value,
    databaseAlias: els.databaseAliasInput.value || getDefaultDatabaseAlias(),
    sqlTimeoutMs: timeoutSecondsToMs(els.sqlTimeoutInput.value, 5),
    scriptTimeoutMs: timeoutSecondsToMs(els.scriptTimeoutInput.value, 1),
    tagIds: state.apiTagIds,
    description: els.descriptionInput.value.trim(),
    testParams: readParamsEditor(),
    sqlMode: els.sqlModeInput.value,
    sqlText: state.editors.sql.getValue(),
    paramScriptText: state.scriptDrafts.params,
    scriptText: state.scriptDrafts.result,
    scriptCapabilities: readScriptCapabilities()
  };
}

function fillForm(api, options = {}) {
  // 切换 API 或保存后，用服务端返回的数据回填表单，保持前后端状态一致。
  const previousApiId = state.current && state.current.id;
  const previousScriptType = state.scriptType;
  const keepScriptType = Boolean(options.keepScriptType) || Boolean(previousApiId && api.id && previousApiId === api.id);
  state.current = api;
  els.pageTitle.textContent = api.id ? api.name || "未命名 API" : "新建 API";
  els.statusText.textContent = api.id ? `${api.method} ${api.path} · ${api.status}` : "填写配置后保存";
  els.statusBadge.textContent = formatStatus(api.status);
  els.statusBadge.className = `status-badge status-${api.status || "draft"}`;
  renderStatusToggle(api);
  applyApiInfoCollapsed(api);
  els.nameInput.value = api.name || "";
  els.pathInput.value = api.path || "/api/";
  els.methodInput.value = api.method || "GET";
  renderDatabaseOptions(api.databaseAlias || getDefaultDatabaseAlias());
  els.sqlTimeoutInput.value = String(timeoutMsToSeconds(api.sqlTimeoutMs, 5000));
  els.scriptTimeoutInput.value = String(timeoutMsToSeconds(api.scriptTimeoutMs, 1000));
  state.apiSavedTagIds = normalizeTagIds(api.tagIds || api.tags || []);
  state.apiTagIds = [...state.apiSavedTagIds];
  renderTagControls(state.apiTagIds);
  fillScriptCapabilities(api.scriptCapabilities);
  els.descriptionInput.value = api.description || "";
  state.editors.params.setValue(JSON.stringify(api.testParams || {}, null, 2));
  state.editors.sql.setValue(api.sqlText || "");
  applySqlMode(api);
  state.scriptDrafts = {
    params: api.paramScriptText ?? defaultParamScript,
    result: api.scriptText || defaultResultScript
  };
  state.scriptType = keepScriptType && previousScriptType === "params" ? "params" : "result";
  els.scriptTypeInput.value = state.scriptType;
  state.editors.script.setValue(state.scriptDrafts[state.scriptType]);
  state.editors.params.refresh();
  state.editors.sql.refresh();
  state.editors.script.refresh();
  syncAutoHeightEditor(state.editors.sql);
  syncAutoHeightEditor(state.editors.script);
  applyCachedSqlResult(api);
  syncAuthProtectedActions();
}

function renderStatusToggle(api) {
  const status = api && api.status || "draft";
  const shouldDisable = status === "published";
  els.statusToggleBtn.textContent = shouldDisable ? "停用" : "发布";
  els.statusToggleBtn.classList.toggle("primary", !shouldDisable);
}

function renderList() {
  // 左侧列表只渲染当前分页数据，点击条目后加载完整 API 配置。
  els.apiList.innerHTML = "";
  if (state.apis.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的 API";
    els.apiList.appendChild(empty);
  }
  for (const api of state.apis) {
    const active = state.current && state.current.id === api.id;
    const item = document.createElement("div");
    item.className = `api-item${active ? " active" : ""}`;
    const meta = document.createElement("div");
    meta.className = "api-item-meta";
    const method = document.createElement("span");
    method.className = "method-badge";
    method.textContent = api.method || "GET";
    const status = document.createElement("span");
    status.className = `status-dot status-${api.status || "draft"}`;
    status.textContent = formatStatus(api.status);
    meta.append(method, status);

    const name = document.createElement("strong");
    name.textContent = api.name || "未命名 API";

    const path = document.createElement("span");
    path.className = "api-path";
    path.textContent = api.path || "/api/";

    const tags = document.createElement("div");
    tags.className = "api-item-tags";
    for (const tag of api.tags || []) {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.textContent = tag.name;
      tags.appendChild(chip);
    }

    const children = [meta, name, path];
    if (tags.childNodes.length > 0) children.push(tags);
    if (active) {
      const description = document.createElement("span");
      description.className = "api-description";
      description.textContent = api.description || "暂无说明";
      children.push(description);
    }

    item.append(...children);
    item.addEventListener("click", () => loadApi(api.id));
    els.apiList.appendChild(item);
  }
  els.pageInfo.textContent = `${state.list.page} / ${state.list.totalPages} · 共 ${state.list.total}`;
  els.prevPageBtn.disabled = state.list.page <= 1;
  els.nextPageBtn.disabled = state.list.page >= state.list.totalPages;
  syncAuthProtectedActions();
}

function buildApiListPath() {
  // 把列表筛选和分页状态序列化成管理端查询参数。
  const params = new URLSearchParams({
    page: String(state.list.page),
    pageSize: String(state.list.pageSize)
  });
  if (state.list.name) params.set("name", state.list.name);
  if (state.list.sql) params.set("sql", state.list.sql);
  if (state.list.tagIds.length > 0) params.set("tagIds", state.list.tagIds.join(","));
  return `/admin/apis?${params.toString()}`;
}

async function loadApis(options = {}) {
  // 兼容早期数组返回和当前分页对象返回，便于后端接口平滑演进。
  const data = await request(buildApiListPath());
  if (Array.isArray(data)) {
    state.apis = data;
    state.list.total = data.length;
    state.list.page = 1;
    state.list.totalPages = 1;
  } else {
    state.apis = Array.isArray(data.items) ? data.items : [];
    state.list.total = Number(data.total || 0);
    state.list.page = Number(data.page || state.list.page);
    state.list.pageSize = Number(data.pageSize || state.list.pageSize);
    state.list.totalPages = Number(data.totalPages || 1);
  }
  renderList();
  if ((options.selectFirst || !state.current) && state.apis.length > 0) {
    await loadApi(state.apis[0].id);
  }
}

async function loadApi(id) {
  const api = await request(`/admin/apis/${id}`);
  fillForm(api);
  renderList();
}

async function loadDatabaseSources() {
  const data = await request("/admin/database-sources");
  state.defaultDatabaseAlias = data.defaultAlias || "default";
  state.databaseSources = Array.isArray(data.items) ? data.items : [];
  renderDatabaseOptions(state.current?.databaseAlias || state.defaultDatabaseAlias);
}

async function saveApi(options = {}) {
  // 已有 id 时更新，否则创建新 API；保存后刷新列表以同步排序和分页信息。
  assertCurrentApiPermission("edit");
  const notify = options.notify !== false;
  setSaveLoading(true);
  showStatus("保存中...");
  try {
    const payload = readForm();
    const api = state.current && state.current.id
      ? await request(`/admin/apis/${state.current.id}`, { method: "PUT", body: JSON.stringify(payload) })
      : await request("/admin/apis", { method: "POST", body: JSON.stringify(payload) });
    fillForm(api, { keepScriptType: true });
    await loadApis();
    if (notify) {
      showStatus(`保存完成 · ${api.method} ${api.path} · ${api.status}`);
      showToast("保存完成");
    }
    return api;
  } catch (error) {
    if (notify) {
      showStatus(`保存失败: ${error.message}`);
      showToast(`保存失败: ${error.message}`, "error");
      return null;
    }
    throw error;
  } finally {
    setSaveLoading(false);
  }
}

async function runSql() {
  // 测试 SQL 前先保存当前 API，确保后端测试使用的是最新配置。
  assertCurrentApiPermission("test");
  const controller = beginTestRun("sql");
  if (!controller) return;
  let params = {};
  try {
    params = readParamsEditor();
  } catch (error) {
    showStatus(`示例参数 JSON 无效: ${error.message}`);
    finishTestRun("sql", controller);
    return;
  }

  try {
    const canPersistBeforeTest = !state.current?.id || getCurrentDeveloperPermission().canEdit;
    const api = canPersistBeforeTest ? await saveApi({ notify: false }) : state.current;
    if (controller.signal.aborted) {
      showLog("SQL 测试已中断");
      showStatus("SQL 测试已中断");
      return;
    }
    if (!canPersistBeforeTest) showStatus("当前账号没有编辑权限，SQL 测试使用已保存配置");
    showLog("SQL 测试中...");
    const data = await request(`/admin/apis/${api.id}/test-sql`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ params })
    });
    const fields = Array.isArray(data.fields) && data.fields.length > 0
      ? [...new Set(data.fields)].sort()
      : collectRowFields(data.rows || []);
    updateRowFields(fields);
    const logData = {
      params: data.params,
      processedParams: data.processedParams,
      paramScriptResult: data.paramScriptResult,
      directReturn: Boolean(data.directReturn),
      total: data.total,
      rowFields: fields,
      rows: data.rows,
      resultSets: data.resultSets || []
    };
    saveCachedSqlResult(api, logData);
    showLog(buildSqlTestDisplay(data));
    if (data.directReturn) {
      showStatus("参数处理脚本已直接返回，未测试 SQL");
    } else {
      showStatus(`SQL 测试完成 · ${data.total} 行 · rows ${fields.length} 个字段`);
    }
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      showLog("SQL 测试已中断");
      showStatus("SQL 测试已中断");
      return;
    }
    throw error;
  } finally {
    finishTestRun("sql", controller);
  }
}

async function runScriptTest() {
  // JS 测试复用真实链路：先执行参数处理，再准备 SQL 结果，最后执行结果集处理脚本。
  assertCurrentApiPermission("test");
  const controller = beginTestRun("script");
  if (!controller) return;
  let params = {};
  try {
    params = readParamsEditor();
  } catch (error) {
    showStatus(`示例参数 JSON 无效: ${error.message}`);
    finishTestRun("script", controller);
    return;
  }

  try {
    const canPersistBeforeTest = !state.current?.id || getCurrentDeveloperPermission().canEdit;
    const api = canPersistBeforeTest ? await saveApi({ notify: false }) : state.current;
    if (controller.signal.aborted) {
      showLog("JS 测试已中断");
      showStatus("JS 测试已中断");
      return;
    }
    if (!canPersistBeforeTest) showStatus("当前账号没有编辑权限，JS 测试使用已保存配置");
    showLog("JS 测试中...");
    const data = await request(`/admin/apis/${api.id}/test-script`, {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ params })
    });
    const resultSets = data.resultSets || [];
    const fields = Array.isArray(resultSets[0]?.fields) && resultSets[0].fields.length > 0
      ? [...new Set(resultSets[0].fields)].sort()
      : collectRowFields(data.rows || []);
    updateRowFields(fields);
    const logData = {
      params: data.params,
      processedParams: data.processedParams,
      paramScriptResult: data.paramScriptResult,
      directReturn: Boolean(data.directReturn),
      rowFields: fields,
      rows: data.rows || [],
      resultSets,
      result: data.result
    };
    if (!data.directReturn) saveCachedSqlResult(api, logData);
    showLog(data.result);
    showStatus(data.directReturn ? "参数处理脚本已直接返回" : `JS 测试完成 · rows ${fields.length} 个字段`);
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      showLog("JS 测试已中断");
      showStatus("JS 测试已中断");
      return;
    }
    throw error;
  } finally {
    finishTestRun("script", controller);
  }
}

async function publishApi() {
  // 发布会先保存草稿，再切换状态，避免遗漏编辑器中的未保存修改。
  assertCurrentApiPermission("publish");
  const canPersistBeforePublish = getCurrentDeveloperPermission().canEdit;
  const api = canPersistBeforePublish ? await saveApi({ notify: false }) : state.current;
  if (!api?.id) throw new Error("请先保存 API 后再发布");
  const published = await request(`/admin/apis/${api.id}/publish`, { method: "POST", body: "{}" });
  fillForm(published);
  await loadApis();
  showStatus(`已发布 · ${published.method} ${published.path}`);
  showToast("发布完成");
}

async function disableApi() {
  assertCurrentApiPermission("publish");
  if (!state.current || !state.current.id) return;
  const api = await request(`/admin/apis/${state.current.id}/disable`, { method: "POST", body: "{}" });
  fillForm(api);
  await loadApis();
  showStatus(`已停用 · ${api.method} ${api.path}`);
  showToast("停用完成");
}

async function toggleApiStatus() {
  const status = state.current && state.current.status || "draft";
  const shouldDisable = status === "published";
  const actionText = shouldDisable ? "停用" : "发布";
  const targetText = shouldDisable ? "停用后外部请求将无法调用该 API。" : "发布前会先保存当前编辑内容。";
  // 状态切换会影响运行时访问，因此在真正调用后端前让用户确认一次。
  if (!window.confirm(`确定要${actionText}当前 API 吗？\n${targetText}`)) return;
  if (shouldDisable) {
    await disableApi();
    return;
  }
  await publishApi();
}

function bind(id, fn) {
  // 所有按钮操作统一捕获错误并显示到顶部状态区。
  id.addEventListener("click", async () => {
    try {
      await fn();
    } catch (error) {
      showStatus(`操作失败: ${error.message}`);
      showToast(`操作失败: ${error.message}`, "error");
    }
  });
}

function setupCapabilityModal() {
  els.capabilityOpenBtn.addEventListener("click", openCapabilityModal);
  els.capabilityCloseBtn.addEventListener("click", () => closeCapabilityModal({ restore: true }));
  els.capabilityCancelBtn.addEventListener("click", () => closeCapabilityModal({ restore: true }));
  els.capabilityApplyBtn.addEventListener("click", () => {
    renderScriptCapabilitySummary();
    closeCapabilityModal();
    showToast("脚本能力已更新");
  });
  els.capabilityModal.addEventListener("click", (event) => {
    if (event.target === els.capabilityModal) closeCapabilityModal({ restore: true });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.capabilityModal.classList.contains("hidden")) {
      closeCapabilityModal({ restore: true });
    }
  });
}

function openTagModal() {
  renderTagManageList();
  els.tagModal.classList.remove("hidden");
  els.tagNameInput.focus();
}

function closeTagModal() {
  els.tagModal.classList.add("hidden");
  els.tagNameInput.value = "";
}

function openTagSelectModal(mode = "api") {
  state.tagSelectMode = mode === "search" ? "search" : "api";
  const selectedIds = state.tagSelectMode === "search" ? state.searchTagIds : state.apiTagIds;
  const title = state.tagSelectMode === "search" ? "选择筛选标签" : "选择 API 标签";
  document.getElementById("tagSelectModalTitle").textContent = title;
  renderTagChoices(els.tagSelectList, "tagSelect", selectedIds, "暂无标签，可先到标签管理新增");
  els.tagSelectModal.classList.remove("hidden");
}

function closeTagSelectModal() {
  els.tagSelectModal.classList.add("hidden");
}

function applyTagSelection() {
  const selectedIds = readCheckedTagIds("tagSelect");
  if (state.tagSelectMode === "search") {
    state.searchTagIds = selectedIds;
    renderSearchTagSummary(state.searchTagIds);
    showStatus("筛选标签已更新，点击查找后生效");
  } else {
    state.apiTagIds = selectedIds;
    renderApiTagSummary(state.apiTagIds);
    showStatus("API 标签选择已更新，保存后生效");
  }
  closeTagSelectModal();
}

async function createTag(event) {
  event.preventDefault();
  const name = els.tagNameInput.value.trim();
  if (!name) {
    showToast("标签名称不能为空", "error");
    return;
  }

  setButtonLoading(els.tagAddBtn, true, "新增中...");
  try {
    await request("/admin/tags", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    els.tagNameInput.value = "";
    await loadTags();
    showToast("标签已新增");
  } finally {
    setButtonLoading(els.tagAddBtn, false);
  }
}

function setupTags() {
  els.apiTagSelectBtn.addEventListener("click", () => openTagSelectModal("api"));
  els.searchTagSelectBtn.addEventListener("click", () => openTagSelectModal("search"));
  els.tagSelectCloseBtn.addEventListener("click", closeTagSelectModal);
  els.tagSelectCancelBtn.addEventListener("click", closeTagSelectModal);
  els.tagSelectApplyBtn.addEventListener("click", applyTagSelection);
  els.tagManageBtn.addEventListener("click", openTagModal);
  els.tagCloseBtn.addEventListener("click", closeTagModal);
  els.tagDoneBtn.addEventListener("click", closeTagModal);
  els.tagCreateForm.addEventListener("submit", (event) => {
    runEditorAction(() => createTag(event));
  });
  els.tagModal.addEventListener("click", (event) => {
    if (event.target === els.tagModal) closeTagModal();
  });
  els.tagSelectModal.addEventListener("click", (event) => {
    if (event.target === els.tagSelectModal) closeTagSelectModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.tagSelectModal.classList.contains("hidden")) {
      closeTagSelectModal();
      return;
    }
    if (event.key === "Escape" && !els.tagModal.classList.contains("hidden")) {
      closeTagModal();
    }
  });
}

function setupApiInfoCollapse() {
  els.apiInfoToggleBtn.addEventListener("click", () => {
    const collapsed = !isApiInfoCollapsed();
    setApiInfoCollapsed(collapsed);
    showStatus(collapsed ? "接口信息已隐藏" : "接口信息已显示");
  });
}

function setupHelp() {
  setSqlHelpType("raw");
  els.sqlHelpBtn.addEventListener("click", () => {
    els.sqlHelpBox.classList.toggle("hidden");
  });
  els.sqlHelpCloseBtn.addEventListener("click", () => {
    els.sqlHelpBox.classList.add("hidden");
  });
  els.rawSqlHelpBtn.addEventListener("click", () => setSqlHelpType("raw"));
  els.xmlSqlHelpBtn.addEventListener("click", () => setSqlHelpType("xml"));
  els.scriptHelpBtn.addEventListener("click", () => {
    els.scriptHelpBox.classList.toggle("hidden");
  });
  els.scriptHelpCloseBtn.addEventListener("click", () => {
    els.scriptHelpBox.classList.add("hidden");
  });
}

function setupSecurity() {
  els.authOpenBtn.addEventListener("click", () => openAuthModal());
  els.authCloseBtn.addEventListener("click", closeAuthModal);
  els.authLoginTabBtn.addEventListener("click", () => setAuthMode("login"));
  els.authRegisterTabBtn.addEventListener("click", () => setAuthMode("register"));
  els.authTotpTabBtn.addEventListener("click", () => setAuthMode("totp"));
  els.authPasswordTabBtn.addEventListener("click", () => setAuthMode("password"));
  els.authLogoutTabBtn.addEventListener("click", () => runEditorAction(logout));
  els.loginForm.addEventListener("submit", (event) => runEditorAction(() => submitLogin(event)));
  els.registerForm.addEventListener("submit", (event) => runEditorAction(() => submitRegister(event)));
  els.totpBeginBtn.addEventListener("click", () => runEditorAction(beginTotpBind));
  els.totpSecretCopyBtn.addEventListener("click", () => runEditorAction(() => copyText(els.totpSecretValue.textContent)));
  els.totpUrlCopyBtn.addEventListener("click", () => runEditorAction(() => copyText(els.totpUrlValue.textContent)));
  els.totpConfirmBtn.addEventListener("click", () => runEditorAction(confirmTotpBind));
  els.passwordForm.addEventListener("submit", (event) => runEditorAction(() => submitPasswordChange(event)));
  bindCapsLockWarning([els.loginPasswordInput], els.loginCapsLockWarning);
  bindCapsLockWarning([els.registerPasswordInput, els.registerPasswordConfirmInput], els.registerCapsLockWarning);
  bindCapsLockWarning([els.oldPasswordInput, els.newPasswordInput, els.newPasswordConfirmInput], els.passwordCapsLockWarning);
  els.securityOpenBtn.addEventListener("click", () => {
    window.location.href = getLocalPageUrl("/security.html");
  });
}

els.newApiBtn.addEventListener("click", () => {
  if (!canCreateApi()) {
    showToast(permissionDeniedMessage("edit"), "error");
    return;
  }
  fillForm({
    name: "",
    path: "/api/",
    method: "GET",
    databaseAlias: getDefaultDatabaseAlias(),
    sqlTimeoutMs: 5000,
    scriptTimeoutMs: 1000,
    scriptCapabilities: [],
    tagIds: [],
    tags: [],
    status: "draft",
    testParams: {},
    sqlMode: "sql",
    sqlText: "",
    paramScriptText: defaultParamScript,
    scriptText: defaultResultScript
  });
  renderList();
});

els.apiSearchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.list.name = els.nameSearchInput.value.trim();
  state.list.sql = els.sqlSearchInput.value.trim();
  state.list.tagIds = [...state.searchTagIds];
  state.list.pageSize = Number(els.pageSizeInput.value) || 20;
  state.list.page = 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

els.resetSearchBtn.addEventListener("click", async () => {
  els.nameSearchInput.value = "";
  els.sqlSearchInput.value = "";
  els.pageSizeInput.value = "20";
  state.list.name = "";
  state.list.sql = "";
  state.list.tagIds = [];
  state.searchTagIds = [];
  state.list.pageSize = 20;
  state.list.page = 1;
  state.current = null;
  renderTagControls(state.current?.tagIds || []);
  await loadApis({ selectFirst: true });
});

els.pageSizeInput.addEventListener("change", async () => {
  state.list.pageSize = Number(els.pageSizeInput.value) || 20;
  state.list.page = 1;
  await loadApis({ selectFirst: true });
});

els.prevPageBtn.addEventListener("click", async () => {
  if (state.list.page <= 1) return;
  state.list.page -= 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

els.nextPageBtn.addEventListener("click", async () => {
  if (state.list.page >= state.list.totalPages) return;
  state.list.page += 1;
  state.current = null;
  await loadApis({ selectFirst: true });
});

setupEditors();
setupHelp();
setupTags();
setupCapabilityModal();
setupApiInfoCollapse();
setupSecurity();
setupEditorContextMenuLifecycle();

bind(els.saveBtn, saveApi);
bind(els.statusToggleBtn, toggleApiStatus);
bind(els.runSqlBtn, runSql);
bind(els.abortSqlBtn, () => abortTestRun("sql"));
bind(els.runScriptBtn, runScriptTest);
bind(els.abortScriptBtn, () => abortTestRun("script"));

async function bootstrap() {
  renderAuthState();
  const user = await refreshCurrentUser({ clearOnFailure: true });
  if (!user) {
    showStatus("请先登录后继续操作");
    openAuthModal("login");
    return;
  }
  try {
    await loadInitialAdminData();
  } catch (error) {
    const message = error.statusCode === 401 ? "请先登录后继续操作" : `加载失败: ${error.message}`;
    showStatus(message);
    if (error.statusCode === 401) openAuthModal("login");
  }
}

bootstrap();
