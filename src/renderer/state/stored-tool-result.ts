import { fileChangeSchema, toolResultSchema } from "@forge/core/shared/schemas";
import { publishedFilesSchema } from "@forge/core/shared/published-files";
import type { FileChange, PublishedFile } from "../shared-types";

const envelopeSchema = toolResultSchema.unwrap().pick({ content: true, isError: true }).strip();

interface StoredToolResult {
  readonly output: string;
  readonly failed: boolean;
  readonly changes?: readonly FileChange[];
  readonly files?: readonly PublishedFile[];
}

/** Plain native output stays readable; a malformed result envelope cannot prove success. */
export function decodeStoredToolResult(content: string): StoredToolResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { output: content, failed: false };
  }
  if (typeof parsed !== "object" || parsed === null ||
    !("content" in parsed || "isError" in parsed)) {
    return { output: content, failed: false };
  }
  const envelope = envelopeSchema.safeParse(parsed);
  if (!envelope.success) return { output: content, failed: true };

  // Old diff previews migrate independently; one malformed row must not hide valid edits.
  const changes = "changes" in parsed && Array.isArray(parsed.changes)
    ? parsed.changes.slice(0, 256).flatMap((value: unknown) => {
      const change = fileChangeSchema.safeParse(value);
      return change.success ? [change.data] : [];
    }) : [];
  const files = !envelope.data.isError && "files" in parsed
    ? publishedFilesSchema.safeParse(parsed.files) : undefined;
  return {
    output: envelope.data.content,
    failed: envelope.data.isError,
    ...(changes.length ? { changes } : {}),
    ...(files?.success && files.data.length ? { files: files.data } : {}),
  };
}
