// Compatibility surface for existing renderer imports. Accumulation itself lives
// in the shared module so the host can summarize event prefixes for paged reads.
export {
  appendSessionEvent,
  seedSessionUsage,
  sessionUsage,
  summarizeUsageState,
} from "@forge/core/shared";
export { compactTokens, type SessionUsageState } from "../core-compat";
