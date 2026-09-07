const net = require("net");
const { AppError } = require("../errors");

function normalizeIp(value) {
  const ip = String(value || "").trim().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) return ip.slice("::ffff:".length);
  return ip;
}

function ipv4ToBigInt(ip) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    throw new AppError(400, "ipv4 rule is invalid");
  }
  return parts.reduce((value, part) => (value << 8n) + BigInt(part), 0n);
}

function expandIpv6(ip) {
  const sections = ip.toLowerCase().split("::");
  if (sections.length > 2) throw new AppError(400, "ipv6 rule is invalid");
  const left = sections[0] ? sections[0].split(":") : [];
  const right = sections[1] ? sections[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) throw new AppError(400, "ipv6 rule is invalid");
  return [...left, ...Array(missing).fill("0"), ...right].map((part) => {
    if (!/^[0-9a-f]{0,4}$/.test(part)) throw new AppError(400, "ipv6 rule is invalid");
    return part || "0";
  });
}

function ipv6ToBigInt(ip) {
  return expandIpv6(ip).reduce((value, part) => (value << 16n) + BigInt(parseInt(part, 16)), 0n);
}

function ipToBigInt(ip) {
  const normalized = normalizeIp(ip);
  const version = net.isIP(normalized);
  if (version === 4) return { version, value: ipv4ToBigInt(normalized), bits: 32 };
  if (version === 6) return { version, value: ipv6ToBigInt(normalized), bits: 128 };
  throw new AppError(400, "ip is invalid");
}

function ipMatchesRule(ip, rule) {
  const cleanRule = String(rule || "").trim();
  if (!cleanRule) return false;
  if (!cleanRule.includes("/")) return normalizeIp(ip) === normalizeIp(cleanRule);

  const [network, rawPrefix] = cleanRule.split("/");
  const source = ipToBigInt(ip);
  const target = ipToBigInt(network);
  if (source.version !== target.version) return false;
  const prefix = Number(rawPrefix);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > target.bits) throw new AppError(400, "cidr prefix is invalid");
  const shift = BigInt(target.bits - prefix);
  return (source.value >> shift) === (target.value >> shift);
}

function ipMatchesAnyRule(ip, rules) {
  return (Array.isArray(rules) ? rules : []).some((rule) => ipMatchesRule(ip, rule));
}

function firstForwardedIp(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean)[0] || "";
}

function getClientIp(req, trustedProxies = []) {
  const remoteAddress = normalizeIp(req.socket?.remoteAddress || "");
  const fromTrustedProxy = remoteAddress && ipMatchesAnyRule(remoteAddress, trustedProxies);
  if (fromTrustedProxy) {
    const forwarded = firstForwardedIp(req.headers["x-forwarded-for"]);
    const realIp = String(req.headers["x-real-ip"] || "").trim();
    return normalizeIp(forwarded || realIp || remoteAddress);
  }
  return remoteAddress;
}

class IpWhitelistService {
  constructor({ store, trustedProxies = [], adminIpWhitelistRequired = false }) {
    this.store = store;
    this.trustedProxies = trustedProxies;
    this.adminIpWhitelistRequired = Boolean(adminIpWhitelistRequired);
  }

  getClientIp(req) {
    return getClientIp(req, this.trustedProxies);
  }

  async assertAdminIpAllowed(clientIp) {
    const rules = await this.store.listEnabledAdminIpRules();
    if (rules.length === 0 && !this.adminIpWhitelistRequired) return;
    if (rules.length > 0 && ipMatchesAnyRule(clientIp, rules)) return;
    throw new AppError(403, "admin ip is not allowed");
  }

  async assertApiIpAllowed(api, clientIp) {
    const rules = await this.store.listEnabledApiIpRules(api.id);
    if (rules.length === 0) return;
    if (ipMatchesAnyRule(clientIp, rules)) return;
    throw new AppError(403, "api ip is not allowed");
  }
}

module.exports = {
  IpWhitelistService,
  getClientIp,
  ipMatchesAnyRule,
  ipMatchesRule,
  normalizeIp
};
