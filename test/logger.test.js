const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const { Logger } = require("../src/logger");

test("logger recreates data directory before writing server.log", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssql-logger-"));
  const logger = new Logger(dataDir);

  fs.rmSync(dataDir, { recursive: true, force: true });
  logger.info("directory recreated");

  const logFile = path.join(dataDir, "server.log");
  assert.equal(fs.existsSync(logFile), true);
  assert.match(fs.readFileSync(logFile, "utf8"), /directory recreated/);
});
