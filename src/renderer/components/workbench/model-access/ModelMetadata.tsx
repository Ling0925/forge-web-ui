import type { ModelCatalogEntry } from "@forge/core/shared/model-catalog";
import { formatTokens } from "./drafts";
import { effortName } from "./model-overrides";

function price(
  value: number | undefined,
  currency: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  return `${value} ${currency ?? ""}`.trim();
}

export function ModelMetadata({
  entry,
}: { readonly entry: ModelCatalogEntry }) {
  const prices = [
    price(entry.pricing?.input, entry.pricing?.currency),
    price(entry.pricing?.output, entry.pricing?.currency),
  ].filter(Boolean);
  return (
    <span className="model-access-meta">
      <span>上下文 {formatTokens(entry.contextWindowTokens)}</span>
      <span>输出 {formatTokens(entry.maxOutputTokens)}</span>
      <span>
        工具 {entry.tools === undefined ? "未知" : entry.tools ? "是" : "否"}
      </span>
      <span>
        视觉 {entry.vision === undefined ? "未知" : entry.vision ? "是" : "否"}
      </span>
      {entry.reasoningEffort && (
        <span className="model-access-meta-effort">
          默认思考 {effortName(entry.reasoningEffort)}
        </span>
      )}
      {entry.reasoningEfforts?.length ? (
        <span>思考档位 {entry.reasoningEfforts.map(effortName).join("/")}</span>
      ) : null}
      {prices.length > 0 && (
        <span>
          价格 {prices.join(" / ")}
          {entry.pricing?.source ? ` · ${entry.pricing.source}` : ""}
          {entry.pricing?.updatedAt ? ` · ${entry.pricing.updatedAt}` : ""}
        </span>
      )}
    </span>
  );
}

export function EffortBars({ bars }: { readonly bars: number }) {
  return (
    <span className="model-effort-bars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((index) => (
        <span
          key={index}
          className={`model-effort-bar${index <= bars ? " is-active" : ""}`}
        />
      ))}
    </span>
  );
}
