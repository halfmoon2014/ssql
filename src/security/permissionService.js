const { AppError } = require("../errors");

class PermissionService {
  constructor({ store }) {
    this.store = store;
  }

  assertCanManageAuth(user) {
    if (user && (user.isAdmin || user.canManageAuth)) return;
    throw new AppError(403, "auth management permission is required");
  }

  assertAdmin(user) {
    if (user && user.isAdmin) return;
    throw new AppError(403, "admin permission is required");
  }

  assertCanDevelopApi(user) {
    if (user && (user.isAdmin || user.canDevelopApi)) return;
    throw new AppError(403, "api developer permission is required");
  }

  async assertCanDevelopApiAction(user, apiId, action) {
    if (user && user.isAdmin) return;
    this.assertCanDevelopApi(user);
    const allowed = await this.store.userCanDevelopApi(user.id, apiId, action);
    if (allowed) return;
    throw new AppError(403, "api developer permission denied");
  }

  async assertCanExecuteApi(user, api, context = {}) {
    const allowed = await this.store.userCanExecuteApi(user.id, api.id);
    if (allowed) return;
    await this.store.addAudit({
      eventType: "api_permission.deny",
      actorUserId: user.id,
      apiId: api.id,
      clientIp: context.clientIp,
      userAgent: context.userAgent,
      success: false,
      message: "api permission denied"
    });
    throw new AppError(403, "api permission denied");
  }
}

module.exports = {
  PermissionService
};
