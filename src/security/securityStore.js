const { randomUUID } = require("crypto");
const { AppError } = require("../errors");

function boolValue(value) {
  return Number(value || 0) === 1;
}

function normalizeUsername(value) {
  const username = String(value || "").trim();
  if (!/^[a-zA-Z0-9_.-]{3,100}$/.test(username)) {
    throw new AppError(400, "username format is invalid");
  }
  return username;
}

function normalizeIpRules(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => typeof item === "string" ? { ipRule: item } : item)
    .map((item) => ({
      ipRule: String(item.ipRule || item.ip_rule || "").trim(),
      description: String(item.description || "").trim(),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled)
    }))
    .filter((item) => item.ipRule);
}

class SecurityStore {
  constructor({ pool, logger = null }) {
    this.pool = pool;
    this.logger = logger;
  }

  async init() {
    await this.createTables();
  }

  async createTables() {
    await this.pool.execute(`
      create table if not exists adata_security_users (
        id bigint primary key auto_increment,
        username varchar(100) not null,
        password_hash varchar(255) not null,
        display_name varchar(100) not null default '',
        status varchar(20) not null default 'active',
        totp_secret_cipher text null,
        totp_enabled tinyint not null default 0,
        totp_last_counter bigint null,
        is_admin tinyint not null default 0,
        can_manage_auth tinyint not null default 0,
        can_develop_api tinyint not null default 0,
        last_login_at datetime null,
        created_at datetime not null default current_timestamp,
        updated_at datetime not null default current_timestamp on update current_timestamp,
        unique key ux_adata_security_users_username (username)
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_user_sessions (
        id varchar(64) primary key,
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
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_user_api_permissions (
        id bigint primary key auto_increment,
        user_id bigint not null,
        api_id varchar(64) not null,
        can_execute tinyint not null default 1,
        granted_by bigint not null,
        granted_at datetime not null default current_timestamp,
        revoked_at datetime null,
        unique key ux_adata_security_user_api_permissions_user_api (user_id, api_id),
        key idx_adata_security_user_api_permissions_api_id (api_id)
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_api_developers (
        id bigint primary key auto_increment,
        user_id bigint not null,
        api_id varchar(64) not null,
        can_edit tinyint not null default 0,
        can_test tinyint not null default 0,
        can_publish tinyint not null default 0,
        granted_by bigint not null,
        granted_at datetime not null default current_timestamp,
        revoked_at datetime null,
        unique key ux_adata_security_api_developers_user_api (user_id, api_id),
        key idx_adata_security_api_developers_api_id (api_id)
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_api_ip_whitelist (
        id bigint primary key auto_increment,
        api_id varchar(64) not null,
        ip_rule varchar(64) not null,
        description varchar(255) not null default '',
        enabled tinyint not null default 1,
        created_by bigint not null,
        created_at datetime not null default current_timestamp,
        unique key ux_adata_security_api_ip_whitelist_api_rule (api_id, ip_rule),
        key idx_adata_security_api_ip_whitelist_api_id (api_id)
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_admin_ip_whitelist (
        id bigint primary key auto_increment,
        ip_rule varchar(64) not null,
        description varchar(255) not null default '',
        enabled tinyint not null default 1,
        created_by bigint not null,
        created_at datetime not null default current_timestamp,
        unique key ux_adata_security_admin_ip_whitelist_rule (ip_rule)
      )
    `);

    await this.pool.execute(`
      create table if not exists adata_security_audit_logs (
        id bigint primary key auto_increment,
        event_type varchar(50) not null,
        actor_user_id bigint null,
        target_user_id bigint null,
        api_id varchar(64) null,
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
      )
    `);

    await this.migrateSchema();
  }

  async migrateSchema() {
    // 兼容旧版本安全表，已有环境缺列时补齐；重复列错误忽略。
    try {
      await this.pool.execute("alter table adata_security_users add column can_develop_api tinyint not null default 0 after can_manage_auth");
      if (this.logger) this.logger.info("mysql security schema migrated", { table: "adata_security_users", column: "can_develop_api" });
    } catch (error) {
      if (error && error.code !== "ER_DUP_FIELDNAME") throw error;
    }
  }

  mapUser(row) {
    return {
      id: Number(row.id),
      username: row.username,
      passwordHash: row.password_hash,
      displayName: row.display_name || "",
      status: row.status,
      totpSecretCipher: row.totp_secret_cipher || null,
      totpEnabled: boolValue(row.totp_enabled),
      totpLastCounter: row.totp_last_counter === null || row.totp_last_counter === undefined ? null : Number(row.totp_last_counter),
      isAdmin: boolValue(row.is_admin),
      canManageAuth: boolValue(row.can_manage_auth),
      canDevelopApi: boolValue(row.can_develop_api),
      lastLoginAt: row.last_login_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      totpEnabled: user.totpEnabled,
      isAdmin: user.isAdmin,
      canManageAuth: user.canManageAuth,
      canDevelopApi: user.canDevelopApi,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }

  mapSession(row) {
    return {
      id: row.id,
      userId: Number(row.user_id),
      tokenHash: row.token_hash,
      userAgent: row.user_agent || "",
      clientIp: row.client_ip || "",
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at || null,
      createdAt: row.created_at
    };
  }

  mapWhitelistRule(row) {
    return {
      id: Number(row.id),
      apiId: row.api_id || null,
      ipRule: row.ip_rule,
      description: row.description || "",
      enabled: boolValue(row.enabled),
      createdBy: Number(row.created_by),
      createdAt: row.created_at
    };
  }

  async countUsers() {
    const [rows] = await this.pool.execute("select count(*) as count from adata_security_users");
    return Number(rows[0].count || 0);
  }

  async createUser(payload) {
    const username = normalizeUsername(payload.username);
    try {
      const [result] = await this.pool.execute(
        `insert into adata_security_users (
          username, password_hash, display_name, status, totp_enabled,
          is_admin, can_manage_auth, can_develop_api
        ) values (?, ?, ?, 'active', 0, ?, ?, ?)`,
        [
          username,
          payload.passwordHash,
          String(payload.displayName || ""),
          payload.isAdmin ? 1 : 0,
          payload.canManageAuth ? 1 : 0,
          payload.canDevelopApi ? 1 : 0
        ]
      );
      return this.getUserById(result.insertId);
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") throw new AppError(409, "username already exists");
      throw error;
    }
  }

  async listUsers() {
    const [rows] = await this.pool.execute(`
      select *
      from adata_security_users
      order by created_at desc
      limit 1000
    `);
    return rows.map((row) => this.publicUser(this.mapUser(row)));
  }

  async getUserById(id) {
    const [rows] = await this.pool.execute("select * from adata_security_users where id = ?", [Number(id)]);
    if (rows.length === 0) throw new AppError(404, "user not found");
    return this.mapUser(rows[0]);
  }

  async findUserByUsername(username) {
    const [rows] = await this.pool.execute("select * from adata_security_users where username = ? limit 1", [normalizeUsername(username)]);
    return rows.length === 0 ? null : this.mapUser(rows[0]);
  }

  async updateUserLoginAt(userId) {
    await this.pool.execute("update adata_security_users set last_login_at = current_timestamp where id = ?", [Number(userId)]);
  }

  async updateUserAdminFlags(userId, payload) {
    await this.pool.execute(
      `update adata_security_users
       set is_admin = ?, can_manage_auth = ?, can_develop_api = ?, status = ?
       where id = ?`,
      [
        payload.isAdmin ? 1 : 0,
        payload.canManageAuth ? 1 : 0,
        payload.canDevelopApi ? 1 : 0,
        payload.status || "active",
        Number(userId)
      ]
    );
    return this.publicUser(await this.getUserById(userId));
  }

  async updateUserPasswordHash(userId, passwordHash) {
    await this.pool.execute(
      "update adata_security_users set password_hash = ? where id = ?",
      [passwordHash, Number(userId)]
    );
  }

  async setUserTotpSecret(userId, secretCipher) {
    await this.pool.execute(
      "update adata_security_users set totp_secret_cipher = ?, totp_enabled = 0, totp_last_counter = null where id = ?",
      [secretCipher, Number(userId)]
    );
  }

  async enableUserTotp(userId, counter) {
    await this.pool.execute(
      "update adata_security_users set totp_enabled = 1, totp_last_counter = ? where id = ?",
      [Number(counter), Number(userId)]
    );
  }

  async updateTotpCounterIfNewer(userId, counter) {
    const [result] = await this.pool.execute(
      `update adata_security_users
       set totp_last_counter = ?
       where id = ? and (totp_last_counter is null or totp_last_counter < ?)`,
      [Number(counter), Number(userId), Number(counter)]
    );
    return result.affectedRows === 1;
  }

  async createSession(payload) {
    const id = randomUUID();
    await this.pool.execute(
      `insert into adata_security_user_sessions (
        id, user_id, token_hash, user_agent, client_ip, expires_at, revoked_at
      ) values (?, ?, ?, ?, ?, ?, null)`,
      [
        id,
        Number(payload.userId),
        payload.tokenHash,
        String(payload.userAgent || "").slice(0, 500),
        String(payload.clientIp || "").slice(0, 64),
        payload.expiresAt
      ]
    );
    return id;
  }

  async findActiveSessionByTokenHash(tokenHash) {
    const [rows] = await this.pool.execute(
      `select *
       from adata_security_user_sessions
       where token_hash = ? and revoked_at is null and expires_at > current_timestamp
       limit 1`,
      [tokenHash]
    );
    return rows.length === 0 ? null : this.mapSession(rows[0]);
  }

  async revokeSession(tokenHash) {
    await this.pool.execute(
      "update adata_security_user_sessions set revoked_at = current_timestamp where token_hash = ? and revoked_at is null",
      [tokenHash]
    );
  }

  async revokeUserSessions(userId) {
    const [result] = await this.pool.execute(
      `update adata_security_user_sessions
       set revoked_at = current_timestamp
       where user_id = ? and revoked_at is null`,
      [Number(userId)]
    );
    return Number(result.affectedRows || 0);
  }

  async listUserApiPermissions(userId) {
    const [rows] = await this.pool.execute(
      `select p.api_id, p.can_execute, p.granted_by, p.granted_at, p.revoked_at,
              a.name, a.path, a.method
       from adata_security_user_api_permissions p
       left join adata_api_definitions a on a.id = p.api_id
       where p.user_id = ? and p.can_execute = 1 and p.revoked_at is null
       order by a.path asc`,
      [Number(userId)]
    );
    return rows.map((row) => ({
      apiId: row.api_id,
      canExecute: boolValue(row.can_execute),
      grantedBy: Number(row.granted_by),
      grantedAt: row.granted_at,
      api: row.name ? { name: row.name, path: row.path, method: row.method } : null
    }));
  }

  async assertApiIdsExist(apiIds) {
    const ids = [...new Set((Array.isArray(apiIds) ? apiIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
    if (ids.length === 0) return ids;
    const placeholders = ids.map(() => "?").join(", ");
    const [rows] = await this.pool.execute(
      `select id from adata_api_definitions where deleted_at is null and id in (${placeholders})`,
      ids
    );
    const existing = new Set(rows.map((row) => row.id));
    const missing = ids.filter((id) => !existing.has(id));
    if (missing.length > 0) throw new AppError(400, "selected api does not exist");
    return ids;
  }

  async setUserApiPermissions(userId, apiIds, actorUserId) {
    const ids = await this.assertApiIdsExist(apiIds);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "update adata_security_user_api_permissions set can_execute = 0, revoked_at = current_timestamp where user_id = ?",
        [Number(userId)]
      );
      for (const apiId of ids) {
        await connection.execute(
          `insert into adata_security_user_api_permissions (
            user_id, api_id, can_execute, granted_by, granted_at, revoked_at
          ) values (?, ?, 1, ?, current_timestamp, null)
          on duplicate key update can_execute = 1, granted_by = values(granted_by),
            granted_at = current_timestamp, revoked_at = null`,
          [Number(userId), apiId, Number(actorUserId)]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.listUserApiPermissions(userId);
  }

  async userCanExecuteApi(userId, apiId) {
    const [rows] = await this.pool.execute(
      `select id
       from adata_security_user_api_permissions
       where user_id = ? and api_id = ? and can_execute = 1 and revoked_at is null
       limit 1`,
      [Number(userId), String(apiId)]
    );
    return rows.length > 0;
  }

  normalizeApiDeveloperPermissions(permissions) {
    const byApiId = new Map();
    for (const item of Array.isArray(permissions) ? permissions : []) {
      const apiId = String(item.apiId || item.api_id || "").trim();
      if (!apiId) continue;
      const permission = {
        apiId,
        canEdit: Boolean(item.canEdit || item.can_edit),
        canTest: Boolean(item.canTest || item.can_test),
        canPublish: Boolean(item.canPublish || item.can_publish)
      };
      if (permission.canEdit || permission.canTest || permission.canPublish) byApiId.set(apiId, permission);
    }
    return [...byApiId.values()];
  }

  async listUserApiDeveloperPermissions(userId) {
    const [rows] = await this.pool.execute(
      `select d.api_id, d.can_edit, d.can_test, d.can_publish, d.granted_by, d.granted_at, d.revoked_at,
              a.name, a.path, a.method
       from adata_security_api_developers d
       left join adata_api_definitions a on a.id = d.api_id
       where d.user_id = ? and d.revoked_at is null
       order by a.path asc`,
      [Number(userId)]
    );
    return rows.map((row) => ({
      apiId: row.api_id,
      canEdit: boolValue(row.can_edit),
      canTest: boolValue(row.can_test),
      canPublish: boolValue(row.can_publish),
      grantedBy: Number(row.granted_by),
      grantedAt: row.granted_at,
      api: row.name ? { name: row.name, path: row.path, method: row.method } : null
    }));
  }

  async setUserApiDeveloperPermissions(userId, permissions, actorUserId) {
    const normalized = this.normalizeApiDeveloperPermissions(permissions);
    const ids = await this.assertApiIdsExist(normalized.map((item) => item.apiId));
    const allowedIds = new Set(ids);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "update adata_security_api_developers set revoked_at = current_timestamp where user_id = ?",
        [Number(userId)]
      );
      for (const item of normalized.filter((permission) => allowedIds.has(permission.apiId))) {
        await connection.execute(
          `insert into adata_security_api_developers (
            user_id, api_id, can_edit, can_test, can_publish, granted_by, granted_at, revoked_at
          ) values (?, ?, ?, ?, ?, ?, current_timestamp, null)
          on duplicate key update can_edit = values(can_edit), can_test = values(can_test),
            can_publish = values(can_publish), granted_by = values(granted_by),
            granted_at = current_timestamp, revoked_at = null`,
          [
            Number(userId),
            item.apiId,
            item.canEdit ? 1 : 0,
            item.canTest ? 1 : 0,
            item.canPublish ? 1 : 0,
            Number(actorUserId)
          ]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.listUserApiDeveloperPermissions(userId);
  }

  async grantApiDeveloperPermission(userId, apiId, actorUserId, flags = {}) {
    await this.setUserApiDeveloperPermissions(
      userId,
      [
        ...await this.listUserApiDeveloperPermissions(userId),
        {
          apiId,
          canEdit: flags.canEdit !== false,
          canTest: flags.canTest !== false,
          canPublish: flags.canPublish !== false
        }
      ],
      actorUserId
    );
  }

  async userCanDevelopApi(userId, apiId, action = "read") {
    const columnByAction = {
      read: "(can_edit = 1 or can_test = 1 or can_publish = 1)",
      edit: "can_edit = 1",
      test: "can_test = 1",
      publish: "can_publish = 1"
    };
    const condition = columnByAction[action] || columnByAction.read;
    const [rows] = await this.pool.execute(
      `select id
       from adata_security_api_developers
       where user_id = ? and api_id = ? and revoked_at is null and ${condition}
       limit 1`,
      [Number(userId), String(apiId)]
    );
    return rows.length > 0;
  }

  async listApiIpWhitelist(apiId) {
    const [rows] = await this.pool.execute(
      `select *
       from adata_security_api_ip_whitelist
       where api_id = ?
       order by created_at desc`,
      [String(apiId)]
    );
    return rows.map((row) => this.mapWhitelistRule(row));
  }

  async listEnabledApiIpRules(apiId) {
    const [rows] = await this.pool.execute(
      "select ip_rule from adata_security_api_ip_whitelist where api_id = ? and enabled = 1",
      [String(apiId)]
    );
    return rows.map((row) => row.ip_rule);
  }

  async setApiIpWhitelist(apiId, rules, actorUserId) {
    const normalized = normalizeIpRules(rules);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("delete from adata_security_api_ip_whitelist where api_id = ?", [String(apiId)]);
      for (const rule of normalized) {
        await connection.execute(
          `insert into adata_security_api_ip_whitelist (
            api_id, ip_rule, description, enabled, created_by
          ) values (?, ?, ?, ?, ?)`,
          [String(apiId), rule.ipRule, rule.description, rule.enabled ? 1 : 0, Number(actorUserId)]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.listApiIpWhitelist(apiId);
  }

  async listAdminIpWhitelist() {
    const [rows] = await this.pool.execute(`
      select *
      from adata_security_admin_ip_whitelist
      order by created_at desc
    `);
    return rows.map((row) => this.mapWhitelistRule(row));
  }

  async listEnabledAdminIpRules() {
    const [rows] = await this.pool.execute("select ip_rule from adata_security_admin_ip_whitelist where enabled = 1");
    return rows.map((row) => row.ip_rule);
  }

  async setAdminIpWhitelist(rules, actorUserId) {
    const normalized = normalizeIpRules(rules);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("delete from adata_security_admin_ip_whitelist");
      for (const rule of normalized) {
        await connection.execute(
          `insert into adata_security_admin_ip_whitelist (
            ip_rule, description, enabled, created_by
          ) values (?, ?, ?, ?)`,
          [rule.ipRule, rule.description, rule.enabled ? 1 : 0, Number(actorUserId)]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return this.listAdminIpWhitelist();
  }

  async addAudit(event) {
    await this.pool.execute(
      `insert into adata_security_audit_logs (
        event_type, actor_user_id, target_user_id, api_id, client_ip,
        user_agent, success, message, details_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.eventType,
        event.actorUserId || null,
        event.targetUserId || null,
        event.apiId || null,
        String(event.clientIp || "").slice(0, 64),
        String(event.userAgent || "").slice(0, 500),
        event.success === false ? 0 : 1,
        String(event.message || "").slice(0, 500),
        event.details ? JSON.stringify(event.details) : null
      ]
    );
  }

  async listAuditLogs(limit = 200) {
    const [rows] = await this.pool.execute(
      `select *
       from adata_security_audit_logs
       order by created_at desc
       limit ${Math.min(1000, Math.max(1, Number(limit) || 200))}`
    );
    return rows.map((row) => ({
      id: Number(row.id),
      eventType: row.event_type,
      actorUserId: row.actor_user_id === null ? null : Number(row.actor_user_id),
      targetUserId: row.target_user_id === null ? null : Number(row.target_user_id),
      apiId: row.api_id || null,
      clientIp: row.client_ip || "",
      userAgent: row.user_agent || "",
      success: boolValue(row.success),
      message: row.message || "",
      details: row.details_json || null,
      createdAt: row.created_at
    }));
  }
}

module.exports = {
  SecurityStore,
  normalizeIpRules,
  normalizeUsername
};
