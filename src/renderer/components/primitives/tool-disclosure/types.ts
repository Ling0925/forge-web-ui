import type { ReactNode } from "react";
import { type FileChange } from "../../../shared-types";

export interface ToolDisclosureProps {
  readonly toolName: string;
  readonly target?: string | undefined;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  /** One component, every lifecycle state: arguments still streaming
   * (`generating`), held for the user's decision (`awaiting_approval`),
   * executing, finished, failed, or stopped before it finished (`cancelled`). */
  readonly status:
    | "generating"
    | "awaiting_approval"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  readonly durationMs?: number;
  readonly timestamp?: string;
  readonly parameters?: Record<string, unknown> | string;
  readonly output?: string | null;
  readonly exitCode?: number | null;
  readonly error?: string | null;
  readonly changes?: readonly FileChange[] | undefined;
  readonly truncated?: boolean;
  readonly defaultExpanded?: boolean;
  /** When true, the row folds once as its phase becomes history (see the
   * transcript). The user can still reopen it; it is never forced shut twice. */
  readonly autoCollapsed?: boolean;
  readonly className?: string;
  /** Replaces the derived target text (live rows: "生成参数中 · 3878 字符"). */
  readonly detail?: ReactNode;
  /** Extra meta badges placed before the timing (live diff counters). */
  readonly meta?: ReactNode;
  /** Always-visible body under the header, outside the disclosure. */
  readonly footer?: ReactNode;
}
