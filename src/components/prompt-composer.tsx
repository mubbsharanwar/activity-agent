"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ActivitySuggestion } from "@/lib/activities";
import { ChatMessage } from "@/components/chat-message";
import { Composer, type Attachment } from "@/components/composer";

const MAX_FILES = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 40000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "ts", "tsx", "js", "jsx", "py", "html", "css"]);

export function PromptComposer() {
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, stop, error } = useChat({ id: "home", transport });
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTo({ top: thread.scrollHeight });
  }, [messages, status]);

  async function addFiles(list: File[]) {
    const room = MAX_FILES - files.length;
    if (room <= 0) {
      setNotice("Attach up to 4 files.");
      return;
    }
    const next: Attachment[] = [];
    let problem: string | null = null;
    for (const file of list.slice(0, room)) {
      if (file.size > MAX_BYTES) {
        problem = `${file.name} is larger than 5 MB.`;
        continue;
      }
      const read = await readFile(file);
      next.push(read);
    }
    if (list.length > room) problem = "Attach up to 4 files.";
    if (next.length) setFiles((current) => [...current, ...next]);
    setNotice(problem);
  }

  function submit() {
    const uploads: FileUIPart[] = files.flatMap((file) => {
      if (file.file) return [file.file];
      if (!file.text) return [];
      return [
        {
          type: "file" as const,
          mediaType: "text/plain",
          filename: file.name,
          url: `data:text/plain,${encodeURIComponent(file.text)}`,
        },
      ];
    });
    const text = draft.trim() || files.map((file) => file.name).join(", ");
    if (!text && uploads.length === 0) return;
    void sendMessage(uploads.length ? { text, files: uploads } : { text });
    setDraft("");
    setFiles([]);
    setNotice(null);
  }

  function selectActivity(activity: ActivitySuggestion) {
    void sendMessage(
      { text: `Selected activity: ${activity.title}\nType: ${activity.type ?? "screen"}\n${activity.summary}` },
      { body: { step: "check" } },
    );
  }

  const composer = (
    <Composer
      draft={draft}
      files={files}
      busy={busy}
      fileInputRef={fileInputRef}
      onDraft={setDraft}
      onAttach={(selected) => void addFiles(selected)}
      onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
      onSubmit={submit}
      onStop={() => void stop()}
      canSubmit={draft.trim().length > 0 || files.length > 0}
    />
  );

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {messages.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <div className="w-full max-w-2xl">
            <h1 className="mb-6 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
              What should we work on?
            </h1>
            {composer}
            {notice && <p className="mt-3 text-center text-sm text-red-700 dark:text-red-300">{notice}</p>}
          </div>
        </main>
      ) : (
        <>
          <main ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
              {messages.map((message, messageIndex) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  choicesOpen={messageIndex === messages.length - 1 && !busy}
                  onSelect={selectActivity}
                />
              ))}
              {busy && <p className="text-sm text-neutral-500">Waiting for the reply…</p>}
              {error && <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>}
            </div>
          </main>
          <div className="px-4 pb-4">
            <div className="mx-auto w-full max-w-2xl">
              {composer}
              {notice && <p className="mt-2 text-sm text-red-700 dark:text-red-300">{notice}</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

async function readFile(file: File): Promise<Attachment> {
  const id = `${file.name}-${file.size}-${file.lastModified}`;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = file.type || "application/octet-stream";
  if (IMAGE_TYPES.has(mediaType)) {
    const url = await readDataUrl(file);
    return { id, name: file.name, size: file.size, mediaType, file: { type: "file", mediaType, filename: file.name, url } };
  }
  if (mediaType.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const text = (await file.text()).slice(0, MAX_TEXT);
    return { id, name: file.name, size: file.size, mediaType: mediaType.startsWith("text/") ? mediaType : "text/plain", text };
  }
  return { id, name: file.name, size: file.size, mediaType, text: `${file.name} was attached. Its contents could not be read as text.` };
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
