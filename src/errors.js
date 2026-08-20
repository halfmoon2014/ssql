class AppError extends Error {
  // statusCode 会被 HTTP 层用于稳定生成响应状态和业务错误码。
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function codeFromStatus(statusCode) {
  // 非 HTTP 错误统一收敛为 500，避免向客户端暴露不稳定状态。
  if (statusCode >= 400 && statusCode < 600) return statusCode;
  return 500;
}

function ok(data) {
  return {
    code: 0,
    message: "ok",
    data
  };
}

function fail(error) {
  // sendError 只关心这个标准结构，所有模块抛出的 AppError 都在这里归一化。
  const statusCode = error.statusCode || 500;
  return {
    statusCode,
    body: {
      code: codeFromStatus(statusCode),
      message: error.message || "internal server error",
      data: error.details || null
    }
  };
}

module.exports = {
  AppError,
  fail,
  ok
};
