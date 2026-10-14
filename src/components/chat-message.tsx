"use client";

import type { ReactNode } from "react";
import type { UIMessage } from "ai";
import type { ActivitySuggestion } from "@/lib/activities";
import { ActivityChoices, readActivities } from "@/components/activity-choices";

const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;

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
          if (part.type === "text") return <MessageText key={index} text={part.text} />;
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

function MessageText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    const label = match[1];
    const markdownHref = match[2];
    const bareUrl = match[3];
    if (label && markdownHref) {
      parts.push(
        <TextLink key={start} href={markdownHref}>
          {label}
        </TextLink>,
      );
    } else if (bareUrl) {
      const { href, trailing } = trimUrl(bareUrl);
      parts.push(
        <TextLink key={start} href={href}>
          {href}
        </TextLink>,
      );
      if (trailing) parts.push(trailing);
    }
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function TextLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  );
}

function trimUrl(url: string) {
  let href = url;
  let trailing = "";
  while (/[),.;!?]$/.test(href)) {
    trailing = href.slice(-1) + trailing;
    href = href.slice(0, -1);
  }
  return { href, trailing };
}
