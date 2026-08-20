const fs = require("fs");
const path = require("path");
const { formatChinaTime } = require("./time");

function serializeError(error) {
  // 日志保留 stack 和 details，HTTP 响应层再决定是否返回给客户端。
  if (!error) return null;
  return {
    name: error.name,
    code: error.code || null,
    message: error.message,
    statusCode: error.statusCode || 500,
    details: error.details || null,
    stack: error.stack
  };
}

class Logger {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.logFile = path.join(dataDir, "server.log");
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  write(level, message, meta = {}) {
    // 结构化 JSON 日志同时写 stdout 和文件，便于容器日志与本地排查共用。
    const entry = {
      time: formatChinaTime(),
      level,
      message,
      ...meta
    };
    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
    // data/ 可能被人工清理；写文件前重新确保目录存在，避免日志本身导致进程异常。
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.appendFileSync(this.logFile, `${line}\n`);
  }

  info(message, meta = {}) {
    this.write("info", message, meta);
  }

  error(message, error, meta = {}) {
    this.write("error", message, {
      ...meta,
      error: serializeError(error)
    });
  }
}

module.exports = {
  Logger
};
