import { sessionPlans } from "@forge/core/shared/plans";
import {
  type Message,
  type SessionSnapshot,
  type TaskPlan,
  parseSessionId,
} from "@forge/core/shared/schemas";
import {
  ArrowSquareOut,
  ArrowUpLeft,
  ArrowsInLineVertical,
  ChartBar,
  Check,
  ClockCounterClockwise,
  FileText,
  FolderSimple,
  GitBranch,
  ListChecks,
  Question,
  Target,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OperationScope } from "../../state/operation-scope";
import { sessionUsage } from "../../state/session-usage";
import { useWorkbench } from "../../state/workbench-context";
import { Button } from "../primitives/Button";
import { EmptyState } from "../primitives/EmptyState";
import { StatusBadge, ToneBadge } from "../primitives/StatusBadge";
import { Markdown } from "./Markdown";
import { SubAgentActivity } from "./SubAgentActivity";
import {
  type MemoryExcerptBlock,
  type MemoryPlanSummary,
  type MemoryRefItem,
  type ParsedContextMemory,
  parseContextMemory,
  resolveMessageByRef,
} from "./context-memory-parser";

function planProgress(plan: TaskPlan) {
  const completed = plan.steps.filter(
    (step) => step.status === "completed",
  ).length;
  const inProgress = plan.steps.filter(
    (step) => step.status === "in_progress",
  ).length;
  const pending = plan.steps.filter((step) => step.status === "pending").length;
  const total = plan.steps.length;
  const tone: "completed" | "active" | "pending" =
    total > 0 && completed === total
      ? "completed"
      : inProgress > 0
        ? "active"
        : "pending";
  const label =
    tone === "completed" ? "已完成" : tone === "active" ? "进行中" : "待处理";
  return { completed, inProgress, pending, total, label, tone };
}

function PlanSteps({ plan }: { readonly plan: TaskPlan }) {
  return (
    <ol className="wb-plan-progress">
      {plan.steps.map((step, position) => (
        <li
          key={`${step.step}:${position}`}
          className={`plan-step-item plan-step-${step.status}`}
        >
          <span
            className={`plan-status plan-${step.status}`}
            aria-hidden="true"
          >
            {step.status === "completed" ? (
              <Check size={9} weight="bold" />
            ) : step.status === "in_progress" ? (
              <span className="plan-status-dot" />
            ) : null}
          </span>
          <div className="plan-step-row">
            <span className="plan-step-index">
              {String(position + 1).padStart(2, "0")}
            </span>
            <span className="plan-step-text">{step.step}</span>
            {step.status === "in_progress" && (
              <span className="plan-step-tag is-active">当前步骤</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function resolveDisplayPlans(
  snapshot: Pick<SessionSnapshot, "plan" | "plans">,
) {
  const plans = sessionPlans(snapshot);
  const currentId = snapshot.plan ? (snapshot.plan.id ?? "legacy") : null;
  const current = currentId
    ? (plans.find((plan) => plan.id === currentId) ?? null)
    : null;
  const historical = currentId
    ? plans.filter((plan) => plan.id !== currentId)
    : plans.slice(0, -1);
  const currentPlan =
    current ??
    (currentId === null && plans.length ? (plans.at(-1) ?? null) : null);
  const currentProgress = currentPlan ? planProgress(currentPlan) : null;
  const percent =
    currentProgress && currentProgress.total > 0
      ? Math.round((currentProgress.completed / currentProgress.total) * 100)
      : 0;
  const activePercent =
    currentProgress && currentProgress.total > 0
      ? Math.round((currentProgress.inProgress / currentProgress.total) * 100)
      : 0;
  return {
    plans,
    currentPlan,
    currentProgress,
    historical,
    percent,
    activePercent,
  };
}

const PLAN_TONE = {
  completed: "success",
  active: "accent",
  pending: "neutral",
} as const;

export function PlanProgressPanel({
  snapshot,
}: {
  readonly snapshot: Pick<SessionSnapshot, "plan" | "plans">;
}) {
  const { currentPlan, currentProgress, percent, activePercent } =
    resolveDisplayPlans(snapshot);
  const inProgressCount = currentProgress?.inProgress ?? 0;
  const pendingCount = currentProgress?.pending ?? 0;

  return (
    <section className="wb-stack inspector-section inspector-plan-section inspector-plan-progress-panel">
      <div className="inspector-card-header inspector-plan-header">
        <div className="inspector-title-row">
          <ListChecks
            size={14}
            weight="bold"
            className="inspector-title-icon"
          />
          <h3>计划进度</h3>
        </div>
        {currentProgress && (
          <ToneBadge
            tone={PLAN_TONE[currentProgress.tone]}
            mono
            className={`inspector-plan-badge is-${currentProgress.tone}`}
          >
            {currentProgress.completed}/{currentProgress.total} ·{" "}
            {currentProgress.label}
          </ToneBadge>
        )}
      </div>
      {currentPlan && currentProgress ? (
        <div className="inspector-plan-body wb-stack">
          <div className="wb-plan-current-title inspector-plan-summary-card">
            <div className="wb-plan-title-line">
              <div className="inspector-plan-title-group">
                <span className="inspector-plan-kicker">当前计划</span>
                <strong className="inspector-plan-title-text">
                  {currentPlan.title ?? "原有计划"}
                </strong>
              </div>
              <span
                className={`inspector-plan-percent is-${currentProgress.tone}`}
              >
                {percent}%
              </span>
            </div>
            <div
              className="inspector-plan-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
            >
              <div
                className="inspector-plan-progress-fill"
                style={{ width: `${percent}%` }}
              />
              {activePercent > 0 && (
                <div
                  className="inspector-plan-progress-active"
                  style={{
                    width: `${Math.min(100 - percent, activePercent)}%`,
                  }}
                />
              )}
            </div>
            {currentProgress.total > 0 && (
              <div className="inspector-plan-stats-row">
                <span className="inspector-plan-stat-pill is-completed">
                  已完成 {currentProgress.completed}
                </span>
                <span className="inspector-plan-stat-pill is-active">
                  进行中 {inProgressCount}
                </span>
                <span className="inspector-plan-stat-pill is-pending">
                  待处理 {pendingCount}
                </span>
              </div>
            )}
          </div>
          <PlanSteps plan={currentPlan} />
        </div>
      ) : (
        <EmptyState
          variant="compact"
          className="inspector-plan-empty"
          title="尚无已保存计划。使用 Plan 模式请求只读规划。"
          description="执行过程中创建的任务步骤与完成进度将在此实时同步"
        />
      )}
    </section>
  );
}

export function PlanDocumentPanel({
  snapshot,
}: {
  readonly snapshot: Pick<SessionSnapshot, "plan" | "plans">;
}) {
  const { plans, currentPlan, currentProgress, historical } =
    resolveDisplayPlans(snapshot);

  return (
    <section className="wb-stack inspector-section inspector-plan-section inspector-plan-doc-panel">
      <div className="inspector-card-header inspector-plan-header">
        <div className="inspector-title-row">
          <FileText size={14} weight="bold" className="inspector-title-icon" />
          <h3>Plan 规划</h3>
        </div>
        {currentProgress && (
          <ToneBadge
            tone={PLAN_TONE[currentProgress.tone]}
            mono
            className={`inspector-plan-badge is-${currentProgress.tone}`}
          >
            {currentProgress.completed}/{currentProgress.total} ·{" "}
            {currentProgress.label}
          </ToneBadge>
        )}
      </div>
      {currentPlan && currentProgress ? (
        <div className="inspector-plan-body wb-stack">
          <div className="wb-plan-current-title inspector-plan-doc-meta">
            <div className="inspector-plan-doc-title-row">
              <div className="inspector-plan-title-group">
                <span className="inspector-plan-kicker">方案文档</span>
                <strong className="inspector-plan-title-text">
                  {currentPlan.title ?? "原有计划"}
                </strong>
              </div>
              <span className="inspector-plan-step-count-pill">
                共 {currentPlan.steps.length} 步
              </span>
            </div>
          </div>
          {currentPlan.explanation ? (
            <div className="wb-disclosure-body inspector-plan-doc-body">
              <Markdown source={currentPlan.explanation} />
            </div>
          ) : (
            <EmptyState
              variant="compact"
              className="inspector-plan-empty is-compact"
              title="当前计划未附带详细说明文档。"
            />
          )}
        </div>
      ) : (
        <EmptyState
          variant="compact"
          className="inspector-plan-empty"
          title="尚无已保存计划。使用 Plan 模式请求只读规划。"
          description="在对话中切换至 Plan 模式即可生成只读方案说明与分步计划"
        />
      )}
      {historical.length > 0 && (
        <div className="inspector-plan-history-section wb-stack">
          <div className="inspector-plan-history-header">
            <ClockCounterClockwise
              size={13}
              weight="bold"
              className="inspector-plan-history-icon"
            />
            <p className="wb-muted inspector-plan-history-title">
              历史计划 {historical.length}
            </p>
          </div>
          <div className="inspector-plan-history-list wb-stack">
            {historical.map((plan) => {
              const index = plans.indexOf(plan) + 1;
              const progress = planProgress(plan);
              return (
                <details
                  open
                  key={`${plan.id}:${index}`}
                  className="wb-disclosure inspector-disclosure-card inspector-plan-history-card"
                >
                  <summary className="inspector-plan-history-summary">
                    <span className="inspector-plan-history-summary-main">
                      <span className="inspector-plan-history-index">
                        计划 {index}
                      </span>
                      <span
                        className="inspector-plan-history-sep"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                      <span className="inspector-plan-history-name">
                        {plan.title ?? "原有计划"}
                      </span>
                    </span>
                    <ToneBadge
                      tone={PLAN_TONE[progress.tone]}
                      mono
                      className={`inspector-plan-history-status is-${progress.tone}`}
                    >
                      <span
                        className="inspector-plan-history-sep"
                        aria-hidden="true"
                      >
                        ·{" "}
                      </span>
                      {progress.completed}/{progress.total} {progress.label}
                    </ToneBadge>
                  </summary>
                  <div className="wb-disclosure-body inspector-plan-history-body">
                    <PlanSteps plan={plan} />
                    {plan.explanation && (
                      <div className="inspector-plan-history-explanation">
                        <Markdown source={plan.explanation} />
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Plans are independent records: the current one stays expanded, while earlier
 * plans remain reachable as compact disclosures with their own numbering.
 */
export function PlanSection({
  snapshot,
}: {
  readonly snapshot: Pick<SessionSnapshot, "plan" | "plans">;
}) {
  return (
    <div className="wb-stack">
      <PlanProgressPanel snapshot={snapshot} />
      <PlanDocumentPanel snapshot={snapshot} />
    </div>
  );
}

export function SubAgentsPanel() {
  const { state, selectSession, refreshActiveSession } = useWorkbench();
  const snapshot = state.activeSnapshot;
  const cancelScope = useRef(new OperationScope());
  useEffect(() => {
    cancelScope.current = new OperationScope();
    return () => {
      cancelScope.current.close();
    };
  }, []);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [controlMessage, setControlMessage] = useState("");

  const cancelOwned = async (id: NonNullable<typeof state.activeSessionId>) => {
    const valid = cancelScope.current.begin();
    setCancelling(true);
    setError("");
    try {
      const cancelled = await window.forge.cancelSession(id);
      if (!valid()) return;
      setControlMessage(
        cancelled ? "已取消本进程拥有的操作" : "本进程没有可取消的操作",
      );
      await refreshActiveSession();
    } catch (err) {
      if (valid()) setError(err instanceof Error ? err.message : "取消失败");
    } finally {
      if (valid()) setCancelling(false);
    }
  };

  if (!snapshot) return null;
  const parentId = snapshot.parentSessionId;
  const sortedChildren = [
    ...state.sessions.filter(
      (session) => session.parentSessionId === snapshot.id,
    ),
  ]
    // Keep cards in creation order: finishing a task must not move the
    // conversation someone is reading to another place in the list.
    .sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    );
  const updates = snapshot.events.filter(
    (event) => event.type === "agent_update",
  );
  const runningCount = sortedChildren.filter(
    (child) =>
      child.status === "running" || child.status === "awaiting_approval",
  ).length;
  const completedCount = sortedChildren.filter(
    (child) => child.status === "completed",
  ).length;
  const failedCount = sortedChildren.filter(
    (child) =>
      child.status === "failed" ||
      child.status === "interrupted" ||
      child.status === "cancelled",
  ).length;
  const activeParentRun = state.activeRuns[snapshot.id];
  const isParentLive =
    Boolean(activeParentRun) &&
    (activeParentRun?.status === "running" ||
      activeParentRun?.status === "awaiting_approval");
  const hasChildMeta = Boolean(
    parentId ||
      snapshot.agentTask ||
      snapshot.ownership ||
      snapshot.agentWorktree ||
      snapshot.agentProfile,
  );

  return (
    <section className="wb-stack inspector-section inspector-subagents-section">
      <div className="inspector-card-header inspector-subagents-header">
        <div className="inspector-title-row">
          <GitBranch size={14} weight="bold" className="inspector-title-icon" />
          <h3>子任务</h3>
          <span className="inspector-subagents-count">
            {sortedChildren.length}
          </span>
        </div>
        <div className="inspector-subagents-header-actions">
          {sortedChildren.length > 0 && (
            <div className="inspector-plan-stats-row inspector-subagents-stats">
              {runningCount > 0 && (
                <span className="inspector-plan-stat-pill is-active">
                  运行中 {runningCount}
                </span>
              )}
              {completedCount > 0 && (
                <span className="inspector-plan-stat-pill is-completed">
                  完成 {completedCount}
                </span>
              )}
              {failedCount > 0 && (
                <span className="inspector-plan-stat-pill is-failed">
                  结束/异常 {failedCount}
                </span>
              )}
            </div>
          )}
          {parentId && (
            <Button
              size="sm"
              variant="ghost"
              className="inspector-parent-jump-btn"
              onClick={() => void selectSession(parentId)}
            >
              <ArrowUpLeft size={12} weight="bold" />
              <span>打开父任务</span>
            </Button>
          )}
        </div>
      </div>

      {hasChildMeta && (
        <div className="inspector-subagent-context-card wb-stack">
          {(parentId || snapshot.ownership || snapshot.agentWorktree) && (
            <div className="inspector-subagent-meta-list">
              {parentId && (
                <div className="inspector-subagent-meta-item">
                  <span className="inspector-subagent-meta-label">
                    所属父会话
                  </span>
                  <code className="inspector-subagent-meta-code">
                    {parentId}
                  </code>
                </div>
              )}
              {snapshot.ownership && (
                <p className="inspector-ownership-tag">
                  <Target
                    size={12}
                    weight="bold"
                    className="inspector-ownership-icon"
                  />
                  <span>负责范围：{snapshot.ownership}</span>
                </p>
              )}
              {snapshot.agentWorktree && (
                <p className="inspector-ownership-tag">
                  <FolderSimple
                    size={12}
                    weight="bold"
                    className="inspector-ownership-icon"
                  />
                  <span>
                    工作树：<code>{snapshot.agentWorktree.worktree}</code>
                  </span>
                </p>
              )}
            </div>
          )}
          {snapshot.agentProfile && (
            <div className="inspector-agent-profile-card">
              <div className="inspector-agent-profile-header">
                <span className="inspector-agent-profile-tag">
                  智能体角色快照
                </span>
                <strong className="inspector-agent-profile-name">
                  {snapshot.agentProfile.name}
                </strong>
                <code className="inspector-agent-profile-id">
                  {snapshot.agentProfile.id}
                </code>
              </div>
              <p className="inspector-agent-profile-desc">
                {snapshot.agentProfile.description}
              </p>
              <div className="inspector-agent-profile-specs">
                <span className="inspector-agent-spec-item">
                  权限上限：<code>{snapshot.agentProfile.permission}</code>
                </span>
                <span className="inspector-agent-spec-item">
                  工作树：<code>{snapshot.agentProfile.isolation}</code>
                </span>
                <span className="inspector-agent-spec-item">
                  模型：
                  <code>
                    {snapshot.agentProfile.model.mode === "inherit"
                      ? "继承父模型"
                      : `${snapshot.agentProfile.model.providerSourceId}/${snapshot.agentProfile.model.model}`}
                  </code>
                </span>
                <span className="inspector-agent-spec-item">
                  工具：
                  <code>
                    {snapshot.agentProfile.tools.mode === "inherit"
                      ? "继承宿主"
                      : snapshot.agentProfile.tools.groups.join(", ")}
                  </code>
                </span>
                {snapshot.agentProfile.tools.mode === "restricted" &&
                  snapshot.agentProfile.tools.groups.includes("mcp") && (
                    <span className="inspector-agent-spec-item">
                      MCP：
                      <code>
                        {snapshot.agentProfile.tools.mcpServers.join(", ") ||
                          "未授权服务器"}
                      </code>
                    </span>
                  )}
                <span className="inspector-agent-spec-item">
                  配置版本：<code>{snapshot.agentProfile.revision}</code>
                </span>
              </div>
              <details className="inspector-agent-profile-details">
                <summary>角色指令与适用场景</summary>
                <p className="inspector-agent-profile-desc">
                  {snapshot.agentProfile.whenToUse}
                </p>
                <p className="advisor-context-text">
                  {snapshot.agentProfile.instructions}
                </p>
              </details>
            </div>
          )}
          {parentId &&
            (snapshot.status === "running" ||
              snapshot.status === "awaiting_approval") && (
              <Button
                size="sm"
                variant="danger"
                className="inspector-self-cancel-btn"
                disabled={cancelling}
                onClick={() => void cancelOwned(snapshot.id)}
              >
                {cancelling ? "正在取消…" : "取消此子任务（本进程）"}
              </Button>
            )}
          {snapshot.agentTask && (
            <details open className="wb-disclosure inspector-disclosure-card">
              <summary>查看子任务指令</summary>
              <div className="wb-disclosure-body">
                <Markdown source={snapshot.agentTask} />
              </div>
            </details>
          )}
        </div>
      )}

      {sortedChildren.length ? (
        <div className="inspector-subagents-list wb-stack">
          {sortedChildren.map((child, index) => {
            const roleName =
              child.agentProfileName ||
              state.snapshotCache?.[child.id]?.snapshot?.agentProfile?.name;
            const childAdvisorReq = snapshot.advisorRequests?.find(
              (req) =>
                req.childSessionId === child.id && req.status === "pending",
            );
            const isChildAdvisorLive =
              Boolean(childAdvisorReq) &&
              isParentLive &&
              Boolean(activeParentRun?.rootRunId) &&
              activeParentRun?.rootRunId === childAdvisorReq?.parentRunId;

            return (
              <article
                key={child.id}
                className={`agent-card child-session-card wb-child-row is-${child.status}`}
              >
                <div className="child-card-top">
                  <div className="child-card-header">
                    <span className="child-index-badge">#{index + 1}</span>
                    <Button
                      size="sm"
                      className="child-title-button"
                      title={child.title}
                      aria-label={`打开子任务：${child.title}`}
                      onClick={() => void selectSession(child.id)}
                    >
                      <span className="child-title-clamp">{child.title}</span>
                      <ArrowSquareOut
                        size={12}
                        weight="bold"
                        className="child-title-icon"
                      />
                    </Button>
                    <div className="child-card-badges">
                      {roleName && (
                        <span
                          className="child-role-badge"
                          title={`智能体角色：${roleName}`}
                        >
                          {roleName}
                        </span>
                      )}
                      {childAdvisorReq &&
                        (isChildAdvisorLive ? (
                          <span
                            className="child-advisor-pill is-waiting"
                            title="子代理正在等待主代理答复"
                          >
                            <span
                              className="child-advisor-dot is-live"
                              aria-hidden="true"
                            />
                            等待答疑
                          </span>
                        ) : (
                          <span
                            className="child-advisor-pill is-interrupted"
                            title="历史答疑已中断（主代理未运行或属于历史运行）"
                          >
                            答疑已中断
                          </span>
                        ))}
                      <StatusBadge status={child.status} />
                      {(child.status === "running" ||
                        child.status === "awaiting_approval") && (
                        <Button
                          size="sm"
                          variant="danger"
                          className="child-cancel-btn"
                          disabled={cancelling}
                          onClick={() => void cancelOwned(child.id)}
                        >
                          {cancelling ? "正在取消…" : "取消任务"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <SubAgentActivity
                  child={child}
                  cached={state.snapshotCache?.[child.id]?.snapshot}
                  progress={state.agentProgress?.[child.id]}
                  update={updates.findLast(
                    (update) => update.childSessionId === child.id,
                  )}
                  onOpen={selectSession}
                />
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          variant="compact"
          className="inspector-subagents-empty"
          title="没有已保存的子任务"
          description="主代理委派并行或专项任务时，子代理的实时进度与最终报告会在此展示。"
        />
      )}

      {snapshot.advisorRequests && snapshot.advisorRequests.length > 0 && (
        <div className="inspector-advisor-section wb-stack">
          <div className="inspector-advisor-header">
            <div className="inspector-title-row">
              <Question
                size={14}
                weight="bold"
                className="inspector-title-icon"
              />
              <h4>答疑与协调 (Advisor)</h4>
              <span className="inspector-subagents-count">
                {snapshot.advisorRequests.length}
              </span>
            </div>
          </div>
          <p className="inspector-advisor-hint">
            子代理遇到关键决策或歧义时向主代理发起答疑。默认由主代理在后续步骤自动答复，不提供人工审批按钮；如需干预，可在主会话输入框发送指令补充说明。
          </p>

          <div className="inspector-advisor-list wb-stack">
            {snapshot.advisorRequests.map((req) => {
              const targetChildIndex = sortedChildren.findIndex(
                (c) => c.id === req.childSessionId,
              );
              const childLabel =
                targetChildIndex >= 0
                  ? `#${targetChildIndex + 1} ${sortedChildren[targetChildIndex]?.title}`
                  : req.childSessionId.slice(0, 8);

              const isReqLive =
                isParentLive &&
                Boolean(activeParentRun?.rootRunId) &&
                activeParentRun?.rootRunId === req.parentRunId;

              return (
                <article
                  key={req.id}
                  className={`inspector-advisor-card is-${req.status}`}
                >
                  <div className="inspector-advisor-card-top">
                    <div className="inspector-advisor-card-badges">
                      {req.status === "pending" ? (
                        isReqLive ? (
                          <ToneBadge
                            tone="warning"
                            className="advisor-badge is-pending"
                          >
                            <span
                              className="advisor-live-dot"
                              aria-hidden="true"
                            />
                            等待主代理答复
                          </ToneBadge>
                        ) : (
                          <ToneBadge
                            tone="muted"
                            className="advisor-badge is-interrupted"
                          >
                            已中断（主代理未运行或属于历史运行，不可控制）
                          </ToneBadge>
                        )
                      ) : req.status === "answered" ? (
                        req.deliveredAt ? (
                          <ToneBadge
                            tone="success"
                            className="advisor-badge is-delivered"
                          >
                            已答复并投递
                          </ToneBadge>
                        ) : (
                          <ToneBadge
                            tone="success"
                            className="advisor-badge is-answered"
                          >
                            已答复（等待子代理接收）
                          </ToneBadge>
                        )
                      ) : req.status === "cancelled" ? (
                        <ToneBadge
                          tone="muted"
                          className="advisor-badge is-cancelled"
                        >
                          已取消
                        </ToneBadge>
                      ) : req.status === "expired" ? (
                        <ToneBadge
                          tone="muted"
                          className="advisor-badge is-expired"
                        >
                          已超时
                        </ToneBadge>
                      ) : (
                        <ToneBadge
                          tone="muted"
                          className="advisor-badge is-interrupted"
                        >
                          已中断
                        </ToneBadge>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="advisor-child-link-btn"
                        onClick={() =>
                          void selectSession(parseSessionId(req.childSessionId))
                        }
                        title={`前往子任务：${childLabel}`}
                      >
                        子任务：{childLabel}
                      </Button>
                    </div>

                    <time
                      className="advisor-time"
                      dateTime={req.createdAt}
                      title={new Date(req.createdAt).toLocaleString()}
                    >
                      {new Date(req.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </time>
                  </div>

                  <div className="inspector-advisor-field">
                    <span className="advisor-field-label">问题：</span>
                    <strong className="advisor-question-text">
                      {req.question}
                    </strong>
                  </div>

                  {req.context && (
                    <div className="inspector-advisor-field">
                      <span className="advisor-field-label">背景：</span>
                      <p className="advisor-context-text">{req.context}</p>
                    </div>
                  )}

                  {req.options && req.options.length > 0 && (
                    <div className="inspector-advisor-field">
                      <span className="advisor-field-label">候选项：</span>
                      <div className="advisor-options-chips">
                        {req.options.map((opt, i) => (
                          <span key={i} className="advisor-option-chip">
                            {opt}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {req.recommendation && (
                    <div className="inspector-advisor-field">
                      <span className="advisor-field-label">子代理建议：</span>
                      <span className="advisor-recommendation-text">
                        {req.recommendation}
                      </span>
                    </div>
                  )}

                  {req.status === "answered" && req.answer && (
                    <div className="advisor-answer-box">
                      <div className="advisor-answer-header">
                        <span className="advisor-field-label">
                          主代理答复：
                        </span>
                      </div>
                      <div className="advisor-answer-text">{req.answer}</div>
                      {req.nextInstruction && (
                        <div className="advisor-next-instruction">
                          <span className="advisor-field-label">
                            下一步指令：
                          </span>
                          <span>{req.nextInstruction}</span>
                        </div>
                      )}
                      <div className="advisor-delivery-footer">
                        {req.deliveredAt ? (
                          <span className="advisor-delivered-receipt">
                            ✓ 已投递到子代理 ·{" "}
                            {new Date(req.deliveredAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                              hour12: false,
                            })}
                          </span>
                        ) : (
                          <span className="advisor-pending-receipt">
                            ● 已在主会话保存，等待子代理同步确认
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
      {controlMessage && (
        <output className="inspector-control-output">{controlMessage}</output>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}

const EXCERPT_PREVIEW_CHARS = 220;

function MemoryExcerptCard({
  label,
  excerpt,
  messages,
  messageOffset = 0,
}: {
  readonly label?: string | undefined;
  readonly excerpt: MemoryExcerptBlock;
  readonly messages?: readonly Message[] | undefined;
  readonly messageOffset?: number | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const resolvedRecord = useMemo(
    () => resolveMessageByRef(messages, excerpt.ref, messageOffset),
    [messages, excerpt.ref, messageOffset],
  );
  const fullText =
    resolvedRecord && resolvedRecord.text.length >= excerpt.text.length
      ? resolvedRecord.text
      : excerpt.text;
  const hasLongerFullRecord = Boolean(
    resolvedRecord && resolvedRecord.text.length > excerpt.text.length,
  );
  const isLongPreview =
    !hasLongerFullRecord && excerpt.text.length > EXCERPT_PREVIEW_CHARS;
  const isExpandable = Boolean(
    excerpt.truncated || hasLongerFullRecord || isLongPreview,
  );

  const displayedText = expanded
    ? fullText
    : isLongPreview
      ? `${excerpt.text.slice(0, EXCERPT_PREVIEW_CHARS).trimEnd()}…`
      : excerpt.text;

  return (
    <div className="inspector-memory-block">
      {(label || excerpt.ref || excerpt.roleLabel || isExpandable) && (
        <div className="inspector-memory-block-head">
          {label && (
            <span className="inspector-memory-block-title">{label}</span>
          )}
          {(excerpt.roleLabel ?? resolvedRecord?.roleLabel) && (
            <span className="inspector-memory-role-pill">
              {excerpt.roleLabel ?? resolvedRecord?.roleLabel}
            </span>
          )}
          {excerpt.ref &&
            (isExpandable ? (
              <button
                type="button"
                className="inspector-memory-ref-btn"
                aria-expanded={expanded}
                title={expanded ? "点击收起记录" : "点击展开原记录"}
                onClick={() => setExpanded((prev) => !prev)}
              >
                {excerpt.ref}
              </button>
            ) : (
              <span className="inspector-memory-ref-pill">{excerpt.ref}</span>
            ))}
          {isExpandable && (
            <button
              type="button"
              className="inspector-memory-trunc-btn"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded
                ? "已展开 · 点击收起"
                : excerpt.truncated || hasLongerFullRecord
                  ? "已截断 · 点击展开"
                  : "点击展开全文"}
            </button>
          )}
        </div>
      )}
      <div className="inspector-memory-block-body">
        <Markdown source={displayedText} />
      </div>
      {isExpandable && (
        <div className="inspector-memory-expand-footer">
          <button
            type="button"
            className="inspector-memory-expand-link"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? "收起完整内容" : "展开完整内容"}
          </button>
        </div>
      )}
    </div>
  );
}

function WorkingStateItemRow({
  item,
  messages,
  messageOffset = 0,
}: {
  readonly item: MemoryRefItem;
  readonly messages?: readonly Message[] | undefined;
  readonly messageOffset?: number | undefined;
}) {
  const [expandedRef, setExpandedRef] = useState<string | null>(null);
  const [textExpanded, setTextExpanded] = useState(false);

  const isLongItemText = item.text.length > EXCERPT_PREVIEW_CHARS;
  const hasTruncatedOrLong = Boolean(item.truncated || isLongItemText);
  const displayedItemText =
    textExpanded || !isLongItemText
      ? item.text
      : `${item.text.slice(0, EXCERPT_PREVIEW_CHARS).trimEnd()}…`;

  const resolvedRefMessage = useMemo(
    () =>
      expandedRef
        ? resolveMessageByRef(messages, expandedRef, messageOffset)
        : undefined,
    [messages, expandedRef, messageOffset],
  );

  return (
    <li className="inspector-memory-list-item">
      <div className="inspector-memory-list-row">
        <span className="inspector-memory-item-text">{displayedItemText}</span>
        <span className="inspector-memory-refs">
          {hasTruncatedOrLong && (
            <button
              type="button"
              className="inspector-memory-trunc-btn"
              aria-expanded={textExpanded}
              onClick={() => setTextExpanded((prev) => !prev)}
            >
              {textExpanded ? "收起" : "已截断 · 展开"}
            </button>
          )}
          {item.refs.map((ref) => {
            const isOpen = expandedRef === ref;
            return (
              <button
                key={ref}
                type="button"
                className={`inspector-memory-ref-btn${isOpen ? " is-active" : ""}`}
                aria-expanded={isOpen}
                title={isOpen ? `收起记录 ${ref}` : `点击查看记录 ${ref}`}
                onClick={() =>
                  setExpandedRef((prev) => (prev === ref ? null : ref))
                }
              >
                {ref}
              </button>
            );
          })}
        </span>
      </div>
      {expandedRef && (
        <div className="inspector-memory-ref-preview">
          <div className="inspector-memory-block-head">
            <span className="inspector-memory-ref-pill">{expandedRef}</span>
            {resolvedRefMessage?.roleLabel && (
              <span className="inspector-memory-role-pill">
                {resolvedRefMessage.roleLabel}
              </span>
            )}
            <button
              type="button"
              className="inspector-memory-expand-link"
              onClick={() => setExpandedRef(null)}
            >
              收起
            </button>
          </div>
          <div className="inspector-memory-block-body">
            <Markdown source={resolvedRefMessage?.text ?? item.text} />
          </div>
        </div>
      )}
    </li>
  );
}

function MemoryPlanBlock({
  plan,
  currentPlan,
}: {
  readonly plan: MemoryPlanSummary;
  readonly currentPlan?: TaskPlan | null | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullExplanation =
    currentPlan?.explanation &&
    currentPlan.explanation.length > (plan.explanation?.length ?? 0)
      ? currentPlan.explanation
      : plan.explanation;
  const fullSteps =
    currentPlan?.steps && currentPlan.steps.length > plan.steps.length
      ? currentPlan.steps
      : plan.steps;
  const isExpandable = Boolean(
    plan.truncated ||
      (fullExplanation &&
        fullExplanation.length > (plan.explanation?.length ?? 0)) ||
      fullSteps.length > plan.steps.length ||
      (plan.explanation && plan.explanation.length > EXCERPT_PREVIEW_CHARS),
  );
  const activeExplanation = expanded
    ? fullExplanation
    : plan.explanation && plan.explanation.length > EXCERPT_PREVIEW_CHARS
      ? `${plan.explanation.slice(0, EXCERPT_PREVIEW_CHARS).trimEnd()}…`
      : plan.explanation;
  const activeSteps = expanded ? fullSteps : plan.steps;

  return (
    <div className="inspector-memory-block">
      <div className="inspector-memory-block-head">
        <span className="inspector-memory-block-title">
          关联计划{plan.title ? ` · ${plan.title}` : ""}
        </span>
        {isExpandable && (
          <button
            type="button"
            className="inspector-memory-trunc-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded
              ? "已展开 · 点击收起"
              : plan.truncated
                ? "已截断 · 点击展开"
                : "点击展开完整计划"}
          </button>
        )}
      </div>
      {activeExplanation && (
        <div className="inspector-memory-block-body">
          <Markdown source={activeExplanation} />
        </div>
      )}
      {activeSteps.length > 0 && (
        <ul className="inspector-memory-list">
          {activeSteps.map((s, idx) => (
            <li key={`${idx}:${s.step}`} className="inspector-memory-list-item">
              <div className="inspector-memory-list-row">
                <span className="inspector-memory-item-text">{s.step}</span>
                <span className="inspector-memory-ref-pill">
                  {s.status === "completed"
                    ? "已完成"
                    : s.status === "in_progress"
                      ? "进行中"
                      : "待执行"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContextMemoryView({
  parsed,
  messages,
  messageOffset = 0,
  currentPlan,
}: {
  readonly parsed: ParsedContextMemory;
  readonly messages?: readonly Message[] | undefined;
  readonly messageOffset?: number | undefined;
  readonly currentPlan?: TaskPlan | null | undefined;
}) {
  if (parsed.kind === "working_state") {
    return (
      <div className="inspector-memory-view wb-stack">
        {parsed.archiveRange && (
          <div className="inspector-memory-meta-row">
            <span className="inspector-memory-meta-pill">工作状态摘要</span>
            <span className="inspector-memory-ref-pill">
              归档记录 {parsed.archiveRange}
            </span>
          </div>
        )}
        {parsed.goal && (
          <div className="inspector-memory-block">
            <div className="inspector-memory-block-head">
              <span className="inspector-memory-block-title">任务目标</span>
            </div>
            <div className="inspector-memory-block-body">
              <Markdown source={parsed.goal} />
            </div>
          </div>
        )}
        {parsed.sections.map((section) => (
          <div key={section.key} className="inspector-memory-block">
            <div className="inspector-memory-block-head">
              <span className="inspector-memory-block-title">
                {section.label}
              </span>
              <span className="inspector-memory-count">
                {section.items.length}
              </span>
            </div>
            <ul className="inspector-memory-list">
              {section.items.map((item, idx) => (
                <WorkingStateItemRow
                  key={`${section.key}:${idx}`}
                  item={item}
                  messages={messages}
                  messageOffset={messageOffset}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  if (parsed.kind === "run_checkpoint") {
    return (
      <div className="inspector-memory-view wb-stack">
        <div className="inspector-memory-meta-row">
          <span className="inspector-memory-meta-pill">
            运行检查点 · {parsed.statusLabel}
          </span>
          {parsed.archiveRange && (
            <span className="inspector-memory-ref-pill">
              记录 {parsed.archiveRange}
            </span>
          )}
          {parsed.endedAt && (
            <span className="inspector-memory-time">{parsed.endedAt}</span>
          )}
          {parsed.effectsMayBeUncertain && (
            <span className="inspector-memory-trunc-pill">副作用待确认</span>
          )}
        </div>
        {parsed.initialRequest && (
          <MemoryExcerptCard
            label="初始请求"
            excerpt={parsed.initialRequest}
            messages={messages}
            messageOffset={messageOffset}
          />
        )}
        {parsed.latestRequest && (
          <MemoryExcerptCard
            label="最近请求"
            excerpt={parsed.latestRequest}
            messages={messages}
            messageOffset={messageOffset}
          />
        )}
        {parsed.latestAssistantReport && (
          <MemoryExcerptCard
            label="最近助手回复"
            excerpt={parsed.latestAssistantReport}
            messages={messages}
            messageOffset={messageOffset}
          />
        )}
        {parsed.plan && (
          <MemoryPlanBlock plan={parsed.plan} currentPlan={currentPlan} />
        )}
        {parsed.toolObservations.length > 0 && (
          <div className="inspector-memory-block">
            <div className="inspector-memory-block-head">
              <span className="inspector-memory-block-title">最近工具观察</span>
              <span className="inspector-memory-count">
                {parsed.toolObservations.length}
              </span>
            </div>
            <div className="wb-stack">
              {parsed.toolObservations.map((obs, idx) => (
                <MemoryExcerptCard
                  key={`${obs.ref ?? idx}:${idx}`}
                  excerpt={obs}
                  messages={messages}
                  messageOffset={messageOffset}
                />
              ))}
            </div>
          </div>
        )}
        {parsed.priorMemory && (
          <details
            open
            className="wb-disclosure inspector-memory-subdisclosure"
          >
            <summary>前序历史记忆摘录</summary>
            <div className="wb-disclosure-body">
              <ContextMemoryView
                parsed={parsed.priorMemory}
                messages={messages}
                messageOffset={messageOffset}
                currentPlan={currentPlan}
              />
            </div>
          </details>
        )}
      </div>
    );
  }

  if (parsed.kind === "fallback_state") {
    return (
      <div className="inspector-memory-view wb-stack">
        <div className="inspector-memory-meta-row">
          <span className="inspector-memory-meta-pill">摘录回退记忆</span>
          {parsed.archiveRange && (
            <span className="inspector-memory-ref-pill">
              归档 {parsed.archiveRange}
            </span>
          )}
          {parsed.unsummarizedRanges && (
            <span className="inspector-memory-trunc-pill">
              未摘要区间 {parsed.unsummarizedRanges}
            </span>
          )}
        </div>
        {parsed.plan && (
          <MemoryPlanBlock plan={parsed.plan} currentPlan={currentPlan} />
        )}
        {parsed.excerpts.length > 0 && (
          <div className="inspector-memory-block">
            <div className="inspector-memory-block-head">
              <span className="inspector-memory-block-title">最近记录摘录</span>
              <span className="inspector-memory-count">
                {parsed.excerpts.length}
              </span>
            </div>
            <div className="wb-stack">
              {parsed.excerpts.map((item, idx) => (
                <MemoryExcerptCard
                  key={`${item.ref ?? idx}:${idx}`}
                  excerpt={item}
                  messages={messages}
                  messageOffset={messageOffset}
                />
              ))}
            </div>
          </div>
        )}
        {parsed.previousState && (
          <details
            open
            className="wb-disclosure inspector-memory-subdisclosure"
          >
            <summary>前序记忆状态</summary>
            <div className="wb-disclosure-body">
              <ContextMemoryView
                parsed={parsed.previousState}
                messages={messages}
                messageOffset={messageOffset}
                currentPlan={currentPlan}
              />
            </div>
          </details>
        )}
      </div>
    );
  }

  if (parsed.kind === "structured_json") {
    return (
      <div className="inspector-memory-view wb-stack">
        {parsed.archiveRange && (
          <div className="inspector-memory-meta-row">
            <span className="inspector-memory-ref-pill">
              归档 {parsed.archiveRange}
            </span>
          </div>
        )}
        <dl className="wb-details inspector-details-grid">
          {parsed.entries.map((entry) => (
            <div key={entry.key} className="inspector-memory-kv-row">
              <dt>{entry.label}</dt>
              <dd>{entry.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="inspector-memory-view">
      <Markdown source={parsed.text} />
    </div>
  );
}

export function ContextManagementPanel() {
  const { state, refreshActiveSession } = useWorkbench();
  const snapshot = state.activeSnapshot;
  const scope = useRef(new OperationScope());
  const cancelScope = useRef(new OperationScope());
  useEffect(() => {
    scope.current = new OperationScope();
    cancelScope.current = new OperationScope();
    return () => {
      scope.current.close();
      cancelScope.current.close();
    };
  }, []);
  const [diagnostics, setDiagnostics] = useState<Awaited<
    ReturnType<Window["forge"]["getDiagnostics"]>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [controlMessage, setControlMessage] = useState("");
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(true);
  const [diagnosticsError, setDiagnosticsError] = useState("");
  const sessionId = snapshot?.id;
  const cancelOwned = async (id: NonNullable<typeof state.activeSessionId>) => {
    const valid = cancelScope.current.begin();
    setCancelling(true);
    setError("");
    try {
      const cancelled = await window.forge.cancelSession(id);
      if (!valid()) return;
      setControlMessage(
        cancelled ? "已取消本进程拥有的操作" : "本进程没有可取消的操作",
      );
      await refreshActiveSession();
    } catch (err) {
      if (valid()) setError(err instanceof Error ? err.message : "取消失败");
    } finally {
      if (valid()) setCancelling(false);
    }
  };
  useEffect(() => {
    let alive = true;
    setDiagnostics(null);
    setDiagnosticsError("");
    if (sessionId && diagnosticsOpen)
      void window.forge
        .getDiagnostics(sessionId)
        .then((value) => {
          if (alive) setDiagnostics(value);
        })
        .catch((err) => {
          if (alive)
            setDiagnosticsError(
              err instanceof Error ? err.message : "上下文统计读取失败",
            );
        });
    return () => {
      alive = false;
    };
  }, [sessionId, diagnosticsOpen]);

  const parsedMemory = useMemo(
    () =>
      snapshot?.contextSummary
        ? parseContextMemory(snapshot.contextSummary.content)
        : null,
    [snapshot?.contextSummary],
  );

  if (!snapshot) return null;
  const run = state.activeRuns[snapshot.id];
  const running =
    run?.status === "running" ||
    run?.status === "awaiting_approval" ||
    snapshot.status === "running" ||
    snapshot.status === "awaiting_approval";
  const usageStats = sessionUsage(snapshot.events);
  const finished = snapshot.events
    .filter((e) => e.type === "run_finished")
    .at(-1);
  const totalTokens =
    usageStats.total?.totalTokens ??
    (finished?.type === "run_finished"
      ? finished.usage?.totalTokens
      : undefined);

  return (
    <section className="wb-stack inspector-section">
      <h3>上下文与记忆</h3>
      {/* Single unified token total & context statistics disclosure (expanded by default) */}
      <details
        open
        className="wb-disclosure inspector-disclosure-card inspector-usage-card"
        onToggle={(event) => setDiagnosticsOpen(event.currentTarget.open)}
      >
        <summary>
          <span className="inspector-disclosure-head">
            <ChartBar size={14} weight="bold" />
            <span>上下文统计</span>
          </span>
          {totalTokens !== undefined && (
            <span className="inspector-token-pill">
              总计 {totalTokens.toLocaleString()} tokens
            </span>
          )}
        </summary>
        <div className="wb-disclosure-body">
          {diagnosticsError ? (
            <p role="alert" className="form-error">
              {diagnosticsError}
            </p>
          ) : !diagnostics ? (
            <p className="wb-muted">正在读取…</p>
          ) : (
            <div className="context-diagnostics-view">
              <dl className="wb-details inspector-details-grid">
                <dt>累计 Tokens</dt>
                <dd className="usage-total-highlight">
                  {totalTokens !== undefined
                    ? `${totalTokens.toLocaleString()} tokens`
                    : "尚无已结算用量"}
                </dd>
                <dt>原始记录</dt>
                <dd>
                  {diagnostics.transcriptChars.toLocaleString()} 字符 ·{" "}
                  {diagnostics.messageCount} 条消息
                </dd>
                <dt>投影上下文</dt>
                <dd>{diagnostics.projectedChars.toLocaleString()} 字符</dd>
                <dt>摘要类型</dt>
                <dd>
                  {diagnostics.summaryFallback
                    ? "摘录回退（非语义摘要）"
                    : "语义摘要 / 未压缩"}
                </dd>
              </dl>
              {finished?.type === "run_finished" && (
                <div className="inspector-usage-footer">
                  <span className="usage-footer-tag">
                    {finished.steps ?? finished.turns} 步
                  </span>
                  <span className="usage-footer-tag">
                    {finished.toolCalls} 次工具调用
                  </span>
                  {Boolean(finished.retries) && (
                    <span className="usage-footer-tag">
                      {finished.retries} 次请求重试
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </details>
      {snapshot.contextSummary && parsedMemory && (
        <details
          open
          className="wb-disclosure inspector-disclosure-card inspector-memory-card"
        >
          <summary>
            <span className="inspector-disclosure-head">
              <span>
                已保存摘要 · 边界 {snapshot.contextSummary.boundary}
                {snapshot.contextSummary.fallback ? " · 摘录回退" : ""}
              </span>
            </span>
          </summary>
          <div className="wb-disclosure-body">
            <ContextMemoryView
              parsed={parsedMemory}
              messages={snapshot.messages}
              messageOffset={snapshot.transcript?.messageOffset}
              currentPlan={snapshot.plan}
            />
          </div>
        </details>
      )}
      <div className="context-compaction-row">
        <Button
          size="sm"
          disabled={busy || running}
          onClick={async () => {
            const valid = scope.current.begin();
            setBusy(true);
            setError("");
            try {
              await window.forge.compactSession(snapshot.id);
              if (valid()) await refreshActiveSession();
            } catch (err) {
              if (valid())
                setError(err instanceof Error ? err.message : "压缩失败");
            } finally {
              if (valid()) setBusy(false);
            }
          }}
        >
          <ArrowsInLineVertical size={13} weight="bold" />
          <span>{busy ? "正在压缩…" : "压缩上下文"}</span>
        </Button>
        <p className="wb-muted context-compaction-hint">
          {running
            ? "运行结束后可压缩，原始记录保留。"
            : "保留原始记录，仅压缩模型使用的上下文。"}
        </p>
      </div>
      {busy && (
        <Button
          variant="danger"
          disabled={cancelling}
          onClick={() => void cancelOwned(snapshot.id)}
        >
          {cancelling ? "等待取消确认…" : "取消上下文压缩"}
        </Button>
      )}
      {controlMessage && <output>{controlMessage}</output>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function RuntimePanels() {
  const { state } = useWorkbench();
  const snapshot = state.activeSnapshot;
  if (!snapshot) return null;
  return (
    <>
      <PlanSection snapshot={snapshot} />
      <SubAgentsPanel />
      <ContextManagementPanel />
    </>
  );
}
