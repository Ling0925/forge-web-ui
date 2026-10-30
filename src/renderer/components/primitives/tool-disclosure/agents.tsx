import {
  ArrowSquareOut,
  CheckCircle,
  CircleDashed,
  Coins,
  Cpu,
  HourglassMedium,
  PaperPlaneTilt,
  Question,
  Robot,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type { SessionId } from "../../../shared-types";
import { useWorkbenchActions } from "../../../state/workbench-store";
import { Markdown } from "../../workbench/Markdown";
import { ToolCopyButton } from "./common";

function useSessionSelect(): ((sessionId: string) => Promise<void>) | undefined {
  try {
    const { selectSession } = useWorkbenchActions();
    // Child-session ids arrive from tool payloads as plain strings.
    return (sessionId) => selectSession(sessionId as SessionId);
  } catch {
    return undefined;
  }
}

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
  readonly providerSourceId?: string;
  readonly profileId?: string;
  readonly profileRevision?: number;
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
  const selectSession = useSessionSelect();

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
  const profileId =
    params?.profileId ||
    (typeof resultRecord?.profileId === "string"
      ? resultRecord.profileId
      : undefined);
  const profileRevision = params?.profileRevision;
  const providerSourceId = params?.providerSourceId;
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
        {profileId && (
          <span
            className="child-role-badge agent-role-badge"
            title={`智能体角色：${profileId}${profileRevision ? ` (v${profileRevision})` : ""}`}
          >
            <Robot size={12} weight="bold" />
            <span>{profileId}</span>
            {profileRevision !== undefined && (
              <span className="agent-profile-rev">v{profileRevision}</span>
            )}
          </span>
        )}
        {model && (
          <span className="agent-meta-chip agent-model-chip" title="指定模型">
            <Cpu size={13} weight="bold" />
            <span>{model}</span>
          </span>
        )}
        {providerSourceId && (
          <span
            className="agent-meta-chip agent-source-chip"
            title={`来源配置：${providerSourceId}`}
          >
            <span>来源：{providerSourceId}</span>
          </span>
        )}
        {ownership && (
          <span
            className="agent-meta-chip agent-ownership-chip"
            title="职责与范围"
          >
            <ShieldCheck size={13} weight="bold" />
            <span>{ownership}</span>
          </span>
        )}
        {childSessionId && (
          <button
            type="button"
            className="agent-meta-chip agent-id-chip agent-session-link-btn"
            title={`进入子会话：${childSessionId}`}
            onClick={() => selectSession && void selectSession(childSessionId)}
          >
            <span>子会话 #{childSessionId.slice(0, 8)}</span>
            <ArrowSquareOut size={12} weight="bold" className="agent-link-icon" />
          </button>
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
            <span className="agent-section-title">委派任务</span>
            <ToolCopyButton text={task} label="复制任务" />
          </div>
          <div className="agent-task-content markdown-body">
            <Markdown source={task} />
          </div>
        </div>
      )}
    </div>
  );
}

export interface ChildAgentReportItem {
  readonly id: string;
  readonly status:
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "interrupted"
    | "awaiting_approval"
    | string;
  readonly model?: string;
  readonly profileId?: string;
  readonly title?: string;
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
        ...(typeof rec.profileId === "string" ? { profileId: rec.profileId } : {}),
        ...(typeof rec.title === "string" ? { title: rec.title } : {}),
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
}: {
  readonly reports: readonly ChildAgentReportItem[];
}) {
  const selectSession = useSessionSelect();

  return (
    <div className="agent-reports-view">
      {reports.map((report, idx) => {
        const status = report.status || "completed";
        const isCompleted = status === "completed";
        const isRunning = status === "running";
        const isFailed = status === "failed";
        const isAwaiting = status === "awaiting_approval";
        const isInterrupted = status === "interrupted";
        const isCancelled = status === "cancelled";

        const rawText = report.summary || report.content;
        const isPlaceholder = isRunning && rawText === "No terminal snapshot";
        const text = isPlaceholder
          ? "子任务正在后台自主执行中，等待完成交付…"
          : rawText;

        const statusLabel = isCompleted
          ? "已完成"
          : isRunning
            ? "执行中"
            : isAwaiting
              ? "待审批"
              : isFailed
                ? "失败"
                : isInterrupted
                  ? "已中断"
                  : isCancelled
                    ? "已取消"
                    : status;

        return (
          <div
            key={report.id}
            className={`agent-report-card child-session-card is-${status} status-${status}`}
          >
            <div className="agent-report-header">
              <div className="agent-report-status-wrap">
                <span className="child-index-badge">#{idx + 1}</span>
                <span className={`child-status-badge is-${status}`}>
                  {isCompleted ? (
                    <CheckCircle size={13} weight="fill" />
                  ) : isRunning ? (
                    <>
                      <span className="agent-live-dot" aria-hidden="true" />
                      <CircleDashed size={13} weight="bold" className="agent-live-icon" />
                    </>
                  ) : isAwaiting ? (
                    <HourglassMedium size={13} weight="bold" />
                  ) : isFailed || isInterrupted ? (
                    <WarningCircle size={13} weight="fill" />
                  ) : (
                    <WarningCircle size={13} weight="regular" />
                  )}
                  <span>{statusLabel}</span>
                </span>
                {report.profileId && (
                  <span
                    className="child-role-badge agent-role-badge"
                    title={`角色：${report.profileId}`}
                  >
                    <Robot size={12} weight="bold" />
                    <span>{report.profileId}</span>
                  </span>
                )}
                <button
                  type="button"
                  className="child-title-button agent-id-link-btn"
                  title={`进入子任务会话：${report.id}`}
                  onClick={() => selectSession && void selectSession(report.id)}
                >
                  <span className="child-title-clamp">
                    {report.title || `子会话 #${report.id.slice(0, 8)}`}
                  </span>
                  <ArrowSquareOut
                    size={12}
                    weight="bold"
                    className="child-title-icon"
                  />
                </button>
                {report.model && (
                  <span className="agent-model-name" title={`模型：${report.model}`}>
                    {report.model}
                  </span>
                )}
              </div>
              <div className="agent-report-meta">
                {report.usage && (
                  <span className="agent-usage-tag" title="Token 消耗（提示词入 / 输出）">
                    <Coins size={12} weight="regular" />
                    <span className="agent-usage-num">
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
                {isPlaceholder ? (
                  <div className="agent-summary-placeholder">
                    <span className="agent-live-dot" aria-hidden="true" />
                    <span>{text}</span>
                  </div>
                ) : (
                  <div className="agent-summary-content markdown-body">
                    <Markdown source={text} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AnswerAdvisorView({
  requestId,
  answer,
  nextInstruction,
}: {
  readonly requestId?: string;
  readonly answer?: string;
  readonly nextInstruction?: string;
}) {
  return (
    <div className="agent-advisor-answer-view">
      <div className="agent-meta-bar">
        {requestId && (
          <span className="agent-meta-chip agent-id-chip" title={requestId}>
            <Question size={13} weight="bold" />
            <span>咨询请求 #{requestId.slice(0, 8)}</span>
          </span>
        )}
        <span className="child-status-badge is-answered">
          <CheckCircle size={12} weight="fill" />
          <span>主代理已答复</span>
        </span>
      </div>

      {answer && (
        <div className="agent-message-box">
          <div className="agent-message-header">
            <span className="agent-section-title">答复内容</span>
            <ToolCopyButton text={answer} label="复制答复" />
          </div>
          <div className="agent-message-content markdown-body">
            <Markdown source={answer} />
          </div>
        </div>
      )}

      {nextInstruction && (
        <div className="agent-instruction-box">
          <div className="agent-message-header">
            <span className="agent-section-title">下一步指令</span>
            <ToolCopyButton text={nextInstruction} label="复制指令" />
          </div>
          <div className="agent-message-content markdown-body">
            <Markdown source={nextInstruction} />
          </div>
        </div>
      )}
    </div>
  );
}

export function AdvisorCallView({
  question,
  context,
  options,
  recommendation,
}: {
  readonly question?: string;
  readonly context?: string;
  readonly options?: readonly string[];
  readonly recommendation?: string;
}) {
  return (
    <div className="agent-advisor-call-view">
      {question && (
        <div className="agent-message-box">
          <div className="agent-message-header">
            <span className="agent-section-title">咨询问题</span>
            <ToolCopyButton text={question} label="复制问题" />
          </div>
          <p className="agent-advisor-question-text">{question}</p>
        </div>
      )}
      {context && (
        <div className="agent-paths-section">
          <span className="agent-paths-title">背景上下文：</span>
          <p className="agent-advisor-context-text">{context}</p>
        </div>
      )}
      {options && options.length > 0 && (
        <div className="agent-paths-section">
          <span className="agent-paths-title">候选项：</span>
          <div className="agent-paths-list">
            {options.map((opt, i) => (
              <span key={i} className="agent-path-tag">
                {opt}
              </span>
            ))}
          </div>
        </div>
      )}
      {recommendation && (
        <div className="agent-paths-section">
          <span className="agent-paths-title">建议偏好：</span>
          <p className="agent-advisor-context-text">{recommendation}</p>
        </div>
      )}
    </div>
  );
}

export function ListAgentProfilesView({
  result,
}: {
  readonly result: unknown;
}) {
  let profiles: readonly Record<string, unknown>[] = [];
  if (result && typeof result === "object") {
    if (Array.isArray((result as { profiles?: unknown }).profiles)) {
      profiles = (result as { profiles: readonly Record<string, unknown>[] }).profiles;
    } else if (Array.isArray(result)) {
      profiles = result as readonly Record<string, unknown>[];
    }
  }

  if (!profiles.length) {
    return <span className="tool-section-empty">暂无可用智能体角色配置</span>;
  }

  return (
    <div className="agent-profiles-list-view">
      {profiles.map((p, i) => {
        const id = typeof p.id === "string" ? p.id : `profile-${i}`;
        const name = typeof p.name === "string" ? p.name : id;
        const desc = typeof p.description === "string" ? p.description : undefined;
        const model = typeof p.model === "string" ? p.model : undefined;
        const permission = typeof p.permission === "string" ? p.permission : undefined;
        const isolation = typeof p.isolation === "string" ? p.isolation : undefined;

        return (
          <div key={id} className="agent-profile-item-card">
            <div className="agent-profile-item-header">
              <span className="child-role-badge agent-role-badge">
                <Robot size={12} weight="bold" />
                <span>{name}</span>
              </span>
              <code className="agent-profile-id-tag">{id}</code>
              {model && (
                <span className="agent-model-name" title={`绑定模型：${model}`}>
                  {model}
                </span>
              )}
            </div>
            {desc && <p className="agent-profile-desc">{desc}</p>}
            <div className="agent-profile-meta-tags">
              {permission && (
                <span className="agent-path-tag">权限上限：{permission}</span>
              )}
              {isolation && (
                <span className="agent-path-tag">隔离：{isolation}</span>
              )}
            </div>
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
  const selectSession = useSessionSelect();

  return (
    <div className="agent-message-view">
      {id && (
        <div className="agent-meta-bar">
          <button
            type="button"
            className="agent-meta-chip agent-id-chip agent-session-link-btn"
            title={`进入目标子会话：${id}`}
            onClick={() => selectSession && void selectSession(id)}
          >
            <PaperPlaneTilt size={13} weight="bold" />
            <span>目标子会话 #{id.slice(0, 8)}</span>
            <ArrowSquareOut size={12} weight="bold" className="agent-link-icon" />
          </button>
        </div>
      )}
      {message && (
        <div className="agent-message-box">
          <div className="agent-message-header">
            <span className="agent-section-title">指派指令</span>
            <ToolCopyButton text={message} label="复制指令" />
          </div>
          <div className="agent-message-content markdown-body">
            <Markdown source={message} />
          </div>
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
  const selectSession = useSessionSelect();

  return (
    <div className="agent-resolve-view">
      {id && (
        <div className="agent-meta-bar">
          <button
            type="button"
            className="agent-meta-chip agent-id-chip agent-session-link-btn"
            title={`进入子会话：${id}`}
            onClick={() => selectSession && void selectSession(id)}
          >
            <ShieldCheck size={13} weight="bold" />
            <span>解决子会话 #{id.slice(0, 8)}</span>
            <ArrowSquareOut size={12} weight="bold" className="agent-link-icon" />
          </button>
        </div>
      )}
      {resolution && (
        <div className="agent-resolve-box">
          <div className="agent-message-header">
            <span className="agent-section-title">解决依据与说明</span>
            <ToolCopyButton text={resolution} label="复制说明" />
          </div>
          <div className="agent-resolve-content markdown-body">
            <Markdown source={resolution} />
          </div>
        </div>
      )}
    </div>
  );
}
