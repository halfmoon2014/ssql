const authTokenKey = "ssql.security.token";

const state = {
  user: null,
  tab: "users",
  users: [],
  apis: [],
  userApiIds: [],
  developerPermissions: [],
  selectedUserId: "",
  selectedDeveloperUserId: "",
  selectedApiId: "",
  toastTimer: null
};

function getAppBasePath() {
  // 支持被反向代理挂到子路径时，静态资源和 /admin/* 请求仍走同一个前缀。
  const script = document.currentScript || document.querySelector('script[src$="security.js"]');
  if (!script) return "";
  const scriptPath = new URL(script.getAttribute("src"), window.location.href).pathname;
  return scriptPath.endsWith("/security.js") ? scriptPath.slice(0, -"/security.js".length) : "";
}

const appBasePath = getAppBasePath();

const els = {
  securityStatusText: document.getElementById("securityStatusText"),
  securityCurrentUser: document.getElementById("securityCurrentUser"),
  backToAdminBtn: document.getElementById("backToAdminBtn"),
  securityGateMessage: document.getElementById("securityGateMessage"),
  toast: document.getElementById("toast"),
  securityUsersPanel: document.getElementById("securityUsersPanel"),
  securityPermissionsPanel: document.getElementById("securityPermissionsPanel"),
  securityDevelopersPanel: document.getElementById("securityDevelopersPanel"),
  securityApiIpPanel: document.getElementById("securityApiIpPanel"),
  securityAdminIpPanel: document.getElementById("securityAdminIpPanel"),
  securityAuditPanel: document.getElementById("securityAuditPanel"),
  securityRefreshUsersBtn: document.getElementById("securityRefreshUsersBtn"),
  securityUsersList: document.getElementById("securityUsersList"),
  permissionUserSelect: document.getElementById("permissionUserSelect"),
  permissionApiFilterInput: document.getElementById("permissionApiFilterInput"),
  permissionApiList: document.getElementById("permissionApiList"),
  permissionSaveBtn: document.getElementById("permissionSaveBtn"),
  developerUserSelect: document.getElementById("developerUserSelect"),
  developerApiFilterInput: document.getElementById("developerApiFilterInput"),
  developerApiList: document.getElementById("developerApiList"),
  developerSaveBtn: document.getElementById("developerSaveBtn"),
  apiIpApiSelect: document.getElementById("apiIpApiSelect"),
  apiIpLoadBtn: document.getElementById("apiIpLoadBtn"),
  apiIpRulesInput: document.getElementById("apiIpRulesInput"),
  apiIpSaveBtn: document.getElementById("apiIpSaveBtn"),
  adminIpRulesInput: document.getElementById("adminIpRulesInput"),
  adminIpLoadBtn: document.getElementById("adminIpLoadBtn"),
  adminIpSaveBtn: document.getElementById("adminIpSaveBtn"),
  auditRefreshBtn: document.getElementById("auditRefreshBtn"),
  auditLogList: document.getElementById("auditLogList")
};

function withBase(path) {
  const requestPath = path.startsWith("/") ? path : `/${path}`;
  return `${appBasePath}${requestPath}`;
}

function loadAuthToken() {
  try {
    return localStorage.getItem(authTokenKey) || "";
  } catch (error) {
    return "";
  }
}

function saveAuthToken(token) {
  try {
    if (token) localStorage.setItem(authTokenKey, token);
    else localStorage.removeItem(authTokenKey);
  } catch (error) {
    showStatus(`登录状态保存失败: ${error.message}`);
  }
}

function showStatus(message) {
  els.securityStatusText.textContent = message;
}

function showGateMessage(message = "") {
  els.securityGateMessage.textContent = message;
  els.securityGateMessage.classList.toggle("hidden", !message);
}

function setManagementVisible(visible) {
  document.querySelector(".security-tabs").classList.toggle("hidden", !visible);
  for (const panel of [
    els.securityUsersPanel,
    els.securityPermissionsPanel,
    els.securityDevelopersPanel,
    els.securityApiIpPanel,
    els.securityAdminIpPanel,
    els.securityAuditPanel
  ]) {
    panel.classList.toggle("hidden", !visible || panel.id !== "securityUsersPanel");
  }
}

function showToast(message, type = "success") {
  if (state.toastTimer) clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast${type === "error" ? " error" : ""}`;
  state.toastTimer = setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 2600);
}

function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = Boolean(loading);
  button.textContent = loading && text ? text : button.dataset.defaultText;
}

async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options;
  const token = loadAuthToken();
  const response = await fetch(withBase(path), {
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
    if (response.status === 401) saveAuthToken("");
    throw error;
  }
  return data.data;
}

function runPageAction(action) {
  Promise.resolve()
    .then(action)
    .catch((error) => {
      showStatus(`操作失败: ${error.message}`);
      showToast(`操作失败: ${error.message}`, "error");
    });
}

function setSecurityTab(tab) {
  const targetTab = tab === "developers" && !state.user?.isAdmin ? "users" : tab;
  state.tab = targetTab;
  for (const button of document.querySelectorAll("[data-security-tab]")) {
    if (button.dataset.securityTab === "developers") button.classList.toggle("hidden", !state.user?.isAdmin);
    button.classList.toggle("active", button.dataset.securityTab === targetTab);
  }
  els.securityUsersPanel.classList.toggle("hidden", targetTab !== "users");
  els.securityPermissionsPanel.classList.toggle("hidden", targetTab !== "permissions");
  els.securityDevelopersPanel.classList.toggle("hidden", targetTab !== "developers");
  els.securityApiIpPanel.classList.toggle("hidden", targetTab !== "apiIp");
  els.securityAdminIpPanel.classList.toggle("hidden", targetTab !== "adminIp");
  els.securityAuditPanel.classList.toggle("hidden", targetTab !== "audit");
}

function formatApiLabel(api) {
  return `${api.method || "GET"} ${api.path || ""} · ${api.name || "未命名 API"}`;
}

function renderSecurityUsers() {
  els.securityUsersList.innerHTML = "";
  if (state.users.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "暂无用户";
    els.securityUsersList.appendChild(empty);
    return;
  }

  for (const user of state.users) {
    const row = document.createElement("div");
    row.className = "security-row";
    row.dataset.userId = user.id;

    const name = document.createElement("div");
    const main = document.createElement("div");
    main.className = "security-main-text";
    main.textContent = user.username;
    const sub = document.createElement("div");
    sub.className = "security-sub-text";
    sub.textContent = user.displayName || "未设置显示名";
    name.append(main, sub);

    const status = document.createElement("select");
    status.name = "status";
    status.disabled = !state.user?.isAdmin;
    for (const value of ["active", "disabled", "locked"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      status.appendChild(option);
    }
    status.value = user.status || "active";

    const adminLabel = document.createElement("label");
    adminLabel.className = "security-inline-check";
    const admin = document.createElement("input");
    admin.type = "checkbox";
    admin.name = "isAdmin";
    admin.checked = Boolean(user.isAdmin);
    admin.disabled = !state.user?.isAdmin;
    adminLabel.append(admin, document.createTextNode("管理员"));

    const authLabel = document.createElement("label");
    authLabel.className = "security-inline-check";
    const manageAuth = document.createElement("input");
    manageAuth.type = "checkbox";
    manageAuth.name = "canManageAuth";
    manageAuth.checked = Boolean(user.canManageAuth);
    manageAuth.disabled = !state.user?.isAdmin;
    authLabel.append(manageAuth, document.createTextNode("授权"));

    const developerLabel = document.createElement("label");
    developerLabel.className = "security-inline-check";
    const developApi = document.createElement("input");
    developApi.type = "checkbox";
    developApi.name = "canDevelopApi";
    developApi.checked = Boolean(user.canDevelopApi);
    developApi.disabled = !state.user?.isAdmin;
    developerLabel.append(developApi, document.createTextNode("开发"));

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "保存";
    save.disabled = !state.user?.isAdmin;
    save.title = state.user?.isAdmin ? "" : "只有系统管理员可以修改用户状态和管理权限";
    save.addEventListener("click", () => runPageAction(() => saveSecurityUser(row, save)));

    const revokeSessions = document.createElement("button");
    revokeSessions.type = "button";
    revokeSessions.textContent = "踢下线";
    revokeSessions.disabled = !state.user?.isAdmin || user.id === state.user?.id;
    revokeSessions.title = !state.user?.isAdmin
      ? "只有系统管理员可以踢下线"
      : user.id === state.user?.id ? "不能踢当前登录账号" : "撤销该用户所有 token";
    revokeSessions.addEventListener("click", () => runPageAction(() => revokeSecurityUserSessions(row, revokeSessions)));

    row.append(name, status, adminLabel, authLabel, developerLabel, save, revokeSessions);
    els.securityUsersList.appendChild(row);
  }
}

function renderPermissionUsers() {
  els.permissionUserSelect.innerHTML = "";
  for (const user of state.users) {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.username}${user.displayName ? ` · ${user.displayName}` : ""}`;
    els.permissionUserSelect.appendChild(option);
  }
  if (!state.selectedUserId && state.users[0]) state.selectedUserId = String(state.users[0].id);
  els.permissionUserSelect.value = state.selectedUserId;
}

function renderDeveloperUsers() {
  els.developerUserSelect.innerHTML = "";
  for (const user of state.users) {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.username}${user.canDevelopApi ? " · 开发" : ""}`;
    els.developerUserSelect.appendChild(option);
  }
  if (!state.selectedDeveloperUserId && state.users[0]) state.selectedDeveloperUserId = String(state.users[0].id);
  els.developerUserSelect.value = state.selectedDeveloperUserId;
}

function renderSecurityApiOptions() {
  els.apiIpApiSelect.innerHTML = "";
  for (const api of state.apis) {
    const option = document.createElement("option");
    option.value = api.id;
    option.textContent = formatApiLabel(api);
    els.apiIpApiSelect.appendChild(option);
  }
  if (!state.selectedApiId && state.apis[0]) state.selectedApiId = state.apis[0].id;
  els.apiIpApiSelect.value = state.selectedApiId;
}

function renderPermissionApiList() {
  const filter = els.permissionApiFilterInput.value.trim().toLowerCase();
  const granted = new Set(state.userApiIds);
  els.permissionApiList.innerHTML = "";
  const apis = state.apis.filter((api) => !filter
    || String(api.name || "").toLowerCase().includes(filter)
    || String(api.path || "").toLowerCase().includes(filter));

  if (apis.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的 API";
    els.permissionApiList.appendChild(empty);
    return;
  }

  for (const api of apis) {
    const row = document.createElement("label");
    row.className = "security-check-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "permissionApi";
    checkbox.value = api.id;
    checkbox.checked = granted.has(api.id);
    const name = document.createElement("span");
    name.className = "security-main-text";
    name.textContent = api.name || "未命名 API";
    const path = document.createElement("span");
    path.className = "security-sub-text";
    path.textContent = `${api.method || "GET"} ${api.path || ""}`;
    row.append(checkbox, name, path);
    els.permissionApiList.appendChild(row);
  }
}

function renderDeveloperApiList() {
  const filter = els.developerApiFilterInput.value.trim().toLowerCase();
  const permissionByApiId = new Map(state.developerPermissions.map((item) => [item.apiId, item]));
  els.developerApiList.innerHTML = "";
  const apis = state.apis.filter((api) => !filter
    || String(api.name || "").toLowerCase().includes(filter)
    || String(api.path || "").toLowerCase().includes(filter));

  if (apis.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "没有匹配的 API";
    els.developerApiList.appendChild(empty);
    return;
  }

  for (const api of apis) {
    const permission = permissionByApiId.get(api.id) || {};
    const row = document.createElement("div");
    row.className = "security-check-row developer-permission-row";
    row.dataset.apiId = api.id;
    const name = document.createElement("span");
    name.className = "security-main-text";
    name.textContent = api.name || "未命名 API";
    const path = document.createElement("span");
    path.className = "security-sub-text";
    path.textContent = `${api.method || "GET"} ${api.path || ""}`;
    row.append(name, path);
    for (const [field, text] of [["canEdit", "编辑"], ["canTest", "测试"], ["canPublish", "发布"]]) {
      const label = document.createElement("label");
      label.className = "security-inline-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = field;
      checkbox.checked = Boolean(permission[field]);
      checkbox.disabled = !state.user?.isAdmin;
      label.append(checkbox, document.createTextNode(text));
      row.appendChild(label);
    }
    els.developerApiList.appendChild(row);
  }
}

function rulesToText(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule) => rule.ipRule || rule.ip_rule || rule)
    .filter(Boolean)
    .join("\n");
}

function textToRules(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((ipRule) => ({ ipRule, enabled: true }));
}

function renderAuditLogs(logs) {
  els.auditLogList.innerHTML = "";
  if (!Array.isArray(logs) || logs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = "暂无审计日志";
    els.auditLogList.appendChild(empty);
    return;
  }
  for (const log of logs) {
    const row = document.createElement("div");
    row.className = "security-row audit-row";
    const type = document.createElement("div");
    type.className = "security-main-text";
    type.textContent = log.eventType || "";
    const result = document.createElement("span");
    result.className = `security-badge ${log.success ? "enabled" : "denied"}`;
    result.textContent = log.success ? "成功" : "失败";
    const subject = document.createElement("div");
    subject.className = "security-sub-text";
    subject.textContent = `用户 ${log.actorUserId || "-"} · API ${log.apiId || "-"}`;
    const message = document.createElement("div");
    message.className = "security-sub-text";
    message.textContent = `${log.clientIp || "-"} · ${log.message || ""}`;
    row.append(type, result, subject, message);
    els.auditLogList.appendChild(row);
  }
}

async function loadCurrentUser() {
  state.user = await request("/admin/security/me");
  els.securityCurrentUser.textContent = `${state.user.username}${state.user.totpEnabled ? "" : " · 未绑定"}`;
  if (!state.user.isAdmin && !state.user.canManageAuth) {
    throw new Error("当前用户没有安全管理权限");
  }
}

async function loadSecurityApis() {
  const data = await request("/admin/security/apis?page=1&pageSize=100");
  state.apis = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
  renderSecurityApiOptions();
  renderPermissionApiList();
  renderDeveloperApiList();
}

async function loadSecurityUsers() {
  state.users = await request("/admin/security/users");
  renderSecurityUsers();
  renderPermissionUsers();
  renderDeveloperUsers();
}

async function loadUserPermissions() {
  const userId = els.permissionUserSelect.value;
  state.selectedUserId = userId;
  if (!userId) {
    state.userApiIds = [];
    renderPermissionApiList();
    return;
  }
  const permissions = await request(`/admin/security/users/${userId}/api-permissions`);
  state.userApiIds = permissions.map((item) => item.apiId);
  renderPermissionApiList();
}

async function loadUserDeveloperPermissions() {
  const userId = els.developerUserSelect.value;
  state.selectedDeveloperUserId = userId;
  if (!userId) {
    state.developerPermissions = [];
    renderDeveloperApiList();
    return;
  }
  state.developerPermissions = await request(`/admin/security/users/${userId}/api-developer-permissions`);
  renderDeveloperApiList();
}

async function saveSecurityUser(row, button) {
  setButtonLoading(button, true, "保存中...");
  try {
    const userId = row.dataset.userId;
    const payload = {
      status: row.querySelector('[name="status"]').value,
      isAdmin: row.querySelector('[name="isAdmin"]').checked,
      canManageAuth: row.querySelector('[name="canManageAuth"]').checked,
      canDevelopApi: row.querySelector('[name="canDevelopApi"]').checked
    };
    await request(`/admin/security/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    await loadSecurityUsers();
    showToast("用户权限已保存");
  } finally {
    setButtonLoading(button, false);
  }
}

async function saveUserDeveloperPermissions() {
  const userId = els.developerUserSelect.value;
  if (!userId) {
    showToast("请先选择用户", "error");
    return;
  }
  const permissions = [...document.querySelectorAll(".developer-permission-row")]
    .map((row) => ({
      apiId: row.dataset.apiId,
      canEdit: row.querySelector('[name="canEdit"]').checked,
      canTest: row.querySelector('[name="canTest"]').checked,
      canPublish: row.querySelector('[name="canPublish"]').checked
    }))
    .filter((item) => item.canEdit || item.canTest || item.canPublish);
  setButtonLoading(els.developerSaveBtn, true, "保存中...");
  try {
    state.developerPermissions = await request(`/admin/security/users/${userId}/api-developer-permissions`, {
      method: "PUT",
      body: JSON.stringify({ permissions })
    });
    renderDeveloperApiList();
    showToast("API 开发权限已保存");
  } finally {
    setButtonLoading(els.developerSaveBtn, false);
  }
}

async function revokeSecurityUserSessions(row, button) {
  const userId = row.dataset.userId;
  const username = row.querySelector(".security-main-text")?.textContent || "该用户";
  if (!window.confirm(`确定要踢下线 ${username} 吗？\n该用户所有 token 会立即失效。`)) return;
  setButtonLoading(button, true, "处理中...");
  try {
    const result = await request(`/admin/security/users/${userId}/sessions/revoke`, {
      method: "POST",
      body: "{}"
    });
    showToast(`已踢下线，撤销 ${result.revokedSessions || 0} 个会话`);
  } finally {
    setButtonLoading(button, false);
  }
}

async function saveUserPermissions() {
  const userId = els.permissionUserSelect.value;
  if (!userId) {
    showToast("请先选择用户", "error");
    return;
  }
  const apiIds = [...document.querySelectorAll('input[name="permissionApi"]:checked')].map((input) => input.value);
  setButtonLoading(els.permissionSaveBtn, true, "保存中...");
  try {
    const permissions = await request(`/admin/security/users/${userId}/api-permissions`, {
      method: "PUT",
      body: JSON.stringify({ apiIds })
    });
    state.userApiIds = permissions.map((item) => item.apiId);
    renderPermissionApiList();
    showToast("API 授权已保存");
  } finally {
    setButtonLoading(els.permissionSaveBtn, false);
  }
}

async function loadApiIpWhitelist() {
  const apiId = els.apiIpApiSelect.value;
  state.selectedApiId = apiId;
  if (!apiId) {
    els.apiIpRulesInput.value = "";
    return;
  }
  const rules = await request(`/admin/security/apis/${apiId}/ip-whitelist`);
  els.apiIpRulesInput.value = rulesToText(rules);
}

async function saveApiIpWhitelist() {
  const apiId = els.apiIpApiSelect.value;
  if (!apiId) {
    showToast("请先选择 API", "error");
    return;
  }
  setButtonLoading(els.apiIpSaveBtn, true, "保存中...");
  try {
    await request(`/admin/security/apis/${apiId}/ip-whitelist`, {
      method: "PUT",
      body: JSON.stringify({ rules: textToRules(els.apiIpRulesInput.value) })
    });
    showToast("API IP 白名单已保存");
  } finally {
    setButtonLoading(els.apiIpSaveBtn, false);
  }
}

async function loadAdminIpWhitelist() {
  const rules = await request("/admin/security/admin-ip-whitelist");
  els.adminIpRulesInput.value = rulesToText(rules);
}

async function saveAdminIpWhitelist() {
  setButtonLoading(els.adminIpSaveBtn, true, "保存中...");
  try {
    await request("/admin/security/admin-ip-whitelist", {
      method: "PUT",
      body: JSON.stringify({ rules: textToRules(els.adminIpRulesInput.value) })
    });
    showToast("授权页 IP 白名单已保存");
  } finally {
    setButtonLoading(els.adminIpSaveBtn, false);
  }
}

async function loadAuditLogs() {
  const logs = await request("/admin/security/audit-logs?limit=200");
  renderAuditLogs(logs);
}

async function bootstrapSecurityPage() {
  try {
    await loadCurrentUser();
    showGateMessage("");
    setManagementVisible(true);
    setSecurityTab("users");
    await Promise.all([loadSecurityUsers(), loadSecurityApis()]);
    await loadUserPermissions();
    if (state.user.isAdmin) await loadUserDeveloperPermissions();
    await loadApiIpWhitelist();
    showStatus("安全配置已加载");
  } catch (error) {
    setManagementVisible(false);
    showGateMessage(`安全管理不可用: ${error.message}`);
    showStatus("安全管理不可用");
    if (error.statusCode === 401) {
      els.securityGateMessage.textContent = "请先返回接口管理页面登录，再进入安全管理。";
    }
  }
}

function setupSecurityPage() {
  els.backToAdminBtn.addEventListener("click", () => {
    window.location.href = withBase("/");
  });
  for (const button of document.querySelectorAll("[data-security-tab]")) {
    button.addEventListener("click", () => {
      setSecurityTab(button.dataset.securityTab);
      if (button.dataset.securityTab === "audit") runPageAction(loadAuditLogs);
      if (button.dataset.securityTab === "adminIp") runPageAction(loadAdminIpWhitelist);
      if (button.dataset.securityTab === "developers") runPageAction(loadUserDeveloperPermissions);
    });
  }
  els.securityRefreshUsersBtn.addEventListener("click", () => runPageAction(loadSecurityUsers));
  els.permissionUserSelect.addEventListener("change", () => runPageAction(loadUserPermissions));
  els.permissionApiFilterInput.addEventListener("input", renderPermissionApiList);
  els.permissionSaveBtn.addEventListener("click", () => runPageAction(saveUserPermissions));
  els.developerUserSelect.addEventListener("change", () => runPageAction(loadUserDeveloperPermissions));
  els.developerApiFilterInput.addEventListener("input", renderDeveloperApiList);
  els.developerSaveBtn.addEventListener("click", () => runPageAction(saveUserDeveloperPermissions));
  els.apiIpApiSelect.addEventListener("change", () => runPageAction(loadApiIpWhitelist));
  els.apiIpLoadBtn.addEventListener("click", () => runPageAction(loadApiIpWhitelist));
  els.apiIpSaveBtn.addEventListener("click", () => runPageAction(saveApiIpWhitelist));
  els.adminIpLoadBtn.addEventListener("click", () => runPageAction(loadAdminIpWhitelist));
  els.adminIpSaveBtn.addEventListener("click", () => runPageAction(saveAdminIpWhitelist));
  els.auditRefreshBtn.addEventListener("click", () => runPageAction(loadAuditLogs));
}

setupSecurityPage();
bootstrapSecurityPage();
