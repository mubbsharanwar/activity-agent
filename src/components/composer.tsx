"use client";

import type { RefObject } from "react";
import type { FileUIPart } from "ai";

export type Attachment = {
  id: string;
  name: string;
  size: number;
  mediaType: string;
  text?: string;
  file?: FileUIPart;
};

export function Composer({
  draft,
  files,
  busy,
  fileInputRef,
  onDraft,
  onAttach,
  onRemove,
  onSubmit,
  onStop,
  canSubmit,
}: {
  draft: string;
  files: Attachment[];
  busy: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onDraft: (value: string) => void;
  onAttach: (files: File[]) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  canSubmit: boolean;
}) {
  return (
    <form
      className="rounded-3xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      {files.length > 0 && (
        <ul className="mb-2 flex gap-2 overflow-x-auto">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-2xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
              <span>
                {file.name}
                <span className="block text-xs text-neutral-500">{formatBytes(file.size)}</span>
              </span>
              <button type="button" className="px-1 text-base" aria-label={`Remove ${file.name}`} onClick={() => onRemove(file.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="sr-only" htmlFor="prompt">
        Prompt
      </label>
      <textarea
        id="prompt"
        value={draft}
        rows={3}
        placeholder="Describe a topic, or attach a file"
        className="w-full resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none placeholder:text-neutral-500"
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!busy) onSubmit();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:bg-neutral-900"
          onClick={() => fileInputRef.current?.click()}
        >
          Attach file
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label="Choose files"
          onChange={(event) => {
            const input = event.currentTarget;
            if (input.dataset.reading === "true") return;
            const selected = [...(input.files ?? [])];
            input.dataset.reading = "true";
            input.value = "";
            delete input.dataset.reading;
            if (selected.length) onAttach(selected);
          }}
        />
        <div className="flex-1" />
        {busy ? (
          <button
            type="button"
            className="inline-flex h-11 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={onStop}
          >
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          >
            Send
          </button>
        )}
      </div>
    </form>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
