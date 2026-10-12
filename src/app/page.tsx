import { Suspense } from "react";
import { PromptComposer } from "@/components/prompt-composer";

export default function Home() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <PromptComposer />
    </Suspense>
  );
}
