import type { SuperAgentView } from "../../state/superagent";
import { EmptyState } from "../primitives/EmptyState";

export function SuperAgentLoadState({
  view,
  onRetry,
}: {
  readonly view: SuperAgentView;
  readonly onRetry: () => void;
}) {
  if (view.requests.state === "loading")
    return <EmptyState variant="compact" title="正在加载 Super-agent…" />;
  if (view.requests.state === "error")
    return (
      <div role="alert">
        <EmptyState
          variant="compact"
          title="Super-agent 加载失败"
          description="已保留已知数据，请重试。"
          actionLabel="重试"
          onAction={onRetry}
        />
      </div>
    );
  if (view.status === "disabled")
    return <EmptyState variant="compact" title="Super-agent 未启用" />;
  if (view.status === "not-supported")
    return <EmptyState variant="compact" title="当前服务不支持 Super-agent" />;
  if (view.requests.state !== "success") return null;

  return (
    <>
      {(
        [
          ["workItems", "工作项", view.workItems.length],
          ["suggestions", "建议", view.suggestions.length],
          ["outbox", "发送队列", view.outbox.length],
        ] as const
      ).map(([key, label, count]) => {
        const status = view.requests[key];
        if (status === "error")
          return (
            <div key={key} role="alert">
              <EmptyState
                variant="compact"
                title={`${label}加载失败`}
                description="已保留已知数据，请重试。"
                actionLabel="重试"
                onAction={onRetry}
              />
            </div>
          );
        if (status === "loading")
          return (
            <EmptyState
              key={key}
              variant="compact"
              title={`正在加载${label}…`}
            />
          );
        if (status === "not-supported")
          return (
            <EmptyState
              key={key}
              variant="compact"
              title={`当前服务不支持${label}`}
            />
          );
        if (status === "success" && count === 0)
          return (
            <EmptyState key={key} variant="compact" title={`暂无${label}`} />
          );
        return null;
      })}
    </>
  );
}
