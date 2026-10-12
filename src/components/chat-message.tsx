"use client";

import type { UIMessage } from "ai";
import type { ActivitySuggestion } from "@/lib/activities";
import { ActivityChoices, readActivities } from "@/components/activity-choices";

export function ChatMessage({
  message,
  choicesOpen,
  onSelect,
}: {
  message: UIMessage;
  choicesOpen: boolean;
  onSelect: (activity: ActivitySuggestion) => void;
}) {
  return (
    <article className={message.role === "user" ? "ml-auto max-w-[85%]" : "max-w-full"}>
      <p className="mb-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">
        {message.role === "user" ? "You" : "Reply"}
      </p>
      <div
        className={
          message.role === "user"
            ? "rounded-3xl bg-neutral-100 px-4 py-3 text-[15px] leading-6 whitespace-pre-wrap dark:bg-neutral-900"
            : "text-[15px] leading-7 whitespace-pre-wrap"
        }
      >
        {message.parts.map((part, index) => {
          if (part.type === "text") return <span key={index}>{part.text}</span>;
          if (part.type === "file") {
            return (
              <span key={index} className="mt-2 block text-sm text-neutral-500">
                {part.filename || "Attached file"}
              </span>
            );
          }
          const activities = readActivities(part);
          if (!activities.length) return null;
          return <ActivityChoices key={index} activities={activities} disabled={!choicesOpen} onSelect={onSelect} />;
        })}
      </div>
    </article>
  );
}
