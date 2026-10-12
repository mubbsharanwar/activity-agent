import {
  OpenRouterError,
  PaymentRequiredResponseError,
  UnauthorizedResponseError,
} from "@openrouter/sdk/models/errors";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { isToolCallText, parseActivities } from "@/lib/activities";
import { streamChat, type ChatMessage } from "@/lib/openrouter";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;

const MAX_MESSAGES = 30;
const MAX_TEXT = 60000;
const MAX_IMAGES = 4;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

type IncomingPart = {
  type?: unknown;
  text?: unknown;
  url?: unknown;
  mediaType?: unknown;
  filename?: unknown;
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request was not valid JSON." }, { status: 400 });
  }

  const parsed = parseMessages(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const replyId = "reply";
      const write = (delta: string) => {
        writer.write({ type: "text-delta", id: replyId, delta });
      };

      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: replyId });
      try {
        if (parsed.mode === "check") {
          let raw = "";
          await streamChat(parsed.messages, (delta) => {
            raw += delta;
          }, "check");
          const reply = isToolCallText(raw) ? "" : raw.trim();
          write(reply || "The model returned an empty reply.");
        } else {
          let raw = "";
          const collect = (delta: string) => {
            raw += delta;
          };
          await streamChat(parsed.messages, collect, "suggest");
          let activities = parseActivities(raw);
          if (activities.length === 0 && isToolCallText(raw)) {
            raw = "";
            await streamChat(
              [
                ...parsed.messages,
                {
                  role: "user",
                  content: "Suggest the activities as JSON now. Do not call a tool.",
                },
              ],
              collect,
              "suggest",
            );
            activities = parseActivities(raw);
          }
          if (activities.length > 0) {
            write("Choose an activity.");
            writer.write({ type: "data-activities", id: "activities", data: activities });
          } else if (isToolCallText(raw)) {
            write("The model did not suggest any activities.");
          } else {
            write(raw.trim() || "The model did not suggest any activities.");
          }
        }
      } catch (error) {
        const reply = errorText(error);
        console.error("Error in streamChat", reply);
        write(reply);
      }
      writer.write({ type: "text-end", id: replyId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function parseMessages(
  body: unknown,
): { ok: true; mode: "suggest" | "check"; messages: ChatMessage[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) {
    return { ok: false, error: "Send a prompt in the messages field." };
  }
  if (body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return { ok: false, error: "Send between 1 and 30 messages." };
  }

  const mode = "step" in body && body.step === "check" ? "check" : "suggest";
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
  ];

  for (const message of body.messages) {
    if (!message || typeof message !== "object") return { ok: false, error: "A message is invalid." };
    const role = "role" in message ? message.role : undefined;
    const parts: unknown[] = "parts" in message && Array.isArray(message.parts) ? message.parts : [];
    if (role !== "user" && role !== "assistant") continue;

    const text = parts
      .map((part) => readPart(part))
      .filter((part) => part.text)
      .map((part) => part.text)
      .join("\n\n")
      .slice(0, MAX_TEXT);
    const images = parts.flatMap((part) => {
      const read = readPart(part);
      return read.image ? [read.image] : [];
    });

    if (role === "assistant") {
      if (text) messages.push({ role: "assistant", content: text });
      continue;
    }

    if (!text && images.length === 0) continue;
    if (images.length > MAX_IMAGES) return { ok: false, error: "Attach up to 4 images." };
    messages.push({
      role: "user",
      content: images.length
        ? [...(text ? [{ type: "text" as const, text }] : []), ...images]
        : text,
    });
  }

  const hasUser = messages.some((message) => message.role === "user");
  if (!hasUser) return { ok: false, error: "Write a prompt or attach a file." };
  return { ok: true, mode, messages };
}

function readPart(part: unknown) {
  if (!part || typeof part !== "object") return { text: "", image: undefined };
  const entry = part as IncomingPart;
  if (entry.type === "text" && typeof entry.text === "string") {
    return { text: entry.text.trim(), image: undefined };
  }
  if (entry.type !== "file" || typeof entry.url !== "string") return { text: "", image: undefined };

  const mediaType = typeof entry.mediaType === "string" ? entry.mediaType : "";
  const filename = typeof entry.filename === "string" ? entry.filename : "file";
  if (IMAGE_TYPES.has(mediaType) && entry.url.startsWith(`data:${mediaType}`) && entry.url.length < 6000000) {
    return { text: "", image: { type: "image_url" as const, imageUrl: { url: entry.url } } };
  }
  if (mediaType.startsWith("text/") && entry.url.startsWith("data:")) {
    const decoded = decodeDataUrl(entry.url).slice(0, MAX_TEXT);
    return { text: decoded ? `File: ${filename}\n${decoded}` : "", image: undefined };
  }
  return { text: `File attached: ${filename}`, image: undefined };
}

function decodeDataUrl(url: string) {
  const comma = url.indexOf(",");
  if (comma === -1) return "";
  const meta = url.slice(0, comma);
  const data = url.slice(comma + 1);
  try {
    return meta.includes(";base64") ? Buffer.from(data, "base64").toString("utf8") : decodeURIComponent(data);
  } catch {
    return "";
  }
}

function errorText(error: unknown) {
  if (error instanceof UnauthorizedResponseError) {
    return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.local.";
  }
  if (error instanceof PaymentRequiredResponseError) {
    return creditMessage(error.error.message);
  }
  if (error instanceof OpenRouterError) {
    return error.message.trim() || "The reply failed. Try again.";
  }
  if (error instanceof Error && error.message.startsWith("Add OPENROUTER_API_KEY")) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "The reply failed. Try again.";
}

function creditMessage(message: string) {
  const requested = message.match(/up to ([\d,]+) tokens/);
  const affordable = message.match(/only afford ([\d,]+)/);
  const asked = requested ? ` The request asked for ${Number(requested[1].replace(/,/g, "")).toLocaleString()} tokens.` : "";
  const covered = affordable
    ? ` This key can cover about ${Number(affordable[1].replace(/,/g, "")).toLocaleString()} tokens.`
    : "";
  return `OpenRouter does not have enough credits for this reply.${asked}${covered} Add credits at https://openrouter.ai/settings/credits.`;
}
