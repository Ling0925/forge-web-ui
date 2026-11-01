import { Robot } from "@phosphor-icons/react";
import { WORK_STATUS_LABELS } from "../../state/superagent";
import type { SuperAgentDelivery } from "../../state/superagent-delivery";
import "./superagent.css";

const TITLES: Readonly<Record<SuperAgentDelivery["kind"], string>> = {
  batch: "新触发 · 待分派",
  updates: "线程更新",
  assignment: "分派的工作",
  work_changed: "工作项变化",
  report: "Worker 汇报",
};

/**
 * A super-agent delivered message (trigger batch or hand-off). Everything in
 * it is external, untrusted data: shown as plain text only, never Markdown,
 * and the original message stays one click away.
 */
export function SuperAgentDeliveryCard({
  delivery,
  raw,
  embedded = false,
}: {
  readonly delivery: SuperAgentDelivery;
  readonly raw: string;
  /** Inside a turn's user message instead of a standalone transcript row. */
  readonly embedded?: boolean;
}) {
  const trigger = delivery.kind === "batch" || delivery.kind === "updates";
  const work = "work" in delivery ? delivery.work : undefined;
  const workId = work?.id ?? ("workId" in delivery ? delivery.workId : "");
  return (
    <details
      className={`${embedded ? "" : "message message-internal "}agent-reconciliation-card superagent-delivery`}
    >
      <summary className="agent-reconciliation-summary">
        <span className="agent-reconciliation-title">
          <Robot size={15} weight="bold" />
          <span>{TITLES[delivery.kind]}</span>
          {workId && <code className="superagent-delivery-id">{workId}</code>}
        </span>
        <span className="agent-internal-tag">{trigger ? "触发" : "交接"}</span>
      </summary>
      <div className="agent-reconciliation-body">
        <p className="wb-muted agent-reconciliation-hint">
          Super-agent 自动投递，非人工输入；内容来自外部，仅作数据展示。
        </p>
        {work && (
          <dl className="superagent-delivery-facts">
            <dt>状态</dt>
            <dd>{WORK_STATUS_LABELS[work.status]}</dd>
            {work.title && (
              <>
                <dt>标题</dt>
                <dd>{work.title}</dd>
              </>
            )}
            {work.progress && (
              <>
                <dt>进度</dt>
                <dd className="superagent-delivery-text">{work.progress}</dd>
              </>
            )}
          </dl>
        )}
        {delivery.kind === "assignment" && delivery.brief && (
          <p className="superagent-delivery-text">{delivery.brief}</p>
        )}
        {"triggers" in delivery && delivery.triggers.length > 0 && (
          <ul className="superagent-delivery-list" aria-label="触发">
            {delivery.triggers.map((item) => (
              <li key={item.id}>
                <span className="superagent-delivery-text">{item.summary}</span>
                <span className="wb-muted">
                  {" "}
                  · {item.actor} · {item.kind}
                  {item.explicit ? " · 明确授权" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {"threads" in delivery && delivery.threads.length > 0 && (
          <ul className="superagent-delivery-list" aria-label="线程">
            {delivery.threads.map((thread) => (
              <li key={thread.id} title={thread.url}>
                {thread.title || thread.id}
                <span className="wb-muted"> · {thread.state}</span>
              </li>
            ))}
          </ul>
        )}
        <details className="superagent-delivery-raw">
          <summary>原始消息</summary>
          <pre>{raw}</pre>
        </details>
      </div>
    </details>
  );
}
