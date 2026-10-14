const MAX_SOURCE = 40000;

export function jsonObject(text: string) {
  const value = parseLooseJson(text);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseLooseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const slice = trimmed.slice(start, end + 1);
  for (const candidate of [slice, escapeQuotedControls(slice), slice.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }
  return null;
}

function escapeQuotedControls(value: string) {
  let out = "";
  let quoted = false;
  let escaped = false;
  for (const char of value) {
    if (!quoted) {
      if (char === '"') quoted = true;
      out += char;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += char;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      out += char;
      continue;
    }
    if (char === '"') {
      quoted = false;
      out += char;
      continue;
    }
    if (char === "\n") {
      out += "\\n";
      continue;
    }
    if (char === "\r") {
      out += "\\r";
      continue;
    }
    if (char === "\t") {
      out += "\\t";
      continue;
    }
    out += char;
  }
  return out;
}

export function slugFrom(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : "";
}

export function activityType(value: unknown) {
  if (typeof value !== "string") return undefined;
  const type = value.trim().replace(/\s+/g, " ").slice(0, 40);
  return type.length >= 2 && /^[\p{L}\p{N}][\p{L}\p{N} '&+-]*$/u.test(type) ? type : undefined;
}

export function isScreenComponent(source: string) {
  return isSafeSource(source) && source.includes("use client") && source.includes("./activity.css");
}

export function isActivityCss(source: string) {
  if (!source || source.length > MAX_SOURCE) return false;
  return !/expression\s*\(|javascript:|@import|<\/|url\s*\(\s*["']?https?:/i.test(source);
}

export function isScreenData(data: unknown): data is Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const record = data as Record<string, unknown>;
  const type = activityType(record.type);
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const content = Object.keys(record).filter((key) => key !== "type" && key !== "title");
  return Boolean(type && title && content.length > 0);
}

export function isSafeSource(source: string) {
  if (!source || source.length > MAX_SOURCE || !source.includes("export")) return false;
  return !/child_process|node:fs|from\s+["']fs["']|process\.env|dangerouslySetInnerHTML|\beval\s*\(|new\s+Function\s*\(|\.\.\//.test(source);
}

export function sourceWithinLimit(value: string) {
  return value.length <= MAX_SOURCE;
}
