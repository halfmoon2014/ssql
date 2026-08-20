function pad(value, length = 2) {
  return String(value).padStart(length, "0");
}

function getChinaDateParts(date = new Date()) {
  // 日志面向国内排查，统一使用 UTC+08:00；用 UTC 字段避免受服务器本地时区影响。
  const chinaTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    year: chinaTime.getUTCFullYear(),
    month: chinaTime.getUTCMonth() + 1,
    day: chinaTime.getUTCDate(),
    hour: chinaTime.getUTCHours(),
    minute: chinaTime.getUTCMinutes(),
    second: chinaTime.getUTCSeconds(),
    millisecond: chinaTime.getUTCMilliseconds()
  };
}

function formatChinaTime(date = new Date()) {
  const parts = getChinaDateParts(date);
  return [
    `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    "T",
    `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.millisecond, 3)}`,
    "+08:00"
  ].join("");
}

function formatChinaFileTime(date = new Date()) {
  return formatChinaTime(date).replace(/[:.]/g, "-");
}

module.exports = {
  formatChinaTime,
  formatChinaFileTime
};
