import { type ReactNode } from "react";
import { PlanStepsList, isPlanSteps } from "./plans";
import { paramLabels } from "./presentation";
import { type ToolDisclosureProps } from "./types";

/** Best-effort pretty print for non-scalar argument values. */
function prettyValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

const BLOCK_TEXT_LIMIT = 12000;

interface RenderedValue {
  /** True when the value owns a full row: multiline or long text, JSON bodies. */
  readonly block: boolean;
  readonly node: ReactNode;
}

/**
 * Argument and result values stay readable without dumping the whole raw JSON
 * blob. Multi-line and long strings become their own block so line breaks,
 * indentation and log structure survive; scalars stay on one quiet line.
 */
function renderValue(value: unknown): RenderedValue {
  if (value === null || value === undefined)
    return { block: false, node: <span className="tool-param-empty">空</span> };
  if (typeof value === "string") {
    if (value === "")
      return {
        block: false,
        node: <span className="tool-param-empty">空</span>,
      };
    if (value.includes("\n") || value.length > 160) {
      const clipped = value.length > BLOCK_TEXT_LIMIT;
      return {
        block: true,
        node: (
          <pre className="tool-param-block">
            {clipped ? value.slice(0, BLOCK_TEXT_LIMIT) : value}
            {clipped && <span className="tool-param-empty">…（已截断）</span>}
          </pre>
        ),
      };
    }
    return {
      block: false,
      node: <span className="tool-param-text">{value}</span>,
    };
  }
  if (typeof value === "number" || typeof value === "boolean")
    return {
      block: false,
      node: <span className="tool-param-scalar">{String(value)}</span>,
    };
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    if (items.length === 0)
      return {
        block: false,
        node: <span className="tool-param-empty">空</span>,
      };
    if (isPlanSteps(items))
      return {
        block: true,
        node: <PlanStepsList steps={items} />,
      };
    if (items.every((item) => typeof item !== "object" || item === null))
      return {
        block: false,
        node: (
          <span className="tool-param-chips">
            {items.map((item, index) => (
              <span
                className="tool-param-chip"
                key={`${String(item)}-${index}`}
              >
                {String(item)}
              </span>
            ))}
          </span>
        ),
      };
  }
  return {
    block: true,
    node: <pre className="tool-param-json">{prettyValue(value)}</pre>,
  };
}

/** Labelled rows for one argument or result object. */
export function ValueRows({
  record,
  skip,
}: {
  readonly record: Record<string, unknown>;
  readonly skip?: ReadonlySet<string>;
}) {
  const entries = Object.entries(record).filter(([key]) => !skip?.has(key));
  if (entries.length === 0)
    return <span className="tool-section-empty">无其他字段</span>;
  return (
    <dl className="tool-params">
      {entries.map(([key, value]) => {
        const rendered = renderValue(value);
        return (
          <div
            className={
              rendered.block ? "tool-param-row is-block" : "tool-param-row"
            }
            key={key}
          >
            <dt className="tool-param-key">{paramLabels[key] ?? key}</dt>
            <dd className="tool-param-value">{rendered.node}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Parse the persisted argument string without throwing on malformed input. */
export function parseParams(
  parameters: ToolDisclosureProps["parameters"] | null,
): unknown {
  if (typeof parameters !== "string") return parameters ?? null;
  try {
    return JSON.parse(parameters);
  } catch {
    return parameters;
  }
}

/**
 * Parsed argument card: labelled rows for object arguments instead of one raw
 * JSON blob. Malformed or non-object parameters fall back to plain text.
 */
export function ParameterFields({
  parameters,
}: { readonly parameters: unknown }) {
  const record =
    typeof parameters === "object" &&
    parameters !== null &&
    !Array.isArray(parameters)
      ? (parameters as Record<string, unknown>)
      : null;
  if (!record)
    return parameters ? (
      <pre className="tool-param-json">{prettyValue(parameters)}</pre>
    ) : (
      <span className="tool-section-empty">无参数</span>
    );
  if (Object.keys(record).length === 0)
    return <span className="tool-section-empty">无参数</span>;
  return <ValueRows record={record} />;
}

type ParsedResult =
  | { readonly kind: "object"; readonly record: Record<string, unknown> }
  | { readonly kind: "text"; readonly text: string };

/** Result payloads: key/value rows for a JSON object, plain text otherwise. */
export function parseResult(output: string): ParsedResult {
  try {
    const parsed: unknown = JSON.parse(output);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length > 0
    )
      return { kind: "object", record: parsed as Record<string, unknown> };
  } catch {
    // Plain text is the normal shape for command output and free-form results.
  }
  return { kind: "text", text: output };
}
