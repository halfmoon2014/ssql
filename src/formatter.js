const prettier = require("prettier");
const { format: formatSql } = require("sql-formatter");
const xmlFormatterModule = require("xml-formatter");
const { AppError } = require("./errors");

const formatXml = xmlFormatterModule.default || xmlFormatterModule;

function normalizeText(text) {
  if (typeof text !== "string") throw new AppError(400, "format text must be string");
  if (text.length > 200000) throw new AppError(413, "format text is too large");
  return text;
}

function detectSqlKind(text, requestedMode = "auto") {
  if (requestedMode === "sql" || requestedMode === "xml") return requestedMode;
  const value = text.trim();
  if (!value) return "sql";
  // MyBatis 片段通常以 XML 标签承载 SQL；用标签特征判断，避免把比较符误判为 XML。
  if (/^<\??[a-zA-Z]/.test(value)) return "xml";
  if (/<\/?(select|insert|update|delete|where|if|choose|when|otherwise|foreach|trim|set|script|mapper)\b/i.test(value)) return "xml";
  return "sql";
}

async function formatJavaScript(text) {
  return prettier.format(normalizeText(text), {
    parser: "babel",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none",
    semi: true
  });
}

async function formatJson(text) {
  return prettier.format(normalizeText(text), {
    parser: "json",
    printWidth: 100
  });
}

function summarizeFormatError(error) {
  return String(error && error.message || "format failed").split("\n")[0].slice(0, 180);
}

function formatRawSql(text, dialect = "mysql") {
  const normalized = normalizeText(text);
  try {
    return {
      text: formatSql(normalized, {
        language: dialect || "mysql",
        keywordCase: "lower",
        linesBetweenQueries: 1
      })
    };
  } catch (error) {
    // 解析失败时不改写 SQL，避免兜底格式化破坏方言片段、存储过程或用户原始排版。
    return {
      text: normalized,
      skipped: true,
      warning: `SQL 解析失败，已保留原内容: ${summarizeFormatError(error)}`
    };
  }
}

function formatMyBatisXml(text) {
  return formatXml(normalizeText(text), {
    indentation: "  ",
    collapseContent: false,
    lineSeparator: "\n"
  });
}

async function formatCode(input = {}) {
  const language = String(input.language || "").toLowerCase();
  if (language === "javascript" || language === "js") {
    return {
      kind: "js",
      text: await formatJavaScript(input.text)
    };
  }
  if (language === "json") {
    return {
      kind: "json",
      text: await formatJson(input.text)
    };
  }
  if (language === "sql") {
    const kind = detectSqlKind(normalizeText(input.text), input.sqlMode);
    const formatted = kind === "xml"
      ? { text: formatMyBatisXml(input.text) }
      : formatRawSql(input.text, input.dialect);
    return {
      kind,
      ...formatted
    };
  }
  if (language === "xml") {
    return {
      kind: "xml",
      text: formatMyBatisXml(input.text)
    };
  }
  throw new AppError(400, "unsupported format language");
}

module.exports = {
  detectSqlKind,
  formatCode
};
