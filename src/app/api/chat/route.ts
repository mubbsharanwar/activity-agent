import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { isToolCallText, parseActivities } from "@/lib/activities";
import { errorText } from "@/lib/chat-errors";
import { parseMessages } from "@/lib/chat-messages";
import { buildActivity, collectChat, type ChatMessage } from "@/lib/openrouter";

export const maxDuration = 300;

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
        if (parsed.mode === "check") write(await buildActivity(parsed.messages));
        else await writeSuggestions(parsed.messages, write, (data) => writer.write({ type: "data-activities", id: "activities", data }));
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

async function writeSuggestions(
  messages: ChatMessage[],
  write: (delta: string) => void,
  writeActivities: (data: unknown) => void,
) {
  let raw = await collectChat(messages);
  let activities = parseActivities(raw);
  if (activities.length === 0 && isToolCallText(raw)) {
    raw = await collectChat([...messages, { role: "user", content: "Suggest the activities as JSON now. Do not call a tool." }]);
    activities = parseActivities(raw);
  }
  if (activities.length > 0) {
    write("Choose an activity.");
    writeActivities(activities);
    return;
  }
  write(isToolCallText(raw) ? "The model did not suggest any activities." : raw.trim() || "The model did not suggest any activities.");
}
