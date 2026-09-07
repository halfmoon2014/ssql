const assert = require("node:assert/strict");
const test = require("node:test");
const { AuthService, hashPassword, validatePassword, verifyPassword } = require("../src/security/authService");
const { getClientIp, ipMatchesRule } = require("../src/security/ipWhitelistService");
const { SecurityMiddleware } = require("../src/security/securityMiddleware");
const { SecurityStore } = require("../src/security/securityStore");
const { decryptText, encryptText, generateTotpCode, TotpService } = require("../src/security/totpService");

test("password hashing verifies correct password only", async () => {
  const hash = await hashPassword("StrongPassword123");

  assert.equal(await verifyPassword("StrongPassword123", hash), true);
  assert.equal(await verifyPassword("WrongPassword123", hash), false);
});

test("password validation rejects weak values", () => {
  assert.throws(() => validatePassword("admin", "short1"), /at least 12/);
  assert.throws(() => validatePassword("admin", "onlylettersxx"), /letters and numbers/);
  assert.doesNotThrow(() => validatePassword("admin", "StrongPassword123"));
});

test("totp service generates verifiable authenticator codes", () => {
  const service = new TotpService({ store: null, secretKey: "test-secret" });
  const secret = service.generateSecret();
  const { code, counter } = generateTotpCode(secret, { now: 1700000000000 });

  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(service.verifyCode(secret, code, { now: 1700000000000 }), counter);
  assert.equal(service.verifyCode(secret, "000000", { now: 1700000000000 }), null);
});

test("totp secret encryption round trips with configured secret key", () => {
  const cipher = encryptText("BASE32SECRET", "server-secret");

  assert.notEqual(cipher, "BASE32SECRET");
  assert.equal(decryptText(cipher, "server-secret"), "BASE32SECRET");
});

test("totp begin bind returns a scannable local qr code", async () => {
  const service = new TotpService({
    secretKey: "test-secret",
    store: {
      async setUserTotpSecret(userId, cipher) {
        assert.equal(userId, 7);
        assert.match(cipher, /^aes-256-gcm\$/);
      },
      async addAudit(event) {
        assert.equal(event.eventType, "user.totp.bind_start");
      }
    }
  });

  const result = await service.beginBind({ id: 7, username: "admin" });

  assert.match(result.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.match(result.qrCodeSvg, /^<svg[^>]+>/);
  assert.match(result.qrCodeSvg, /path/);
  assert.match(result.secret, /^[A-Z2-7]+$/);
});

test("ip whitelist supports exact and cidr rules", () => {
  assert.equal(ipMatchesRule("192.168.1.10", "192.168.1.10"), true);
  assert.equal(ipMatchesRule("192.168.1.11", "192.168.1.10"), false);
  assert.equal(ipMatchesRule("10.0.0.25", "10.0.0.0/24"), true);
  assert.equal(ipMatchesRule("10.0.1.25", "10.0.0.0/24"), false);
  assert.equal(ipMatchesRule("2001:db8::1", "2001:db8::/32"), true);
});

test("getClientIp trusts forwarded headers only from trusted proxies", () => {
  const req = {
    socket: { remoteAddress: "127.0.0.1" },
    headers: {
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "x-real-ip": "203.0.113.8"
    }
  };

  assert.equal(getClientIp(req, ["127.0.0.1"]), "203.0.113.9");
  assert.equal(getClientIp(req, ["10.0.0.0/24"]), "127.0.0.1");
});

test("security user creation relies on mysql datetime defaults", async () => {
  const calls = [];
  const store = new SecurityStore({
    pool: {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        if (/insert into adata_security_users/i.test(sql)) return [{ insertId: 7 }];
        if (/select \* from adata_security_users where id = \?/i.test(sql)) {
          return [[{
            id: 7,
            username: "admin",
            password_hash: "hash",
            display_name: "Admin",
            status: "active",
            totp_secret_cipher: null,
            totp_enabled: 0,
            totp_last_counter: null,
            is_admin: 1,
            can_manage_auth: 1,
            last_login_at: null,
            created_at: "2026-09-05 20:21:21",
            updated_at: "2026-09-05 20:21:21"
          }]];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }
    }
  });

  await store.createUser({
    username: "admin",
    passwordHash: "hash",
    displayName: "Admin",
    isAdmin: true,
    canManageAuth: true
  });

  const insert = calls.find((call) => /insert into adata_security_users/i.test(call.sql));
  assert.ok(insert);
  assert.doesNotMatch(insert.sql, /created_at|updated_at/i);
  assert.deepEqual(insert.params, ["admin", "hash", "Admin", 1, 1, 0]);
});

test("api developer permission checks action flags", async () => {
  const calls = [];
  const store = new SecurityStore({
    pool: {
      async execute(sql, params = []) {
        calls.push({ sql, params });
        if (/from adata_security_api_developers/i.test(sql) && /can_edit = 1/i.test(sql)) return [[{ id: 1 }]];
        if (/from adata_security_api_developers/i.test(sql) && /can_publish = 1/i.test(sql)) return [[]];
        throw new Error(`unexpected sql: ${sql}`);
      }
    }
  });

  assert.equal(await store.userCanDevelopApi(7, "api-1", "edit"), true);
  assert.equal(await store.userCanDevelopApi(7, "api-1", "publish"), false);
  assert.deepEqual(calls.map((call) => call.params), [[7, "api-1"], [7, "api-1"]]);
});

test("changePassword verifies old password and writes a new password hash", async () => {
  let passwordHash = await hashPassword("OldPassword123");
  let revokedUserId = null;
  let auditDetails = null;
  const store = {
    async getUserById(id) {
      return {
        id,
        username: "admin",
        passwordHash,
        totpEnabled: false
      };
    },
    async updateUserPasswordHash(id, nextHash) {
      assert.equal(id, 7);
      passwordHash = nextHash;
    },
    async revokeUserSessions(id) {
      revokedUserId = id;
      return 2;
    },
    async addAudit(event) {
      if (event.eventType === "user.password.changed") auditDetails = event.details;
    }
  };
  const service = new AuthService({ store, tokenService: null, totpService: null });

  const result = await service.changePassword({ id: 7 }, { oldPassword: "OldPassword123", newPassword: "NewPassword123" });

  assert.equal(await verifyPassword("NewPassword123", passwordHash), true);
  assert.equal(revokedUserId, 7);
  assert.deepEqual(result, { ok: true, revokedSessions: 2 });
  assert.deepEqual(auditDetails, { revokedSessions: 2 });
  await assert.rejects(
    () => service.changePassword({ id: 7 }, { oldPassword: "OldPassword123", newPassword: "AnotherPassword123" }),
    /old password is invalid/
  );
});

test("security page ip gate runs only when security is enabled", async () => {
  const calls = [];
  const req = { socket: { remoteAddress: "192.168.1.10" }, headers: {} };
  const middleware = new SecurityMiddleware({
    config: { enabled: true },
    store: null,
    tokenService: null,
    permissionService: null,
    ipWhitelistService: {
      getClientIp() {
        return "192.168.1.10";
      },
      async assertAdminIpAllowed(ip) {
        calls.push(ip);
      }
    }
  });

  await middleware.requireAdminPageIp(req);
  assert.deepEqual(calls, ["192.168.1.10"]);

  middleware.config.enabled = false;
  await middleware.requireAdminPageIp(req);
  assert.deepEqual(calls, ["192.168.1.10"]);
});
