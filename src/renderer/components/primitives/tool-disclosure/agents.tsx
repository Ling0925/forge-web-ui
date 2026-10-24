import {
  CheckCircle,
  CircleDashed,
  Coins,
  Cpu,
  PaperPlaneTilt,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { ToolCopyButton } from "./common";

function formatTokens(count?: number): string {
  if (count === undefined || count === null) return "";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${count}`;
}

export interface SpawnAgentParams {
  readonly task?: string;
  readonly ownership?: string;
  readonly model?: string;
  readonly writePaths?: readonly string[];
  readonly maxToolCalls?: number;
  readonly isolation?: "shared" | "worktree";
}

export function SpawnAgentView({
  params,
  result,
}: {
  readonly params: SpawnAgentParams | null;
  readonly result: unknown;
}) {
  const resultRecord =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : null;
  const childSessionId =
    typeof resultRecord?.childSessionId === "string"
      ? resultRecord.childSessionId
      : undefined;
  const model =
    params?.model ||
    (typeof resultRecord?.model === "string" ? resultRecord.model : undefined);
  const isolation =
    params?.isolation ||
    (typeof resultRecord?.isolation === "string"
      ? (resultRecord.isolation as "shared" | "worktree")
      : undefined);
  const workspace =
    typeof resultRecord?.workspace === "string"
      ? resultRecord.workspace
      : undefined;
  const task = params?.task;
  const ownership = params?.ownership;
  const writePaths = params?.writePaths;

  return (
    <div className="agent-card-view">
      <div className="agent-meta-bar">
        {model && (
          <span className="agent-meta-chip agent-model-chip">
            <Cpu size={13} weight="bold" />
            <span>{model}</span>
          </span>
        )}
        {ownership && (
          <span className="agent-meta-chip agent-ownership-chip">
            <ShieldCheck size={13} weight="bold" />
            <span>{ownership}</span>
          </span>
        )}
        {childSessionId && (
          <span
            className="agent-meta-chip agent-id-chip"
            title={childSessionId}
          >
            <span>子会话 {childSessionId.slice(0, 8)}</span>
          </span>
        )}
        {isolation && isolation !== "shared" && (
          <span
            className="agent-meta-chip agent-isolation-chip"
            title={`隔离模式：${isolation}`}
          >
            <span>隔离：{isolation}</span>
          </span>
        )}
        {workspace && (
          <span
            className="agent-meta-chip agent-workspace-chip"
            title={`工作区：${workspace}`}
          >
            <span>工作区：{workspace}</span>
          </span>
        )}
        {params?.maxToolCalls !== undefined && (
          <span className="agent-meta-chip agent-budget-chip">
            <span>预算上限 {params.maxToolCalls} 次</span>
          </span>
        )}
      </div>

      {writePaths && writePaths.length > 0 && (
        <div className="agent-paths-section">
          <span className="agent-paths-title">写入权限范围：</span>
          <div className="agent-paths-list">
            {writePaths.map((path) => (
              <code key={path} className="agent-path-tag">
                {path}
              </code>
            ))}
          </div>
        </div>
      )}

      {task && (
        <div className="agent-task-section">
          <div className="agent-task-header">
            <span className="agent-section-title">任务要求</span>
            <ToolCopyButton text={task} label="复制任务" />
          </div>
          <pre className="agent-task-content">{task}</pre>
        </div>
      )}
    </div>
  );
}

interface ChildAgentReportItem {
  readonly id: string;
  readonly status: "running" | "completed" | "failed" | "cancelled" | string;
  readonly model?: string;
  readonly summary?: string;
  readonly content?: string;
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  };
  readonly error?: string;
  readonly workspace?: string;
  readonly worktree?: {
    readonly repository: string;
    readonly worktree: string;
    readonly baseRevision: string;
  };
}

export function parseWaitAgentsResult(
  data: unknown,
): readonly ChildAgentReportItem[] | null {
  if (!data) return null;
  let parsed = data;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const items: ChildAgentReportItem[] = [];
  for (const item of parsed) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string"
    ) {
      const rec = item as Record<string, unknown>;
      const worktree =
        rec.worktree && typeof rec.worktree === "object"
          ? (rec.worktree as NonNullable<ChildAgentReportItem["worktree"]>)
          : undefined;
      items.push({
        id: rec.id as string,
        status: typeof rec.status === "string" ? rec.status : "completed",
        ...(typeof rec.model === "string" ? { model: rec.model } : {}),
        ...(typeof rec.summary === "string" ? { summary: rec.summary } : {}),
        ...(typeof rec.content === "string" ? { content: rec.content } : {}),
        ...(rec.usage && typeof rec.usage === "object"
          ? { usage: rec.usage as NonNullable<ChildAgentReportItem["usage"]> }
          : {}),
        ...(typeof rec.error === "string" ? { error: rec.error } : {}),
        ...(typeof rec.workspace === "string"
          ? { workspace: rec.workspace }
          : {}),
        ...(worktree ? { worktree } : {}),
      });
    }
  }
  return items.length > 0 ? items : null;
}

export function WaitAgentsView({
  reports,
}: { readonly reports: readonly ChildAgentReportItem[] }) {
  return (
    <div className="agent-reports-view">
      {reports.map((report) => {
        const isCompleted = report.status === "completed";
        const isRunning = report.status === "running";
        const isFailed = report.status === "failed";
        const rawText = report.summary || report.content;
        const isPlaceholder = isRunning && rawText === "No terminal snapshot";
        const text = isPlaceholder
          ? "子任务正在后台自主执行中，等待完成交付…"
          : rawText;
        return (
          <div
            key={report.id}
            className={`agent-report-card status-${report.status}`}
          >
            <div className="agent-report-header">
              <div className="agent-report-status-wrap">
                <span className={`agent-status-tag status-${report.status}`}>
                  {isCompleted ? (
                    <CheckCircle size={13} weight="fill" />
                  ) : isRunning ? (
                    <CircleDashed size={13} weight="bold" />
                  ) : (
                    <WarningCircle size={13} weight="fill" />
                  )}
                  <span>
                    {isCompleted
                      ? "已完成"
                      : isRunning
                        ? "执行中"
                        : isFailed
                          ? "失败"
                          : "已取消"}
                  </span>
                </span>
                {report.model && (
                  <span className="agent-model-name">{report.model}</span>
                )}
                <code className="agent-short-id" title={report.id}>
                  {report.id.slice(0, 8)}
                </code>
              </div>
              <div className="agent-report-meta">
                {report.usage && (
                  <span className="agent-usage-tag" title="Token 消耗">
                    <Coins size={12} weight="regular" />
                    <span>
                      {formatTokens(report.usage.promptTokens)} 入 /{" "}
                      {formatTokens(report.usage.completionTokens)} 出
                    </span>
                  </span>
                )}
                {text && !isPlaceholder && (
                  <ToolCopyButton text={text} label="复制报告" />
                )}
              </div>
            </div>

            {report.error && (
              <div className="agent-error-box">
                <WarningCircle size={14} weight="fill" />
                <span>{report.error}</span>
              </div>
            )}

            {report.worktree && (
              <div className="agent-paths-section">
                <span className="agent-paths-title">工作树：</span>
                <code
                  className="agent-path-tag"
                  title={`仓库：${report.worktree.repository}\n基线：${report.worktree.baseRevision}`}
                >
                  {report.worktree.worktree}
                </code>
              </div>
            )}

            {text && (
              <div className="agent-summary-body">
                <pre
                  className={`agent-summary-content ${isPlaceholder ? "is-placeholder" : ""}`}
                >
                  {text}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SendAgentMessageView({
  id,
  message,
}: {
  readonly id?: string;
  readonly message?: string;
}) {
  return (
    <div className="agent-message-view">
      {id && (
        <div className="agent-meta-chip agent-id-chip">
          <span>目标子会话：</span>
          <code className="agent-short-id">{id}</code>
        </div>
      )}
      {message && (
        <div className="agent-message-box">
          <div className="agent-message-label">
            <PaperPlaneTilt size={13} weight="bold" />
            <span>指派指令</span>
          </div>
          <pre className="agent-message-content">{message}</pre>
        </div>
      )}
    </div>
  );
}

export function ResolveAgentView({
  id,
  resolution,
}: {
  readonly id?: string;
  readonly resolution?: string;
}) {
  return (
    <div className="agent-resolve-view">
      {id && (
        <div className="agent-meta-chip agent-id-chip">
          <span>处理子会话：</span>
          <code className="agent-short-id">{id}</code>
        </div>
      )}
      {resolution && (
        <div className="agent-resolve-box">
          <div className="agent-resolve-label">
            <ShieldCheck size={14} weight="bold" />
            <span>解决依据与说明</span>
          </div>
          <pre className="agent-resolve-content">{resolution}</pre>
        </div>
      )}
    </div>
  );
}
