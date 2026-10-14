"use client";

import type { ActivitySuggestion } from "@/lib/activities";

export function ActivityChoices({
  activities,
  disabled,
  onSelect,
}: {
  activities: ActivitySuggestion[];
  disabled: boolean;
  onSelect: (activity: ActivitySuggestion) => void;
}) {
  return (
    <ul className="mt-3 flex list-none flex-col gap-2 p-0">
      {activities.map((activity) => (
        <li key={activity.title}>
          <button
            type="button"
            disabled={disabled}
            className="w-full rounded-2xl border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
            onClick={() => onSelect(activity)}
          >
            <span className="block text-[15px] font-medium leading-6">{activity.title}</span>
            {activity.type && <span className="mt-1 block text-xs font-medium tracking-wide text-neutral-500 uppercase">{activity.type}</span>}
            <span className="mt-1 block text-sm leading-5 font-normal text-neutral-500">{activity.summary}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function readActivities(part: { type: string; data?: unknown }) {
  if (part.type !== "data-activities" || !Array.isArray(part.data)) return [];
  const activities: ActivitySuggestion[] = [];
  for (const item of part.data) {
    if (!item || typeof item !== "object") continue;
    const title = "title" in item && typeof item.title === "string" ? item.title : "";
    const summary = "summary" in item && typeof item.summary === "string" ? item.summary : "";
    const type = "type" in item && typeof item.type === "string" ? item.type.trim().slice(0, 40) : "";
    if (!title || !summary) continue;
    activities.push(type ? { title, summary, type } : { title, summary });
  }
  return activities;
}
