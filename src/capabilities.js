const crypto = require("crypto");
const dns = require("dns").promises;
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const { AppError } = require("./errors");

const knownCapabilities = new Set([
  "files.inspectUrl",
  "files.downloadTemp"
]);

function normalizeScriptCapabilities(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  const output = [];
  for (const item of source || []) {
    const name = String(item || "").trim();
    if (knownCapabilities.has(name) && !output.includes(name)) output.push(name);
  }
  return output;
}

function normalizeFilesConfig(config = {}) {
  const files = (config.capabilities && config.capabilities.files) || {};
  return {
    tempDir: files.tempDir,
    maxBytes: Number(files.maxBytes),
    timeoutMs: Number(files.timeoutMs),
    maxRedirects: Number(files.maxRedirects),
    allowedProtocols: Array.isArray(files.allowedProtocols) ? files.allowedProtocols : [],
    allowedHosts: Array.isArray(files.allowedHosts) ? files.allowedHosts : [],
    allowPrivateNetwork: Boolean(files.allowPrivateNetwork)
  };
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) {
    const normalized = ip.toLowerCase();
    return normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
      || normalized.startsWith("::ffff:127.")
      || normalized.startsWith("::ffff:10.")
      || normalized.startsWith("::ffff:192.168.");
  }
  return false;
}

function assertAllowedProtocol(url, filesConfig) {
  if (!filesConfig.allowedProtocols.includes(url.protocol)) {
    throw new AppError(403, "file capability protocol is not allowed");
  }
}

async function assertAllowedHost(url, filesConfig) {
  const hostname = url.hostname.toLowerCase();
  // 输出最终参与校验的 hostname，便于后端排查请求目标与域名解析问题。
  console.log("[capabilities] assertAllowedHost hostname:", hostname);
  if (filesConfig.allowedHosts.length > 0 && !filesConfig.allowedHosts.includes(hostname)) {
    throw new AppError(403, "file capability host is not allowed");
  }
  if (filesConfig.allowPrivateNetwork) return;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new AppError(403, "file capability private host is not allowed");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new AppError(403, "file capability private ip is not allowed");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true });
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new AppError(403, "file capability private ip is not allowed");
  }
}

async function validateUrl(rawUrl, filesConfig) {
   console.log("[capabilities] validateUrl rawUrl:", rawUrl);
  if (typeof rawUrl !== "string" || rawUrl.length > 2048) {
    throw new AppError(400, "file capability url is invalid");
  }
  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new AppError(400, "file capability url is invalid");
  }
  assertAllowedProtocol(url, filesConfig);
  await assertAllowedHost(url, filesConfig);
  return url;
}

function requestUrl(url, method, filesConfig) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "http:" ? http : https;
    const request = client.request(url, {
      method,
      timeout: filesConfig.timeoutMs,
      headers: {
        "user-agent": "ssql-file-capability/1.0",
        "accept": "*/*"
      }
    }, resolve);
    request.on("timeout", () => {
      request.destroy(new AppError(408, "file capability request timeout"));
    });
    request.on("error", reject);
    request.end();
  });
}

async function openResponse(rawUrl, method, filesConfig, redirectCount = 0) {
  const url = await validateUrl(rawUrl, filesConfig);
  const response = await requestUrl(url, method, filesConfig);
  const location = response.headers.location;
  if ([301, 302, 303, 307, 308].includes(Number(response.statusCode)) && location) {
    response.resume();
    if (redirectCount >= filesConfig.maxRedirects) {
      throw new AppError(400, "file capability redirects exceeded");
    }
    const nextUrl = new URL(location, url);
    return openResponse(nextUrl.toString(), method === "HEAD" ? "HEAD" : "GET", filesConfig, redirectCount + 1);
  }
  if (Number(response.statusCode) < 200 || Number(response.statusCode) >= 300) {
    response.resume();
    throw new AppError(400, "file capability request failed", { statusCode: response.statusCode });
  }
  return { url, response };
}

function contentLength(response) {
  const raw = response.headers["content-length"];
  if (raw === undefined) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function safeFilename(url) {
  const original = path.basename(decodeURIComponent(url.pathname || "")) || "download";
  const cleaned = original.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  return cleaned || "download";
}

function consumeResponse(response, { maxBytes, outputFile = null }) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    let settled = false;
    let writer = null;

    function finish(error) {
      if (settled) return;
      settled = true;
      if (writer) writer.destroy();
      if (error && outputFile) fs.rm(outputFile, { force: true }, () => {});
      error ? reject(error) : resolve(bytes);
    }

    if (outputFile) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      writer = fs.createWriteStream(outputFile);
      writer.on("error", finish);
    }

    response.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        response.destroy();
        finish(new AppError(413, "file capability max size exceeded"));
        return;
      }
      if (writer) writer.write(chunk);
    });
    response.on("end", () => {
      if (writer) writer.end(() => finish(null));
      else finish(null);
    });
    response.on("error", finish);
  });
}

function buildFileResult(url, response, size, extra = {}) {
  return {
    url: url.toString(),
    contentType: response.headers["content-type"] || "",
    size,
    ...extra
  };
}

async function inspectUrl(args, filesConfig) {
  const rawUrl = args && args.url;
  const maxBytes = Math.min(Number(args && args.options && args.options.maxBytes) || filesConfig.maxBytes, filesConfig.maxBytes);
  try {
    const { url, response } = await openResponse(rawUrl, "HEAD", filesConfig);
    const size = contentLength(response);
    response.resume();
    if (size !== null) {
      if (size > maxBytes) throw new AppError(413, "file capability max size exceeded");
      return buildFileResult(url, response, size, { downloaded: false });
    }
  } catch (error) {
    if (error.statusCode && ![400, 405, 501].includes(error.statusCode)) throw error;
  }

  const { url, response } = await openResponse(rawUrl, "GET", filesConfig);
  const announcedSize = contentLength(response);
  if (announcedSize !== null && announcedSize > maxBytes) {
    response.resume();
    throw new AppError(413, "file capability max size exceeded");
  }
  const size = await consumeResponse(response, { maxBytes });
  return buildFileResult(url, response, size, { downloaded: true });
}

async function downloadTemp(args, filesConfig, context = {}) {
  const rawUrl = args && args.url;
  const maxBytes = Math.min(Number(args && args.options && args.options.maxBytes) || filesConfig.maxBytes, filesConfig.maxBytes);
  const { url, response } = await openResponse(rawUrl, "GET", filesConfig);
  const announcedSize = contentLength(response);
  if (announcedSize !== null && announcedSize > maxBytes) {
    response.resume();
    throw new AppError(413, "file capability max size exceeded");
  }
  const fileId = crypto.randomUUID();
  const requestPart = String(context.requestId || "manual").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  const outputFile = path.join(filesConfig.tempDir, requestPart, `${fileId}-${safeFilename(url)}`);
  const size = await consumeResponse(response, { maxBytes, outputFile });
  return buildFileResult(url, response, size, {
    fileId,
    filename: path.basename(outputFile)
  });
}

async function executeCapability({ name, args, api, context, config, logger }) {
  const startedAt = Date.now();
  const allowed = new Set(normalizeScriptCapabilities(api && api.scriptCapabilities, []));
  try {
    if (!knownCapabilities.has(name)) throw new AppError(400, "unknown script capability");
    if (!allowed.has(name)) throw new AppError(403, "script capability is not allowed");

    const filesConfig = normalizeFilesConfig(config);
    const result = name === "files.inspectUrl"
      ? await inspectUrl(args, filesConfig)
      : await downloadTemp(args, filesConfig, context);

    if (logger) {
      logger.info("script capability executed", {
        requestId: context && context.requestId,
        apiId: api && api.id,
        apiPath: api && api.path,
        capability: name,
        durationMs: Date.now() - startedAt,
        size: result.size
      });
    }
    return result;
  } catch (error) {
    if (logger) {
      logger.info("script capability failed", {
        requestId: context && context.requestId,
        apiId: api && api.id,
        apiPath: api && api.path,
        capability: name,
        durationMs: Date.now() - startedAt,
        errorMessage: error.message
      });
    }
    throw error;
  }
}

module.exports = {
  executeCapability,
  knownCapabilities,
  normalizeFilesConfig,
  normalizeScriptCapabilities
};
