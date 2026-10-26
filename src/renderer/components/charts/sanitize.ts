import type { ChartSpec } from "@forge/core/shared/chart-spec";

/**
 * Raw ECharts options arrive as JSON from model output. JSON cannot carry
 * functions, so the remaining injection surface is HTML that ECharts itself
 * writes: tooltip/label `formatter` template strings are interpolated into
 * the tooltip DOM in `html` renderMode. The sanitizer therefore rejects any
 * string containing markup or script-ish content and normalizes the few
 * option fields that could escape the container.
 */

const FORBIDDEN_KEY = /^(?:on[a-z]+|__proto__|constructor|prototype)$/i;
const FORBIDDEN_STRING = /<|javascript:|data:text\/html/i;

export interface SanitizeResult {
  readonly ok: boolean;
  readonly option?: Record<string, unknown>;
  readonly error?: string;
}

function walk(value: unknown, path: string): string | undefined {
  if (typeof value === "string")
    return FORBIDDEN_STRING.test(value)
      ? `${path || "raw"} 含被禁止的内容（HTML 标签或脚本 URL）`
      : undefined;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const error = walk(item, `${path}[${index}]`);
      if (error) return error;
    }
    return undefined;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key))
        return `${path || "raw"} 含被禁止的键 “${key}”`;
      const error = walk(item, path ? `${path}.${key}` : key);
      if (error) return error;
    }
  }
  return undefined;
}

/** Validate + normalize a raw passthrough option. Never throws. */
export function sanitizeRawOption(
  raw: ChartSpec["raw"],
): SanitizeResult {
  if (!raw) return { ok: false, error: "缺少 raw.option。" };
  const option = structuredClone(raw.option) as Record<string, unknown>;
  const error = walk(option, "raw.option");
  if (error) return { ok: false, error };
  // Keep the tooltip inside the chart container; page-level positioning could
  // overlay the whole app with model-supplied content.
  const tooltip = option["tooltip"];
  if (tooltip && typeof tooltip === "object" && !Array.isArray(tooltip))
    (tooltip as Record<string, unknown>)["appendToBody"] = false;
  return { ok: true, option };
}
