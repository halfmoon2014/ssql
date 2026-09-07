const crypto = require("crypto");
const { AppError } = require("../errors");

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createAccessToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function readBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AppError(401, "authorization bearer token is required");
  return match[1].trim();
}

class TokenService {
  constructor({ store, ttlSeconds = 8 * 60 * 60 }) {
    this.store = store;
    this.ttlSeconds = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 8 * 60 * 60;
  }

  async issueSession(user, context = {}) {
    const accessToken = createAccessToken();
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.store.createSession({
      userId: user.id,
      tokenHash: hashToken(accessToken),
      expiresAt,
      userAgent: context.userAgent,
      clientIp: context.clientIp
    });
    return {
      accessToken,
      expiresAt: expiresAt.toISOString()
    };
  }

  async authenticateToken(token) {
    const session = await this.store.findActiveSessionByTokenHash(hashToken(token));
    if (!session) throw new AppError(401, "token is invalid or expired");
    const user = await this.store.getUserById(session.userId);
    if (user.status !== "active") throw new AppError(403, "user is not active");
    return { session, user };
  }

  async revokeToken(token) {
    await this.store.revokeSession(hashToken(token));
  }
}

module.exports = {
  TokenService,
  createAccessToken,
  hashToken,
  readBearerToken
};
