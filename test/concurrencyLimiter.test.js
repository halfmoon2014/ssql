const assert = require("node:assert/strict");
const test = require("node:test");
const { ConcurrencyLimiter } = require("../src/concurrencyLimiter");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("ConcurrencyLimiter queues requests and grants after release", async () => {
  const limiter = new ConcurrencyLimiter({
    name: "test",
    max: 1,
    queueLimit: 1,
    queueTimeoutMs: 1000
  });

  const releaseFirst = await limiter.acquire();
  const second = limiter.acquire();
  assert.deepEqual(limiter.stats().active, 1);
  assert.deepEqual(limiter.stats().queued, 1);

  releaseFirst();
  const releaseSecond = await second;
  assert.deepEqual(limiter.stats().active, 1);
  assert.deepEqual(limiter.stats().queued, 0);

  releaseSecond();
  assert.deepEqual(limiter.stats().active, 0);
});

test("ConcurrencyLimiter rejects when queue is full", async () => {
  const limiter = new ConcurrencyLimiter({
    name: "test",
    max: 1,
    queueLimit: 0,
    queueTimeoutMs: 1000
  });

  const release = await limiter.acquire();
  await assert.rejects(
    () => limiter.acquire(),
    (error) => error.statusCode === 429 && error.message === "too many sql requests"
  );
  release();
});

test("ConcurrencyLimiter rejects queued request after timeout", async () => {
  const limiter = new ConcurrencyLimiter({
    name: "test",
    max: 1,
    queueLimit: 1,
    queueTimeoutMs: 20
  });

  const release = await limiter.acquire();
  await assert.rejects(
    () => limiter.acquire(),
    (error) => error.statusCode === 503 && error.message === "sql concurrency queue timeout"
  );
  release();
});

test("ConcurrencyLimiter removes aborted queued requests", async () => {
  const limiter = new ConcurrencyLimiter({
    name: "test",
    max: 1,
    queueLimit: 1,
    queueTimeoutMs: 1000
  });
  const controller = new AbortController();

  const release = await limiter.acquire();
  const queued = limiter.acquire({ signal: controller.signal, abortMessage: "sql test aborted" });
  controller.abort();

  await assert.rejects(
    () => queued,
    (error) => error.statusCode === 499 && error.message === "sql test aborted"
  );
  assert.equal(limiter.stats().queued, 0);
  release();

  const releaseAfterAbort = await limiter.acquire();
  await wait(1);
  releaseAfterAbort();
});
