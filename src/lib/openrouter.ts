import { OpenRouter } from "@openrouter/sdk";
import type { ChatResult, ChatStreamChunk } from "@openrouter/sdk/models";
import { getRepository } from "@/lib/github-repo";
import { isToolCallText } from "@/lib/activities";
import { TOOL_CHOICE, TOOLS } from "@/lib/tools";

type SendRequest = Parameters<OpenRouter["chat"]["send"]>[0];

export type ChatMessage = SendRequest["chatRequest"]["messages"][number];

let client: OpenRouter | undefined;

export function openRouterModel() {
  const model = process.env.OPENROUTER_MODEL?.trim();
  if (!model) {
    throw new Error("Add OPENROUTER_MODEL to .env.local and restart the dev server.");
  }
  return model;
}

export function openRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Add OPENROUTER_API_KEY to .env.local and restart the dev server.");
  }
  client ??= new OpenRouter({ apiKey });
  return client;
}

export async function streamChat(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
  mode: "suggest" | "check",
) {
  const client = openRouter();
  const model = openRouterModel();
  if (mode === "suggest") {
    await streamReply(client, model, messages, onDelta);
    return;
  }

  const toolTurn = await client.chat.send({
    appTitle: "Activity",
    chatRequest: {
      model,
      messages,
      stream: false,
      tools: TOOLS,
      toolChoice: TOOL_CHOICE,
    },
  });
  if (isEventStream(toolTurn)) {
    throw new Error("The model returned a stream instead of a tool call.");
  }

  const assistant = toolTurn.choices[0]?.message;
  const returnedCall = assistant?.toolCalls?.find((call) => call.function.name === "get_repository");
  const toolCall = returnedCall ?? {
    id: "get_repository",
    type: "function" as const,
    function: { name: "get_repository", arguments: "{}" },
  };
  const spoken = messageText(assistant?.content);
  const context = await getRepository();
  await streamReply(
    client,
    model,
    [
      ...messages,
      {
        role: "assistant",
        content: isToolCallText(spoken) ? null : assistant?.content ?? null,
        toolCalls: [toolCall],
      },
      {
        role: "tool",
        toolCallId: toolCall.id,
        content: context,
      },
    ],
    onDelta,
  );
}

async function streamReply(
  client: OpenRouter,
  model: string,
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
) {
  const result = await client.chat.send({
    appTitle: "Activity",
    chatRequest: {
      model,
      messages,
      stream: true,
    },
  });

  if (!isEventStream(result)) {
    const text = messageText(result.choices[0]?.message.content);
    if (text) onDelta(text);
    return;
  }

  for await (const chunk of result) {
    if (chunk.error?.message) throw new Error(chunk.error.message);
    const delta = chunk.choices[0]?.delta.content;
    if (typeof delta === "string" && delta) onDelta(delta);
  }
}

function messageText(content: ChatResult["choices"][number]["message"]["content"] | null | undefined) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? String(part.text ?? "") : ""))
    .join("");
}

function isEventStream(value: ChatResult | AsyncIterable<ChatStreamChunk>): value is AsyncIterable<ChatStreamChunk> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}
