/** Copied from forge-core src/shared/sessions.ts at 8c07c87 (not exported since PR #8). */
import type { SessionSummary } from "@forge/core/shared";

export const isPrimarySession = (
  session: Pick<SessionSummary, "parentSessionId">,
): boolean => session.parentSessionId === undefined;
