const { AppError } = require("./errors");

function positiveInteger(value, fallback) {
  const number = value === undefined || value === null || value === "" ? fallback : Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.floor(number);
}

class ConcurrencyLimiter {
  constructor(options = {}) {
    this.name = options.name || "concurrency";
    this.enabled = options.enabled !== false;
    this.max = positiveInteger(options.max, 1);
    this.queueLimit = Math.max(0, Math.floor(Number(options.queueLimit ?? 0)));
    this.queueTimeoutMs = Math.max(0, Math.floor(Number(options.queueTimeoutMs ?? 3000)));
    this.active = 0;
    this.queue = [];
  }

  async acquire(options = {}) {
    if (!this.enabled) return () => {};
    if (options.signal?.aborted) throw new AppError(499, options.abortMessage || "request aborted");
    if (this.active < this.max) return this.grant();

    if (this.queue.length >= this.queueLimit) {
      throw new AppError(429, "too many sql requests", {
        limiter: this.name,
        max: this.max,
        queueLimit: this.queueLimit
      });
    }

    return new Promise((resolve, reject) => {
      const entry = {
        done: false,
        resolve,
        reject,
        timer: null,
        signal: options.signal || null,
        onAbort: null
      };

      const rejectQueued = (error) => {
        if (entry.done) return;
        entry.done = true;
        this.remove(entry);
        if (entry.timer) clearTimeout(entry.timer);
        if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
        reject(error);
      };

      if (this.queueTimeoutMs > 0) {
        entry.timer = setTimeout(() => {
          rejectQueued(new AppError(503, "sql concurrency queue timeout", {
            limiter: this.name,
            max: this.max,
            queueTimeoutMs: this.queueTimeoutMs
          }));
        }, this.queueTimeoutMs);
      }

      if (options.signal) {
        entry.onAbort = () => rejectQueued(new AppError(499, options.abortMessage || "request aborted"));
        options.signal.addEventListener("abort", entry.onAbort, { once: true });
      }

      this.queue.push(entry);
    });
  }

  grant() {
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.drain();
    };
  }

  drain() {
    // 释放令牌时只唤醒一个仍有效的排队请求；超时或中断的请求会被跳过。
    while (this.active < this.max && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (!entry || entry.done) continue;
      entry.done = true;
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
      entry.onAbort = null;
      entry.resolve(this.grant());
      return;
    }
  }

  remove(entry) {
    const index = this.queue.indexOf(entry);
    if (index >= 0) this.queue.splice(index, 1);
  }

  stats() {
    return {
      name: this.name,
      enabled: this.enabled,
      max: this.max,
      active: this.active,
      queued: this.queue.length,
      queueLimit: this.queueLimit,
      queueTimeoutMs: this.queueTimeoutMs
    };
  }
}

module.exports = {
  ConcurrencyLimiter
};
