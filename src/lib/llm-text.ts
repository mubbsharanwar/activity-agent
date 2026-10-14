import type { ChatResult, ChatStreamChunk } from "@openrouter/sdk/models";

export function messageText(content: ChatResult["choices"][number]["message"]["content"] | null | undefined) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
    .join("");
}

export function isEventStream(value: ChatResult | AsyncIterable<ChatStreamChunk>): value is AsyncIterable<ChatStreamChunk> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}
