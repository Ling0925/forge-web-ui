import { type FileChange } from "../../../shared-types";

export interface ToolDisclosureProps {
  readonly toolName: string;
  readonly target?: string | undefined;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly status: "running" | "completed" | "failed";
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
}
