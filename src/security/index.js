const { AuthService } = require("./authService");
const { AuditService } = require("./auditService");
const { IpWhitelistService } = require("./ipWhitelistService");
const { PermissionService } = require("./permissionService");
const { SecurityMiddleware } = require("./securityMiddleware");
const { SecurityStore } = require("./securityStore");
const { TokenService } = require("./tokenService");
const { TotpService } = require("./totpService");

function createSecurity({ config, pool, logger }) {
  const securityConfig = config.security || {};
  const store = new SecurityStore({ pool, logger });
  const tokenService = new TokenService({
    store,
    ttlSeconds: securityConfig.tokenTtlSeconds
  });
  const totpService = new TotpService({
    store,
    issuer: securityConfig.totpIssuer,
    secretKey: securityConfig.secretKey
  });
  const permissionService = new PermissionService({ store });
  const ipWhitelistService = new IpWhitelistService({
    store,
    trustedProxies: securityConfig.trustedProxies,
    adminIpWhitelistRequired: securityConfig.adminIpWhitelistRequired
  });

  return {
    store,
    authService: new AuthService({ store, tokenService, totpService }),
    auditService: new AuditService({ store }),
    tokenService,
    totpService,
    permissionService,
    ipWhitelistService,
    middleware: new SecurityMiddleware({
      config: securityConfig,
      store,
      tokenService,
      permissionService,
      ipWhitelistService
    })
  };
}

module.exports = {
  createSecurity
};
