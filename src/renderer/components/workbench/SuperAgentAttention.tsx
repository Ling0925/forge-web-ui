import type { OutboxItem, Suggestion } from "@forge/core/shared";
import { useState } from "react";
import {
  type SuperAgentView,
  WORK_STATUS_LABELS,
} from "../../state/superagent";
import { superAgentStore } from "../../state/superagent";
import { Button } from "../primitives/Button";
import { describeSend } from "../primitives/tool-disclosure/superagent";
import { useConfirm } from "./ConfirmDialog";
import "./superagent.css";

function outboxDetail(item: OutboxItem): string | undefined {
  if (item.kind === "comment") return item.body.text;
  if (item.kind === "pull_request") return item.body.body;
  return undefined;
}

function useDecision() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message ? cause.message : "操作失败。",
      );
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function OutboxRow({
  item,
  confirm,
  workTitle,
}: {
  readonly item: OutboxItem;
  readonly confirm: ReturnType<typeof useConfirm>["confirm"];
  readonly workTitle: string | undefined;
}) {
  const { busy, error, run } = useDecision();
  const summary = describeSend(item) ?? item.kind;
  const detail = outboxDetail(item);
  const approve = async () => {
    // Approving executes a real external write (GitHub) exactly once.
    const confirmed = await confirm({
      title: "批准这条外部写操作？",
      body: `${summary}\n批准后会立即以宿主机的 GitHub 身份执行，无法撤回。`,
      confirmLabel: "批准并发送",
      tone: "danger",
    });
    if (confirmed) await run(() => superAgentStore.decideOutbox(item.id, true));
  };
  return (
    <div className="inspector-attention-item superagent-attention-item">
      <div className="inspector-attention-meta">
        <span className="inspector-attention-title" title={summary}>
          发送队列 · {summary}
        </span>
      </div>
      <span className="wb-muted superagent-attention-sub">
        工作项 {workTitle ? `${workTitle}（${item.workId}）` : item.workId}
      </span>
      {detail && (
        <details className="superagent-delivery-raw">
          <summary>查看内容</summary>
          <pre>{detail}</pre>
        </details>
      )}
      {error && (
        <p className="superagent-attention-error" role="alert">
          {error}
        </p>
      )}
      <div className="superagent-attention-actions">
        <Button size="sm" variant="primary" disabled={busy} onClick={approve}>
          批准…
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(() => superAgentStore.decideOutbox(item.id, false))
          }
        >
          拒绝
        </Button>
      </div>
    </div>
  );
}

function SuggestionRow({ suggestion }: { readonly suggestion: Suggestion }) {
  const { busy, error, run } = useDecision();
  return (
    <div className="inspector-attention-item superagent-attention-item">
      <div className="inspector-attention-meta">
        <span className="inspector-attention-title" title={suggestion.brief}>
          建议 · {suggestion.brief.split("\n")[0]}
        </span>
      </div>
      {suggestion.threadIds.length > 0 && (
        <span className="wb-muted superagent-attention-sub">
          {suggestion.threadIds.join("、")}
        </span>
      )}
      {error && (
        <p className="superagent-attention-error" role="alert">
          {error}
        </p>
      )}
      <div className="superagent-attention-actions">
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() =>
            void run(() =>
              superAgentStore.decideSuggestion(suggestion.id, true),
            )
          }
        >
          接受并开始
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(() =>
              superAgentStore.decideSuggestion(suggestion.id, false),
            )
          }
        >
          拒绝
        </Button>
      </div>
    </div>
  );
}

/** Pending super-agent decisions; renders nothing when there are none. */
export function SuperAgentAttention({
  view,
  outbox,
  suggestions,
}: {
  readonly view: SuperAgentView;
  readonly outbox: readonly OutboxItem[];
  readonly suggestions: readonly Suggestion[];
}) {
  const { confirm, dialog } = useConfirm();
  if (outbox.length === 0 && suggestions.length === 0) return dialog;
  const titleOf = (workId: string) => {
    const work = view.workItems.find((item) => item.id === workId);
    return work
      ? `${work.title || work.id} · ${WORK_STATUS_LABELS[work.status]}`
      : undefined;
  };
  return (
    <>
      {outbox.map((item) => (
        <OutboxRow
          key={item.id}
          item={item}
          confirm={confirm}
          workTitle={titleOf(item.workId)}
        />
      ))}
      {suggestions.map((suggestion) => (
        <SuggestionRow key={suggestion.id} suggestion={suggestion} />
      ))}
      {dialog}
    </>
  );
}
