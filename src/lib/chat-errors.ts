import {
  OpenRouterError,
  PaymentRequiredResponseError,
  UnauthorizedResponseError,
} from "@openrouter/sdk/models/errors";

export function errorText(error: unknown) {
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
