export type ActivitySuggestion = {
  title: string;
  summary: string;
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
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  let value: unknown;
  try {
    value = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return [];
  }

  const list =
    value && typeof value === "object" && "activities" in value && Array.isArray(value.activities)
      ? value.activities
      : [];
  const activities: ActivitySuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const title = "title" in item && typeof item.title === "string" ? item.title.trim().slice(0, 120) : "";
    const summary = "summary" in item && typeof item.summary === "string" ? item.summary.trim().slice(0, 400) : "";
    if (!title || !summary) continue;
    activities.push({ title, summary });
    if (activities.length === MAX_ACTIVITIES) break;
  }
  return activities;
}
