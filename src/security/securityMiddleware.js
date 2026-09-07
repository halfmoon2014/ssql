const { AppError } = require("../errors");
const { readBearerToken } = require("./tokenService");

class SecurityMiddleware {
  constructor({ config, store, tokenService, permissionService, ipWhitelistService }) {
    this.config = config;
    this.store = store;
    this.tokenService = tokenService;
    this.permissionService = permissionService;
    this.ipWhitelistService = ipWhitelistService;
  }

  isEnabled() {
    return Boolean(this.config.enabled);
  }

  getRequestContext(req) {
    return {
      clientIp: this.ipWhitelistService.getClientIp(req),
      userAgent: String(req.headers["user-agent"] || "")
    };
  }

  async authenticate(req) {
    const token = readBearerToken(req);
    const { user, session } = await this.tokenService.authenticateToken(token);
    return {
      user,
      session,
      token,
      context: this.getRequestContext(req)
    };
  }

  async requireSessionUser(req) {
    return this.authenticate(req);
  }

  async requireUser(req) {
    if (!this.isEnabled()) {
      return {
        user: { id: 1, username: "admin", displayName: "admin", isAdmin: true, canManageAuth: true, canDevelopApi: true, status: "active", totpEnabled: true },
        session: null,
        token: null,
        context: this.getRequestContext(req)
      };
    }
    return this.authenticate(req);
  }

  async authenticateDynamicRequest(req) {
    return this.requireUser(req);
  }

  async requireAuthManager(req) {
    const auth = await this.requireUser(req);
    if (this.isEnabled()) {
      await this.ipWhitelistService.assertAdminIpAllowed(auth.context.clientIp);
      if (!auth.user.totpEnabled) throw new AppError(403, "totp binding is required");
    }
    this.permissionService.assertCanManageAuth(auth.user);
    return auth;
  }

  async requireAdminPageIp(req) {
    const context = this.getRequestContext(req);
    if (this.isEnabled()) {
      // 独立安全管理页面是静态 HTML，先只校验入口 IP；登录态和管理权限由页面加载后的接口继续校验。
      await this.ipWhitelistService.assertAdminIpAllowed(context.clientIp);
    }
    return { context };
  }

  async requireAdmin(req) {
    const auth = await this.requireUser(req);
    if (this.isEnabled()) {
      await this.ipWhitelistService.assertAdminIpAllowed(auth.context.clientIp);
      if (!auth.user.totpEnabled) throw new AppError(403, "totp binding is required");
    }
    this.permissionService.assertAdmin(auth.user);
    return auth;
  }

  async requireApiDeveloper(req) {
    const auth = await this.requireUser(req);
    if (this.isEnabled()) {
      await this.ipWhitelistService.assertAdminIpAllowed(auth.context.clientIp);
      if (!auth.user.totpEnabled) throw new AppError(403, "totp binding is required");
    }
    this.permissionService.assertCanDevelopApi(auth.user);
    return auth;
  }

  async requireApiDeveloperAction(req, apiId, action) {
    const auth = await this.requireUser(req);
    if (this.isEnabled()) {
      await this.ipWhitelistService.assertAdminIpAllowed(auth.context.clientIp);
      if (!auth.user.totpEnabled) throw new AppError(403, "totp binding is required");
    }
    await this.permissionService.assertCanDevelopApiAction(auth.user, apiId, action);
    return auth;
  }

  async assertDynamicApiAccess(req, api) {
    if (!this.isEnabled()) {
      return {
        user: { id: 0, username: "anonymous", displayName: "", isAdmin: false, canManageAuth: false, canDevelopApi: false, status: "active", totpEnabled: false },
        context: this.getRequestContext(req)
      };
    }

    const auth = await this.authenticate(req);
    await this.permissionService.assertCanExecuteApi(auth.user, api, auth.context);
    try {
      await this.ipWhitelistService.assertApiIpAllowed(api, auth.context.clientIp);
    } catch (error) {
      if (error instanceof AppError) {
        await this.store.addAudit({
          eventType: "api_ip.deny",
          actorUserId: auth.user.id,
          apiId: api.id,
          clientIp: auth.context.clientIp,
          userAgent: auth.context.userAgent,
          success: false,
          message: error.message
        });
      }
      throw error;
    }
    return auth;
  }

  async assertApiAccessForUser(user, api, context = {}) {
    if (!this.isEnabled()) return;
    if (!user) throw new AppError(401, "authorization bearer token is required");
    await this.permissionService.assertCanExecuteApi(user, api, context);
    try {
      await this.ipWhitelistService.assertApiIpAllowed(api, context.clientIp);
    } catch (error) {
      if (error instanceof AppError) {
        await this.store.addAudit({
          eventType: "api_ip.deny",
          actorUserId: user.id,
          apiId: api.id,
          clientIp: context.clientIp,
          userAgent: context.userAgent,
          success: false,
          message: error.message
        });
      }
      throw error;
    }
  }
}

module.exports = {
  SecurityMiddleware
};
