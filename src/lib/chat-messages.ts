import type { ChatMessage } from "@/lib/openrouter";
import { SYSTEM_PROMPT } from "@/lib/constants";

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

export function parseMessages(
  body: unknown,
): { ok: true; mode: "suggest" | "check"; messages: ChatMessage[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) {
    return { ok: false, error: "Send a prompt in the messages field." };
  }
  if (body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return { ok: false, error: "Send between 1 and 30 messages." };
  }

  const mode = "step" in body && body.step === "check" ? "check" : "suggest";
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

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
      content: images.length ? [...(text ? [{ type: "text" as const, text }] : []), ...images] : text,
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
