const crypto = require("crypto");
const { promisify } = require("util");
const { AppError } = require("../errors");

const scrypt = promisify(crypto.scrypt);

function validatePassword(username, password) {
  const value = String(password || "");
  if (value.length < 12) throw new AppError(400, "password must be at least 12 characters");
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    throw new AppError(400, "password must contain letters and numbers");
  }
  if (value.toLowerCase() === String(username || "").toLowerCase()) {
    throw new AppError(400, "password cannot equal username");
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("base64url")}`;
}

async function verifyPassword(password, passwordHash) {
  const parts = String(passwordHash || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, rawN, rawR, rawP, salt, stored] = parts;
  const key = await scrypt(String(password), salt, 64, {
    N: Number(rawN),
    r: Number(rawR),
    p: Number(rawP)
  });
  const expected = Buffer.from(stored, "base64url");
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

class AuthService {
  constructor({ store, tokenService, totpService }) {
    this.store = store;
    this.tokenService = tokenService;
    this.totpService = totpService;
  }

  async register(payload, context = {}) {
    const username = String(payload.username || "").trim();
    validatePassword(username, payload.password);
    const isFirstUser = await this.store.countUsers() === 0;
    const user = await this.store.createUser({
      username,
      passwordHash: await hashPassword(payload.password),
      displayName: payload.displayName,
      // 第一个用户自动成为管理员，解决全新系统没有授权入口的问题。
      isAdmin: isFirstUser || Boolean(payload.isAdmin),
      canManageAuth: isFirstUser || Boolean(payload.canManageAuth),
      canDevelopApi: isFirstUser || Boolean(payload.canDevelopApi)
    });
    await this.store.addAudit({
      eventType: "user.register",
      actorUserId: context.actorUserId || user.id,
      targetUserId: user.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: true,
      message: isFirstUser ? "first admin registered" : "user registered"
    });
    return this.store.publicUser(user);
  }

  async login(payload, context = {}) {
    const username = String(payload.username || "").trim();
    const user = await this.store.findUserByUsername(username);
    if (!user || !await verifyPassword(payload.password, user.passwordHash)) {
      await this.store.addAudit({
        eventType: "user.login.password_failed",
        clientIp: context.clientIp,
        userAgent: context.userAgent,
        success: false,
        message: "username or password is invalid"
      });
      throw new AppError(401, "username or password is invalid");
    }
    if (user.status !== "active") throw new AppError(403, "user is not active");

    if (user.totpEnabled) {
      const verified = await this.totpService.verifyUserCode(user, payload.totpCode);
      if (!verified.ok) {
        await this.store.addAudit({
          eventType: "user.login.totp_failed",
          actorUserId: user.id,
          clientIp: context.clientIp,
          userAgent: context.userAgent,
          success: false,
          message: verified.message
        });
        throw new AppError(401, "totp code is invalid");
      }
    }

    const session = await this.tokenService.issueSession(user, context);
    await this.store.updateUserLoginAt(user.id);
    await this.store.addAudit({
      eventType: "user.login.success",
      actorUserId: user.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: true,
      message: "user logged in"
    });
    return {
      ...session,
      user: this.store.publicUser(user)
    };
  }

  async changePassword(user, payload, context = {}) {
    const currentUser = await this.store.getUserById(user.id);
    if (!await verifyPassword(payload.oldPassword, currentUser.passwordHash)) {
      await this.store.addAudit({
        eventType: "user.password.change_failed",
        actorUserId: currentUser.id,
        clientIp: context.clientIp,
        userAgent: context.userAgent,
        success: false,
        message: "old password is invalid"
      });
      throw new AppError(401, "old password is invalid");
    }

    validatePassword(currentUser.username, payload.newPassword);

    if (currentUser.totpEnabled) {
      const verified = await this.totpService.verifyUserCode(currentUser, payload.totpCode);
      if (!verified.ok) {
        await this.store.addAudit({
          eventType: "user.password.change_totp_failed",
          actorUserId: currentUser.id,
          clientIp: context.clientIp,
          userAgent: context.userAgent,
          success: false,
          message: verified.message
        });
        throw new AppError(401, "totp code is invalid");
      }
    }

    await this.store.updateUserPasswordHash(currentUser.id, await hashPassword(payload.newPassword));
    const revokedSessions = await this.store.revokeUserSessions(currentUser.id);
    await this.store.addAudit({
      eventType: "user.password.changed",
      actorUserId: currentUser.id,
      targetUserId: currentUser.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: true,
      message: "password changed",
      details: { revokedSessions }
    });
    return { ok: true, revokedSessions };
  }
}

module.exports = {
  AuthService,
  hashPassword,
  validatePassword,
  verifyPassword
};
