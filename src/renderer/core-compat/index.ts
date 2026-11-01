/**
 * Renderer-side copies of forge-core helpers that are no longer reachable
 * through any public entry since core PR #8 replaced `"./*"` with an explicit
 * exports map. Types are derived from exported schemas/functions where
 * possible; values are copied verbatim from forge-core 8c07c87 (source file
 * noted on each). Delete an entry as soon as core exports it again.
 */
import {
  type ChartValidation,
  HTML_PREVIEW_MAX_BYTES,
  type ModelAccessResult,
  type SessionSnapshot,
  WORKSPACE_DIRECTORY_LIMIT,
  type executionTurns,
  type htmlPreviewResponseSchema,
  imageAttachmentSchema,
  publishedFileSchema,
  type sessionPageSchema,
  type sessionReviewInput,
  sessionSnapshotSchema,
  type sessionUsage,
  type sessionUsageStateSchema,
} from "@forge/core/shared";
import { z } from "zod";

export * from "./context-display";
export * from "./lan";
export * from "./sessions";
export * from "./slash-actions";
export * from "./slash-commands";

export type ChartSpec = Extract<ChartValidation, { ok: true }>["spec"];
export type HtmlPreviewResponse = z.infer<typeof htmlPreviewResponseSchema>;
export type ImageAttachment = z.infer<typeof imageAttachmentSchema>;
export type SessionPage = z.infer<typeof sessionPageSchema>;
export type SessionPageInfo = SessionPage["page"];
export type TranscriptSnapshot = SessionSnapshot & {
  readonly transcript?: SessionPageInfo;
};
export type SessionReviewInput = ReturnType<typeof sessionReviewInput>;
export type SessionUsage = ReturnType<typeof sessionUsage>;
export type SessionUsageState = z.infer<typeof sessionUsageStateSchema>;
export type PublicProviderPreset = Extract<
  ModelAccessResult,
  { type: "presets" }
>["presets"][number];
export type PublicAccountLogin = Extract<
  ModelAccessResult,
  { type: "login-start" }
>["login"];

// src/shared/execution.ts
export type ExecutionTurn = ReturnType<typeof executionTurns>[number];
export function executionLabel(turn: ExecutionTurn): string {
  const parts: string[] = [];
  if (turn.currentStep !== undefined)
    parts.push(`进行到第 ${turn.currentStep} 步`);
  else if (turn.steps !== undefined) parts.push(`${turn.steps} 步`);
  if (turn.toolCalls !== undefined) parts.push(`${turn.toolCalls} 次工具调用`);
  if (turn.retries) parts.push(`${turn.retries} 次请求重试`);
  return parts.join(" · ");
}

// src/shared/html-preview.ts
export function isHtmlLanguage(language: string): boolean {
  return /^(?:html|htm|xhtml)$/i.test(language.trim());
}

// src/shared/images.ts
export const MAX_IMAGES = 4;
export const imageAttachmentsSchema = z
  .array(imageAttachmentSchema)
  .max(MAX_IMAGES)
  .readonly();

// src/shared/published-files.ts
export const PUBLISHED_PREVIEW_MAX_BYTES = 1024 * 1024;
export const PUBLISHED_HTML_PREVIEW_MAX_BYTES = HTML_PREVIEW_MAX_BYTES;
export const publishedFilesSchema = z
  .array(publishedFileSchema)
  .max(16)
  .readonly();
const publishingTools: ReadonlySet<string> = new Set([
  "publish_file",
  "browser_screenshot",
  "officecli_preview",
]);
export function publishesPublishedFiles(toolName: string): boolean {
  return publishingTools.has(toolName);
}

// src/shared/model-access.ts
export const reasoningEffortSchema = z.enum([
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

// src/shared/session-usage.ts
const tokenFormatter = Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export function compactTokens(value: number): string {
  return tokenFormatter.format(value);
}

// src/shared/session-delta.ts (the parser only; applySessionDelta is exported)
const offset = z.number().int().nonnegative();
export const sessionDeltaSchema = z
  .object({
    base: z.string().uuid(),
    prefix: z
      .object({ messages: offset, events: offset, changes: offset })
      .strict(),
    snapshot: sessionSnapshotSchema,
  })
  .strict();

// src/shared/plugins.ts
export const browserImageSchema = z
  .object({
    mimeType: z.enum(["image/png", "image/jpeg"]),
    data: z
      .string()
      .min(4)
      .max(700_000)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .refine((value) => value.length % 4 === 0, "Expected base64 bytes."),
  })
  .strict()
  .readonly();

// src/shared/workspaces.ts
const WORKSPACE_PATH_MAX_LENGTH = 4096;
const workspaceDirectoryEntrySchema = z
  .object({
    name: z.string().min(1).max(255),
    path: z.string().min(1).max(WORKSPACE_PATH_MAX_LENGTH),
  })
  .strict()
  .readonly();
export const workspaceDirectoryPageSchema = z
  .object({
    path: z.string().min(1).max(WORKSPACE_PATH_MAX_LENGTH),
    parent: z.string().min(1).max(WORKSPACE_PATH_MAX_LENGTH).nullable(),
    directories: z
      .array(workspaceDirectoryEntrySchema)
      .max(WORKSPACE_DIRECTORY_LIMIT)
      .readonly(),
    truncated: z.boolean(),
  })
  .strict()
  .readonly();
