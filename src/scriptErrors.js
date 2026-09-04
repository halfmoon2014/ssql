const capabilityMessageCodes = [
  [/script capability is not allowed/i, "CAPABILITY_NOT_ALLOWED"],
  [/unknown script capability/i, "CAPABILITY_UNKNOWN"],
  [/file capability url is invalid/i, "FILE_URL_INVALID"],
  [/file capability protocol is not allowed/i, "FILE_PROTOCOL_NOT_ALLOWED"],
  [/file capability host is not allowed/i, "FILE_HOST_NOT_ALLOWED"],
  [/file capability private host is not allowed/i, "FILE_PRIVATE_HOST_NOT_ALLOWED"],
  [/file capability private ip is not allowed/i, "FILE_PRIVATE_IP_NOT_ALLOWED"],
  [/file capability max size exceeded/i, "FILE_TOO_LARGE"],
  [/file capability request timeout/i, "FILE_TIMEOUT"],
  [/file capability redirects exceeded/i, "FILE_REDIRECTS_EXCEEDED"],
  [/file capability request failed/i, "FILE_REQUEST_FAILED"],
  [/api call depth exceeded/i, "CALL_API_DEPTH_EXCEEDED"],
  [/circular api call detected/i, "CALL_API_CIRCULAR"],
  [/api not found/i, "CALL_API_NOT_FOUND"],
  [/callApi path must start/i, "CALL_API_PATH_INVALID"],
  [/callApi cannot call admin api/i, "CALL_API_FORBIDDEN"],
  [/callApi params must be object/i, "CALL_API_PARAMS_INVALID"],
  [/callApi options must be object/i, "CALL_API_OPTIONS_INVALID"]
];

function codeFromMessage(message, fallbackCode) {
  const text = String(message || "");
  for (const [pattern, code] of capabilityMessageCodes) {
    if (pattern.test(text)) return code;
  }
  return fallbackCode;
}

function publicMessage(message, fallbackMessage) {
  const text = String(message || "").trim();
  return text || fallbackMessage;
}

function normalizeScriptError(error, context = {}) {
  // 脚本只接收稳定错误码和安全消息；底层堆栈、URL、SQL 等细节只写服务端日志。
  const message = publicMessage(error && error.message, context.fallbackMessage || "script capability failed");
  const fallbackCode = context.capability && String(context.capability).startsWith("files.")
    ? "FILE_CAPABILITY_FAILED"
    : "CALL_API_FAILED";
  return {
    ok: false,
    capability: context.capability || "callApi",
    code: codeFromMessage(message, fallbackCode),
    message,
    statusCode: Number(error && error.statusCode) || Number(context.statusCode) || 500,
    details: null
  };
}

module.exports = {
  normalizeScriptError
};
