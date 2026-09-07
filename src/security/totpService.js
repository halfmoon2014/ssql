const crypto = require("crypto");
const QRCode = require("qrcode");
const { AppError } = require("../errors");

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    output += base32Alphabet[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(value) {
  const clean = String(value || "").replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const index = base32Alphabet.indexOf(char);
    if (index === -1) throw new AppError(400, "totp secret is invalid");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret, counter, digits = 6) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

function generateTotpCode(secret, options = {}) {
  const period = Number(options.period || 30);
  const now = Number(options.now || Date.now());
  const counter = Math.floor(now / 1000 / period);
  return {
    code: hotp(secret, counter, Number(options.digits || 6)),
    counter
  };
}

function deriveKey(secretKey) {
  return crypto.createHash("sha256").update(String(secretKey || "ssql-dev-security-key")).digest();
}

function encryptText(text, secretKey) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secretKey), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm$${iv.toString("base64url")}$${tag.toString("base64url")}$${encrypted.toString("base64url")}`;
}

function decryptText(cipherText, secretKey) {
  const parts = String(cipherText || "").split("$");
  if (parts.length !== 4 || parts[0] !== "aes-256-gcm") throw new AppError(500, "totp secret cipher is invalid");
  const [, rawIv, rawTag, rawEncrypted] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secretKey), Buffer.from(rawIv, "base64url"));
  decipher.setAuthTag(Buffer.from(rawTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(rawEncrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

class TotpService {
  constructor({ store, issuer = "SQL API", secretKey }) {
    this.store = store;
    this.issuer = issuer;
    this.secretKey = secretKey;
  }

  generateSecret() {
    return base32Encode(crypto.randomBytes(20));
  }

  buildOtpauthUrl(username, secret) {
    const label = `${this.issuer}:${username}`;
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      period: "30",
      digits: "6"
    });
    return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
  }

  async beginBind(user, context = {}) {
    const secret = this.generateSecret();
    const otpauthUrl = this.buildOtpauthUrl(user.username, secret);
    const qrCodeSvg = await QRCode.toString(otpauthUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      width: 180,
      color: {
        dark: "#172026",
        light: "#ffffff"
      }
    });
    await this.store.setUserTotpSecret(user.id, encryptText(secret, this.secretKey));
    await this.store.addAudit({
      eventType: "user.totp.bind_start",
      actorUserId: user.id,
      targetUserId: user.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: true,
      message: "totp bind started"
    });
    return {
      otpauthUrl,
      qrCodeSvg,
      // 手动录入密钥保持无空格，避免部分 Authenticator 客户端拒绝分组后的 Base32 字符串。
      secret,
      secretPreview: secret
    };
  }

  decryptUserSecret(user) {
    if (!user.totpSecretCipher) throw new AppError(400, "totp is not initialized");
    return decryptText(user.totpSecretCipher, this.secretKey);
  }

  verifyCode(secret, code, options = {}) {
    const input = String(code || "").trim();
    if (!/^\d{6}$/.test(input)) return null;
    const period = Number(options.period || 30);
    const counter = Math.floor(Number(options.now || Date.now()) / 1000 / period);
    const windowSize = Number(options.windowSize || 1);
    for (let offset = -windowSize; offset <= windowSize; offset += 1) {
      const candidateCounter = counter + offset;
      if (hotp(secret, candidateCounter, 6) === input) return candidateCounter;
    }
    return null;
  }

  async verifyUserCode(user, code) {
    const secret = this.decryptUserSecret(user);
    const counter = this.verifyCode(secret, code);
    if (counter === null) return { ok: false, message: "totp code is invalid" };
    if (user.totpLastCounter !== null && counter <= user.totpLastCounter) {
      return { ok: false, message: "totp code was already used" };
    }
    const updated = await this.store.updateTotpCounterIfNewer(user.id, counter);
    return updated ? { ok: true, counter } : { ok: false, message: "totp code was already used" };
  }

  async confirmBind(user, code, context = {}) {
    const verified = await this.verifyUserCode(user, code);
    if (!verified.ok) throw new AppError(401, verified.message);
    await this.store.enableUserTotp(user.id, verified.counter);
    await this.store.addAudit({
      eventType: "user.totp.bind_success",
      actorUserId: user.id,
      targetUserId: user.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: true,
      message: "totp bind confirmed"
    });
    return { totpEnabled: true };
  }
}

module.exports = {
  TotpService,
  base32Decode,
  base32Encode,
  decryptText,
  encryptText,
  generateTotpCode,
  hotp
};
