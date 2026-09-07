class AuditService {
  constructor({ store }) {
    this.store = store;
  }

  write(event) {
    return this.store.addAudit(event);
  }

  list(limit) {
    return this.store.listAuditLogs(limit);
  }
}

module.exports = {
  AuditService
};
