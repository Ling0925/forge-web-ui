import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsCounterClockwise,
  Browser,
  CaretRight,
  ClockCounterClockwise,
  FileCode,
  FolderOpen,
  Gauge,
  PuzzlePiece,
  SidebarSimple,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { permissionLabels } from "../../state/permission-labels";
import { useWorkbench } from "../../state/workbench-context";
import { ApprovalPanel } from "../primitives/ApprovalPanel";
import { Button } from "../primitives/Button";
import { DiffViewer, diffStats } from "../primitives/DiffViewer";
import { StatusBadge } from "../primitives/StatusBadge";
import { CheckpointPanel, ProjectResources } from "./CatalogPanels";
import { BrowserPanel } from "./BrowserPanel";
import { ChangeSessionNavigation } from "./ChangeSessionNavigation";
import {
  ContextManagementPanel,
  PlanDocumentPanel,
  PlanSteps,
  SubAgentsPanel,
  resolveDisplayPlans,
} from "./RuntimePanels";
import { WorkspaceFileManager, changeKindMeta } from "./WorkspaceFileManager";
import "./inspector.css";
import "./inspector-v2.css";

// The Transcript renders the selected session's live request inline; the
// Inspector owns every other request (background, child, other session).
function scrollToInlineApproval(approvalId: string) {
  const target = document.querySelector(`[data-approval-id="${approvalId}"]`);
  if (target instanceof HTMLElement)
    target.scrollIntoView({ block: "center", behavior: "auto" });
}

type InspectorView =
  | "summary"
  | "files"
  | "changes"
  | "plan-history"
  | "subagents"
  | "context"
  | "browser"
  | "resources";

const viewTitles: Readonly<Record<Exclude<InspectorView, "summary">, string>> = {
  files: "工作区文件",
  changes: "变更与检查点",
  "plan-history": "计划说明与历史",
  subagents: "子任务",
  context: "上下文与用量",
  browser: "浏览器",
  resources: "项目资源",
};

/** One collapsible summary section: "标题 计数 ⌄". Empty sections never render. */
function SummarySection({
  title,
  count,
  action,
  children,
}: {
  readonly title: string;
  readonly count?: number | string | undefined;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const id = `inspector-section-${title}`;
  return (
    <section className="inspector-summary-section" data-open={open}>
      <div className="inspector-summary-head">
        <button
          type="button"
          className="inspector-summary-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
        >
          <h3>{title}</h3>
          {count !== undefined && <span className="inspector-summary-count">{count}</span>}
          <CaretRight size={12} weight="bold" className="inspector-summary-caret" aria-hidden="true" />
        </button>
        {action}
      </div>
      <div className="inspector-summary-collapse" id={id} hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function SummaryRow({
  icon,
  label,
  meta,
  onClick,
  title,
}: {
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly meta?: ReactNode;
  readonly onClick?: () => void;
  readonly title?: string;
}) {
  const content = (
    <>
      <span className="inspector-row-icon" aria-hidden="true">{icon}</span>
      <span className="inspector-row-label" title={title}>{label}</span>
      {meta !== undefined && <span className="inspector-row-meta">{meta}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className="inspector-row is-interactive" onClick={onClick}>
      {content}
      <CaretRight size={11} weight="bold" className="inspector-row-caret" aria-hidden="true" />
    </button>
  ) : (
    <div className="inspector-row">{content}</div>
  );
}

const childStatusTone = (status: string) =>
  status === "completed"
    ? "done"
    : status === "running" || status === "awaiting_approval"
      ? "active"
      : status === "failed" || status === "interrupted" || status === "cancelled"
        ? "failed"
        : "idle";

export function Inspector({
  onRequestCollapse,
  focusToken,
}: {
  readonly onRequestCollapse?: (() => void) | undefined;
  readonly focusToken?: number | undefined;
}) {
  const [view, setView] = useState<InspectorView>("summary");
  const { state, answerApproval, selectSession, refreshActiveSession, setMobileTab } =
    useWorkbench();
  const paneRef = useRef<HTMLElement | null>(null);
  const backRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (focusToken && focusToken > 0) paneRef.current?.focus();
  }, [focusToken]);
  useEffect(() => {
    if (view !== "summary") backRef.current?.focus();
  }, [view]);
  // Never show another session's provenance while selection/read is in flight.
  const snapshot =
    state.activeSnapshot?.id === state.activeSessionId
      ? state.activeSnapshot
      : null;
  const run = state.activeSessionId
    ? state.activeRuns[state.activeSessionId]
    : undefined;
  const started = snapshot?.events
    .filter((e) => e.type === "run_started")
    .at(-1);
  const storedActive =
    !run &&
    (snapshot?.status === "running" ||
      snapshot?.status === "awaiting_approval");
  const pendingApprovals = Object.values(state.activeRuns).filter(
    (r) => r.pendingApproval,
  );
  // Exactly one request can be the selected session's live head; the
  // Transcript already renders it in the reading flow, so the drawer only
  // annotates and links it instead of duplicating the buttons. `run` is
  // keyed by the active session, so its pending request is that exact head.
  const inlineApprovalId = run?.pendingApproval?.id;
  const inlineCovered = pendingApprovals.filter(
    (r) => r.pendingApproval?.id === inlineApprovalId,
  );
  const drawerApprovals = pendingApprovals.filter(
    (r) => r.pendingApproval?.id !== inlineApprovalId,
  );
  const permission =
    run?.permission ??
    (started?.type === "run_started"
      ? started.permission
      : (state.settings?.defaultPermission ?? "workspace"));
  const model = started?.type === "run_started" ? started.model : snapshot?.model;
  const plans = snapshot ? resolveDisplayPlans(snapshot) : null;
  const children = snapshot
    ? state.sessions
        .filter((session) => session.parentSessionId === snapshot.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    : [];
  const hasRelatedChanges = Boolean(
    snapshot &&
      (snapshot.parentSessionId ||
        state.sessions.some((session) => session.parentSessionId === snapshot.id)),
  );
  const isSummary = view === "summary";

  return (
    <aside
      ref={paneRef}
      tabIndex={-1}
      className="workbench-inspector wb-inspector"
      aria-label="执行详情"
    >
      <div className="inspector-header wb-inspector-head">
        <div className="inspector-title-row">
          {isSummary ? (
            <>
              <span>概要</span>
              {snapshot && <StatusBadge status={run?.status ?? snapshot.status} />}
            </>
          ) : (
            <>
              <button
                ref={backRef}
                type="button"
                className="wb-icon-btn inspector-back"
                aria-label="返回概要"
                title="返回概要"
                onClick={() => setView("summary")}
              >
                <ArrowLeft size={14} weight="bold" />
              </button>
              <span>{viewTitles[view]}</span>
            </>
          )}
        </div>
        <div className="inspector-head-actions">
          {onRequestCollapse && (
            <button
              type="button"
              className="wb-icon-btn wb-inspector-close"
              aria-label="收起详情"
              title="收起详情"
              onClick={onRequestCollapse}
            >
              <SidebarSimple size={15} className="wb-inspector-close-icon" />
            </button>
          )}
        </div>
      </div>
      <div className="inspector-scroll wb-stack">
        {pendingApprovals.length > 0 && (
          // Approvals are never hidden behind a disclosure or a collapsed
          // pane: this summary (and the header pill in App) always shows the
          // pending count before any per-request detail. The selected
          // session's live request is decided in the Transcript, so the drawer
          // links to it instead of duplicating its buttons; every other
          // request (background / child) still gets a full panel here.
          <section className="wb-approvals-summary wb-stack">
            <h3 className="wb-approvals-title">
              待批准（{pendingApprovals.length}）
            </h3>
            {inlineCovered.map((r) => {
              const request = r.pendingApproval;
              if (!request) return null;
              return (
                <section
                  key={request.id}
                  className="wb-approval-row wb-approval-row-inline wb-stack"
                >
                  <p className="wb-muted">在对话中批准或拒绝本次操作。</p>
                  <div className="wb-row">
                    <span>
                      {request.toolName}
                      {request.childSessionId
                        ? ` · 子代理 ${request.childSessionId}`
                        : ""}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        setMobileTab("task");
                        requestAnimationFrame(() => scrollToInlineApproval(request.id));
                      }}
                    >
                      定位到消息流
                    </Button>
                  </div>
                </section>
              );
            })}
            {drawerApprovals.map((r) => {
              const request = r.pendingApproval;
              if (!request) return null;
              return (
                <section key={request.id} className="wb-approval-row wb-stack">
                  {r.sessionId !== state.activeSessionId && (
                    <Button onClick={() => void selectSession(r.sessionId)}>
                      后台任务待批准 · 打开会话
                    </Button>
                  )}
                  {request.childSessionId && (
                    <p className="wb-muted">
                      子代理审批 · {request.childSessionId}
                    </p>
                  )}
                  <ApprovalPanel
                    toolName={request.toolName}
                    description={request.description}
                    command={
                      request.command
                        ? JSON.stringify(request.command)
                        : request.description
                    }
                    isSubmitting={Boolean(
                      r.isSubmittingApproval || r.isCancelling,
                    )}
                    riskNotice="命令不是 OS 沙箱；批准仅对本次请求有效。"
                    onApprove={() =>
                      void answerApproval(r.sessionId, request.id, true)
                    }
                    onReject={() =>
                      void answerApproval(r.sessionId, request.id, false)
                    }
                  />
                </section>
              );
            })}
          </section>
        )}
        {!snapshot ? (
          <p className="wb-muted inspector-empty">
            {state.isSnapshotLoading
              ? "正在读取执行记录…"
              : "选择一个会话，查看执行详情"}
          </p>
        ) : isSummary ? (
          <div className="inspector-summary">
            {plans?.currentPlan && plans.currentProgress && (
              <SummarySection
                title="进度"
                count={`${plans.currentProgress.completed}/${plans.currentProgress.total}`}
                action={
                  plans.currentPlan.explanation || plans.historical.length > 0 ? (
                    <button
                      type="button"
                      className="inspector-summary-link"
                      onClick={() => setView("plan-history")}
                    >
                      {plans.historical.length > 0 ? `说明与历史 ${plans.historical.length}` : "说明"}
                    </button>
                  ) : undefined
                }
              >
                {plans.currentPlan.title && (
                  <p className="inspector-summary-caption">{plans.currentPlan.title}</p>
                )}
                <PlanSteps plan={plans.currentPlan} />
              </SummarySection>
            )}
            {children.length > 0 && (
              <SummarySection
                title="子任务"
                count={children.length}
                action={
                  <button
                    type="button"
                    className="inspector-summary-link"
                    onClick={() => setView("subagents")}
                  >
                    详情
                  </button>
                }
              >
                {children.map((child) => (
                  <SummaryRow
                    key={child.id}
                    icon={<span className={`inspector-row-dot is-${childStatusTone(child.status)}`} />}
                    label={child.title}
                    title={child.title}
                    meta={child.agentProfileName}
                    onClick={() => void selectSession(child.id)}
                  />
                ))}
              </SummarySection>
            )}
            {snapshot.parentSessionId && (
              <SummarySection title="父任务">
                <SummaryRow
                  icon={<ArrowSquareOut size={14} />}
                  label="打开父任务"
                  onClick={() => void selectSession(snapshot.parentSessionId!)}
                />
              </SummarySection>
            )}
            {snapshot.changes.length > 0 && (
              <SummarySection
                title="文件"
                count={snapshot.changes.length}
                action={
                  <button
                    type="button"
                    className="inspector-summary-link"
                    onClick={() => setView("changes")}
                  >
                    查看变更
                  </button>
                }
              >
                {snapshot.changes.map((change, i) => {
                  const stats = diffStats(change);
                  const name = change.path.slice(change.path.lastIndexOf("/") + 1);
                  return (
                    <SummaryRow
                      key={`${change.path}-${i}`}
                      icon={<FileCode size={14} />}
                      label={name}
                      title={change.path}
                      meta={
                        stats ? (
                          <span className="diff-stats-pill">
                            {stats.added > 0 && <span className="diff-stats-add">+{stats.added}</span>}
                            {stats.removed > 0 && <span className="diff-stats-del">-{stats.removed}</span>}
                          </span>
                        ) : (
                          changeKindMeta(change.kind).label
                        )
                      }
                      onClick={() => setView("changes")}
                    />
                  );
                })}
              </SummarySection>
            )}
            <SummarySection title="会话">
              <dl className="inspector-facts">
                <dt>模型</dt>
                <dd title={model}>{model}</dd>
                <dt>权限</dt>
                <dd>{permissionLabels[permission].split(" · ")[0]}</dd>
                <dt>工作区</dt>
                <dd title={snapshot.workspace}>
                  {snapshot.workspace.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || snapshot.workspace}
                </dd>
              </dl>
              {storedActive && (
                <p className="wb-muted inspector-stored-notice">
                  已保存的状态，本窗口没有运行句柄。刷新可查看最新记录；取消操作由主机确认。
                </p>
              )}
            </SummarySection>
            {!plans?.currentPlan && children.length === 0 && snapshot.changes.length === 0 && (
              <p className="inspector-summary-empty">
                执行计划、子任务和文件变更出现后会显示在这里。
              </p>
            )}
            <nav className="inspector-more" aria-label="更多工具">
              <SummaryRow icon={<FolderOpen size={14} />} label="工作区文件" onClick={() => setView("files")} />
              <SummaryRow icon={<ClockCounterClockwise size={14} />} label="变更与检查点" onClick={() => setView("changes")} />
              <SummaryRow icon={<Gauge size={14} />} label="上下文与用量" onClick={() => setView("context")} />
              <SummaryRow icon={<Browser size={14} />} label="浏览器" onClick={() => setView("browser")} />
              <SummaryRow icon={<PuzzlePiece size={14} />} label="项目资源" onClick={() => setView("resources")} />
              <button
                type="button"
                className="inspector-row is-interactive inspector-refresh-row"
                onClick={() => void refreshActiveSession()}
              >
                <span className="inspector-row-icon" aria-hidden="true">
                  <ArrowsCounterClockwise size={14} />
                </span>
                <span className="inspector-row-label">刷新记录</span>
              </button>
            </nav>
          </div>
        ) : (
          <div className="inspector-subview" data-view={view}>
            {view === "files" && (
              <WorkspaceFileManager
                session={snapshot}
                liveEvents={[]}
                active
                onSelectChangesTab={() => setView("changes")}
              />
            )}
            {view === "changes" && (
              <div className="wb-stack">
                {hasRelatedChanges && (
                  <details className="wb-disclosure">
                    <summary>关联任务的变更</summary>
                    <div className="wb-disclosure-body">
                      <ChangeSessionNavigation
                        key={`changes-navigation:${snapshot.id}`}
                        sessionId={snapshot.id}
                        parentSessionId={snapshot.parentSessionId}
                        sessions={state.sessions}
                        onOpenChanges={(id) => {
                          void selectSession(id);
                        }}
                      />
                    </div>
                  </details>
                )}
                <section className="wb-stack inspector-changes-section">
                  <div className="inspector-section-header">
                    <h3>
                      文件变更{" "}
                      <span className="wb-muted">{snapshot.changes.length}</span>
                    </h3>
                  </div>
                  {snapshot.changes.length ? (
                    <div className="inspector-files-list">
                      {snapshot.changes.map((change, i) => {
                        const stats = diffStats(change);
                        const lastSlash = change.path.lastIndexOf("/");
                        const dir = lastSlash >= 0 ? change.path.slice(0, lastSlash + 1) : "";
                        const name = lastSlash >= 0 ? change.path.slice(lastSlash + 1) : change.path;
                        return (
                          <details
                            open
                            key={`${change.path}-${i}`}
                            className="wb-disclosure inspector-file-card"
                          >
                            <summary className="inspector-file-summary">
                              <div className="inspector-file-info">
                                <FileCode size={14} className="inspector-file-icon" />
                                <span className="inspector-file-path" title={change.path}>
                                  {dir && <span className="inspector-file-dir">{dir}</span>}
                                  <span className="inspector-file-name">{name}</span>
                                </span>
                              </div>
                              <div className="inspector-file-badges">
                                {stats && (
                                  <span className="diff-stats-pill">
                                    {stats.added > 0 && <span className="diff-stats-add">+{stats.added}</span>}
                                    {stats.removed > 0 && <span className="diff-stats-del">-{stats.removed}</span>}
                                  </span>
                                )}
                                <span className={`inspector-file-kind ${changeKindMeta(change.kind).className}`}>
                                  {changeKindMeta(change.kind).label}
                                </span>
                              </div>
                            </summary>
                            <div className="inspector-diff-container">
                              <DiffViewer change={change} isSuggested={false} embedded />
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="inspector-empty-card">
                      <p className="wb-muted">本会话尚无直接文件变更</p>
                    </div>
                  )}
                </section>
                <details open className="wb-disclosure">
                  <summary>文件检查点与恢复</summary>
                  <div className="wb-disclosure-body">
                    <CheckpointPanel key={`changes-checkpoints:${state.activeSessionId ?? "none"}`} />
                  </div>
                </details>
              </div>
            )}
            {view === "plan-history" && <PlanDocumentPanel snapshot={snapshot} />}
            {view === "subagents" && (
              <SubAgentsPanel key={`subagents:${state.activeSessionId ?? "none"}`} />
            )}
            {view === "context" && (
              <ContextManagementPanel key={`context:${state.activeSessionId ?? "none"}`} />
            )}
            {view === "browser" && (
              // Same-session binding: the panel is keyed and scoped to the
              // selected session and only probes while this view is open.
              <BrowserPanel
                key={`browser:${state.activeSessionId ?? "none"}`}
                sessionId={state.activeSessionId ?? undefined}
                permission={permission}
                active
              />
            )}
            {view === "resources" && (
              <ProjectResources key={state.activeSessionId ?? "none"} />
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
