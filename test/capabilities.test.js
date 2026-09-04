const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const test = require("node:test");
const { executeCapability, normalizeScriptCapabilities } = require("../src/capabilities");

function mockHttpRequest(t, handler) {
  // capability 逻辑使用 Node http 客户端；测试用 mock 避免依赖沙箱开端口权限。
  t.mock.method(http, "request", (url, options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = (error) => request.emit("error", error);
    request.end = () => {
      const payload = handler(url, options);
      const response = new Readable({
        read() {}
      });
      response.statusCode = payload.statusCode || 200;
      response.headers = payload.headers || {};
      process.nextTick(() => {
        callback(response);
        if (payload.body) response.push(payload.body);
        response.push(null);
      });
    };
    return request;
  });
}

test("normalizeScriptCapabilities keeps only known unique capabilities", () => {
  assert.deepEqual(normalizeScriptCapabilities([
    "files.inspectUrl",
    "unknown",
    "files.inspectUrl",
    "files.downloadTemp"
  ]), ["files.inspectUrl", "files.downloadTemp"]);
});

test("files.inspectUrl reads content length with per-api authorization", async (t) => {
  mockHttpRequest(t, (url, options) => {
    assert.equal(url.hostname, "127.0.0.1");
    if (options.method === "HEAD") {
      return {
        headers: {
          "content-type": "text/plain",
          "content-length": "5"
        }
      };
    }
    return { statusCode: 500, body: "unexpected get" };
  });

  const result = await executeCapability({
    name: "files.inspectUrl",
    args: { url: "http://127.0.0.1/file.txt", options: { maxBytes: 20 } },
    api: { id: "api-1", path: "/api/file", scriptCapabilities: ["files.inspectUrl"] },
    context: { requestId: "req-1" },
    config: {
      capabilities: {
        files: {
          allowedProtocols: ["http:"],
          allowPrivateNetwork: true,
          maxBytes: 100,
          timeoutMs: 1000,
          maxRedirects: 1
        }
      }
    }
  });

  assert.equal(result.size, 5);
  assert.equal(result.contentType, "text/plain");
  assert.equal(result.downloaded, false);
});

test("files.downloadTemp saves a bounded file and returns size", async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssql-capability-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  mockHttpRequest(t, (url, options) => {
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(options.method, "GET");
    return {
      headers: {
        "content-type": "text/plain",
        "content-length": "11"
      },
      body: "hello world"
    };
  });

  const result = await executeCapability({
    name: "files.downloadTemp",
    args: { url: "http://127.0.0.1/hello.txt" },
    api: { id: "api-1", path: "/api/file", scriptCapabilities: ["files.downloadTemp"] },
    context: { requestId: "req-2" },
    config: {
      capabilities: {
        files: {
          tempDir,
          allowedProtocols: ["http:"],
          allowPrivateNetwork: true,
          maxBytes: 100,
          timeoutMs: 1000,
          maxRedirects: 1
        }
      }
    }
  });

  assert.equal(result.size, 11);
  assert.equal(result.filename.includes(result.fileId), true);
  const savedFiles = fs.readdirSync(path.join(tempDir, "req-2"));
  assert.equal(savedFiles.length, 1);
  assert.equal(fs.statSync(path.join(tempDir, "req-2", savedFiles[0])).size, 11);
});

test("file capability rejects unauthorized api", async () => {
  await assert.rejects(
    () => executeCapability({
      name: "files.inspectUrl",
      args: { url: "http://127.0.0.1/file.txt" },
      api: { id: "api-1", path: "/api/file", scriptCapabilities: [] },
      context: { requestId: "req-3" },
      config: {}
    }),
    /script capability is not allowed/
  );
});
