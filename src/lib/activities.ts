import { activityType, isActivityCss, isSafeSource, isScreenComponent, isScreenData, jsonObject, slugFrom, sourceWithinLimit } from "@/lib/activity-checks";

export type ActivitySuggestion = {
  title: string;
  summary: string;
  type?: string;
};

export type ActivityCode = {
  slug: string;
  title: string;
  component: string;
  page: string;
  css: string;
  data: Record<string, unknown>;
};

const MAX_ACTIVITIES = 3;

export function isToolCallText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const value = JSON.parse(trimmed) as { tool?: unknown; name?: unknown };
    return value.tool === "get_repository" || value.name === "get_repository";
  } catch {
    return trimmed.includes('"get_repository"') && trimmed.includes('"tool"');
  }
}

export function parseActivities(text: string): ActivitySuggestion[] {
  const value = jsonObject(text);
  const list = value && Array.isArray(value.activities) ? value.activities : [];
  const activities: ActivitySuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title = "title" in item && typeof item.title === "string" ? item.title.trim().slice(0, 120) : "";
    const summary = "summary" in item && typeof item.summary === "string" ? item.summary.trim().slice(0, 400) : "";
    const type = "type" in item ? activityType(item.type) : undefined;
    if (!title || !summary) continue;
    activities.push(type ? { title, summary, type } : { title, summary });
    if (activities.length === MAX_ACTIVITIES) break;
  }
  return activities;
}

export function saysActivityExists(text: string) {
  if (/does not already exist|doesn't already exist|do not already exist/i.test(text)) return false;
  return /activit(?:y|ies) already exist/i.test(text);
}

export function activityFromPayload(raw: unknown): { kind: "exists" } | { kind: "create"; activity: ActivityCode } | { kind: "invalid"; reason: string } {
  const text = payloadText(raw);
  const record = jsonObject(text) ?? looseActivityRecord(text);
  if (!record) return { kind: "invalid", reason: "The arguments were not valid JSON." };
  if (typeof record.data === "string") {
    const data = jsonObject(record.data);
    if (!data) return { kind: "invalid", reason: "data must be an object." };
    record.data = data;
  }
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const data = record.data as Record<string, unknown>;
    if (!activityType(data.type) && activityType(record.type)) data.type = record.type;
    if ((typeof data.title !== "string" || !data.title.trim()) && typeof record.title === "string") data.title = record.title;
    if ((typeof record.title !== "string" || !record.title.trim()) && typeof data.title === "string") record.title = data.title;
  }

  const decision = parseActivityCode(JSON.stringify({ ...record, exists: record.exists === true }));
  if (decision?.kind === "exists") return decision;
  if (decision?.kind === "create") return decision;
  return { kind: "invalid", reason: activityProblem(record) };
}

function payloadText(raw: unknown) {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") return JSON.stringify(raw);
  return "";
}

const PAYLOAD_KEYS = ["slug", "title", "component", "page", "css", "data"];

function looseActivityRecord(text: string) {
  const record: Record<string, unknown> = {};
  for (const key of ["slug", "title", "component", "page", "css"]) {
    const value = looseString(text, key);
    if (value !== null) record[key] = value;
  }
  const data = looseData(text);
  if (data) record.data = data;
  return typeof record.component === "string" && typeof record.css === "string" ? record : null;
}

function looseString(text: string, key: string) {
  const start = new RegExp(`"${key}"\\s*:\\s*"`).exec(text);
  if (!start) return null;
  const from = start.index + start[0].length;
  let endAt = -1;
  for (const next of PAYLOAD_KEYS) {
    if (next === key) continue;
    const end = new RegExp(`"\\s*,\\s*"${next}"\\s*:`).exec(text.slice(from));
    if (end && (endAt === -1 || end.index < endAt)) endAt = end.index;
  }
  const raw = endAt === -1 ? text.slice(from).replace(/"\s*}\s*$/, "") : text.slice(from, from + endAt);
  return raw.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"');
}

function looseData(text: string) {
  const start = /"data"\s*:\s*/.exec(text);
  if (!start) return null;
  let index = start.index + start[0].length;
  while (text[index] === " " || text[index] === "\n") index += 1;
  if (text[index] === '"') {
    const raw = looseString(text, "data");
    return raw ? jsonObject(raw) : null;
  }
  if (text[index] !== "{") return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return jsonObject(text.slice(index, cursor + 1));
    }
  }
  return null;
}

function activityProblem(record: Record<string, unknown>) {
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const slug = slugFrom(typeof record.slug === "string" ? record.slug : title);
  const component = typeof record.component === "string" ? record.component.trim() : "";
  const css = typeof record.css === "string" ? record.css.trim() : "";
  const data = record.data;
  if (!title) return "Add a title.";
  if (!slug) return "Use a slug of lowercase letters, numbers, and hyphens.";
  if (!isScreenComponent(component)) {
    if (!component.includes("use client")) return 'The component must include "use client".';
    if (!component.includes("./activity.css")) return 'The component must import "./activity.css".';
    return "The component must export the screen and must not use network, filesystem, eval, or imports outside its folder.";
  }
  if (!css) return "Add the activity css.";
  if (!isActivityCss(css)) return "The css must be local styles, with no @import, remote urls, or HTML.";
  if (!isScreenData(data)) return "data needs a short type, a title, and the screen content.";
  return "data is too large.";
}

export function parseActivityCode(text: string): { kind: "exists" } | { kind: "create"; activity: ActivityCode } | null {
  const value = jsonObject(text);
  if (!value) return /this activity already exists/i.test(text) ? { kind: "exists" } : null;
  if (value.exists === true) return { kind: "exists" };
  if (value.exists !== false) return null;

  const title = typeof value.title === "string" ? value.title.trim().slice(0, 120) : "";
  const slug = slugFrom(typeof value.slug === "string" ? value.slug : title);
  const component = typeof value.component === "string" ? value.component.trim() : "";
  const page = typeof value.page === "string" ? value.page.trim() : "";
  const css = typeof value.css === "string" ? value.css.trim() : "";
  const data = value.data;
  if (!title || !slug || !isScreenComponent(component) || !isActivityCss(css) || !isScreenData(data)) return null;
  if (!sourceWithinLimit(JSON.stringify(data))) return null;
  return {
    kind: "create",
    activity: {
      slug,
      title,
      component,
      page: isSafeSource(page) ? page : "",
      css,
      data,
    },
  };
}
