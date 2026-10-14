import { OpenRouter } from "@openrouter/sdk";
import { TOOLS } from "@/lib/constants";
import { saysActivityExists } from "@/lib/activities";
import { isEventStream, messageText } from "@/lib/llm-text";
import { getRepository, pushActivity } from "@/lib/tools";

type SendRequest = Parameters<OpenRouter["chat"]["send"]>[0];

export type ChatMessage = SendRequest["chatRequest"]["messages"][number];

const MAX_STEPS = 3;
const MODEL = process.env.OPENROUTER_MODEL?.trim() ?? "";
const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const client = new OpenRouter({ apiKey: API_KEY });

export async function collectChat(messages: ChatMessage[]) {
  const result = await client.chat.send({
    appTitle: "Activity",
    chatRequest: { model: MODEL, messages, stream: true },
  });
  if (!isEventStream(result)) return messageText(result.choices[0]?.message.content);

  let text = "";
  for await (const chunk of result) {
    if (chunk.error?.message) throw new Error(chunk.error.message);
    const delta = chunk.choices[0]?.delta.content;
    if (typeof delta === "string" && delta) text += delta;
  }
  return text;
}

export async function buildActivity(messages: ChatMessage[]) {
  let history = messages;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const turn = await client.chat.send({
      appTitle: "Activity",
      chatRequest: { model: MODEL, messages: history, stream: false, tools: TOOLS },
    });
    if (isEventStream(turn)) throw new Error("The model returned a stream instead of a tool call.");

    const choice = turn.choices[0];
    const assistant = choice?.message;
    if (!assistant) throw new Error("The model returned an empty reply.");
    const calls = assistant.toolCalls ?? [];
    const text = messageText(assistant.content);

    if (calls.length === 0) {
      if (saysActivityExists(text)) return "This activity already exists.";
      const fromText = text.includes('"component"') && text.includes('"css"') ? await pushActivity(text) : "";
      if (isCommitReply(fromText)) return fromText;
      console.error("Activity publish: no tool call", choice.finishReason ?? "");
      history = [
        ...history,
        { role: "assistant", content: text || null },
        { role: "user", content: fromText || "" },
      ];
      continue;
    }

    const results = [];
    for (const call of calls) {
      const content =
        call.function.name === "get_repository"
          ? await getRepository()
          : call.function.name === "push_activity"
            ? await pushActivity(call.function.arguments)
            : "Unknown tool.";
      if (call.function.name === "get_repository" && content.startsWith("GitHub")) return content;
      if (call.function.name === "push_activity" && isCommitReply(content)) return content;
      const safeCall =
        call.function.name === "push_activity"
          ? { ...call, function: { ...call.function, arguments: "{}" } }
          : call;
      results.push({ call: safeCall, content });
    }

    history = [
      ...history,
      { role: "assistant", content: text || null, toolCalls: results.map((item) => item.call) },
      ...results.map((item) => ({ role: "tool" as const, toolCallId: item.call.id, content: item.content })),
    ];
  }

  return "The activity could not be published.";
}

function isCommitReply(content: string) {
  return content === "This activity already exists." || content.startsWith("https://");
}
