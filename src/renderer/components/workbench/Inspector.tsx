import type { FileChange } from "@forge/core/shared/schemas";
import {
  ArrowSquareOut,
  ArrowsCounterClockwise,
  CaretRight,
  FileCode,
  FolderOpen,
  Plugs,
  SidebarSimple,
} from "@phosphor-icons/react";
import { useEffect, useReducer, useRef } from "react";
import {
  type InspectorPhase,
  type InspectorSectionId,
  readSectionOverrides,
  rememberSectionOpen,
  resolveSectionOpen,
  subscribeInspectorSection,
} from "../../state/inspector-sections";
import { permissionLabels } from "../../state/permission-labels";
import {
  shallowArrayEqual,
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { openWorkspaceResources } from "../../state/workspace-resources";
import { ApprovalPanel } from "../primitives/ApprovalPanel";
import { Button } from "../primitives/Button";
import { DiffViewer, diffStats } from "../primitives/DiffViewer";
import { EmptyState } from "../primitives/EmptyState";
import { IconButton } from "../primitives/IconButton";
import { StatusBadge } from "../primitives/StatusBadge";
import { Tag, type TagTone } from "../primitives/Tag";
import { BrowserPanel } from "./BrowserPanel";
import { CheckpointPanel } from "./CatalogPanels";
import { ChangeSessionNavigation } from "./ChangeSessionNavigation";
import { InspectorSection } from "./InspectorSection";
import {
  ContextManagementPanel,
  PlanOverview,
  SubAgentsPanel,
  planOverviewSummary,
} from "./RuntimePanels";
import "./inspector.css";
import "./inspector-sections.css";

const CHANGE_KIND: Record<
  FileChange["kind"],
  { readonly label: string; readonly tone: TagTone }
> = {
  modified: { label: "修改", tone: "accent" },
  created: { label: "新增", tone: "success" },
  deleted: { label: "删除", tone: "warning" },
};

const FAILED_CHILD = new Set(["failed", "interrupted"]);

function ChangeRow({ change }: { readonly change: FileChange }) {
  const stats = diffStats(change);
  const lastSlash = change.path.lastIndexOf("/");
  const dir = lastSlash >= 0 ? change.path.slice(0, lastSlash + 1) : "";
  const name = lastSlash >= 0 ? change.path.slice(lastSlash + 1) : change.path;
  const kind = CHANGE_KIND[change.kind] ?? CHANGE_KIND.modified;
  return (
    // Diffs stay collapsed: the list reads as a file summary first.
    <details className="inspector-change">
      <summary className="inspector-change-row" title={change.path}>
        <CaretRight
          size={10}
          weight="bold"
          className="inspector-change-caret"
          aria-hidden="true"
        />
        <FileCode size={13} className="inspector-change-icon" aria-hidden />
        <span className="inspector-change-path">
          {dir && <span className="inspector-change-dir">{dir}</span>}
          <span className="inspector-change-name">{name}</span>
        </span>
        {stats && (
          <span className="diff-stats-pill">
            {stats.added > 0 && (
              <span className="diff-stats-add">+{stats.added}</span>
            )}
            {stats.removed > 0 && (
              <span className="diff-stats-del">-{stats.removed}</span>
            )}
          </span>
        )}
        <Tag tone={kind.tone}>{kind.label}</Tag>
      </summary>
      <div className="inspector-diff-container">
        <DiffViewer change={change} isSuggested={false} embedded />
      </div>
    </details>
  );
}

export function Inspector({
  onRequestCollapse,
  focusToken,
}: {
  readonly onRequestCollapse?: (() => void) | undefined;
  readonly focusToken?: number | undefined;
}) {
  const { answerApproval, selectSession, refreshActiveSession } =
    useWorkbenchActions();
  // Run state is reduced to the fields the drawer renders, so streamed tokens
  // (which replace the run object) do not re-render the whole inspector.
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
      activeSnapshot: state.activeSnapshot,
      isSnapshotLoading: state.isSnapshotLoading,
      sessions: state.sessions,
      settings: state.settings,
    }),
    shallowEqual,
  );
  const run = useWorkbenchSelector(({ state }) => {
    const active = state.activeSessionId
      ? state.activeRuns[state.activeSessionId]
      : undefined;
    return active
      ? {
          status: active.status,
          permission: active.permission,
          pendingApproval: active.pendingApproval,
        }
      : undefined;
  }, shallowEqual);
  const pendingApprovals = useWorkbenchSelector(
    ({ state }) =>
      Object.values(state.activeRuns)
        .filter((r) => r.pendingApproval)
        .map((r) => ({
          sessionId: r.sessionId,
          pendingApproval: r.pendingApproval,
          isCancelling: r.isCancelling,
          isSubmittingApproval: r.isSubmittingApproval,
        })),
    shallowArrayEqual,
  );
  const [, rerender] = useReducer((tick: number) => tick + 1, 0);
  const paneRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (focusToken && focusToken > 0) paneRef.current?.focus();
  }, [focusToken]);
  // Never show another session's provenance while selection/read is in flight.
  const snapshot =
    state.activeSnapshot?.id === state.activeSessionId
      ? state.activeSnapshot
      : null;
  const sessionKey = snapshot?.id ?? "";
  useEffect(
    () =>
      subscribeInspectorSection((id) => {
        if (!sessionKey) return;
        rememberSectionOpen(sessionKey, id, true);
        rerender();
        requestAnimationFrame(() =>
          paneRef.current
            ?.querySelector(`[data-section="${id}"]`)
            ?.scrollIntoView({ block: "start", behavior: "auto" }),
        );
      }),
    [sessionKey],
  );
  const status = run?.status ?? snapshot?.status;
  const phase: InspectorPhase =
    status === "running" || status === "awaiting_approval"
      ? "running"
      : "settled";
  const overrides = sessionKey ? readSectionOverrides(sessionKey) : undefined;
  const section = (id: InspectorSectionId) => ({
    open: resolveSectionOpen(overrides, phase, id),
    onToggle: (open: boolean) => {
      if (!sessionKey) return;
      rememberSectionOpen(sessionKey, id, open);
      rerender();
    },
  });

  const started = snapshot?.events
    .filter((e) => e.type === "run_started")
    .at(-1);
  const storedActive =
    !run &&
    (snapshot?.status === "running" ||
      snapshot?.status === "awaiting_approval");
  // The selected session's live request is decided in the Transcript; the
  // Inspector only carries requests that would otherwise go unseen
  // (background sessions and subagents).
  const inlineApprovalId = run?.pendingApproval?.id;
  const drawerApprovals = pendingApprovals.filter(
    (r) => r.pendingApproval?.id !== inlineApprovalId,
  );
  const children = snapshot
    ? state.sessions
        .filter((session) => session.parentSessionId === snapshot.id)
        .sort(
          (a, b) =>
            a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
        )
    : [];
  const failedChildren = children.filter((child) =>
    FAILED_CHILD.has(child.status),
  );
  const attentionCount = drawerApprovals.length + failedChildren.length;
  const runningChildren = children.filter(
    (child) =>
      child.status === "running" || child.status === "awaiting_approval",
  ).length;
  const doneChildren = children.filter(
    (child) => child.status === "completed",
  ).length;
  const hasSubtasks = Boolean(
    snapshot &&
      (children.length > 0 ||
        snapshot.parentSessionId ||
        snapshot.agentTask ||
        snapshot.agentProfile),
  );
  const permission =
    run?.permission ??
    (started?.type === "run_started"
      ? started.permission
      : (state.settings?.defaultPermission ?? "workspace"));
  const model =
    started?.type === "run_started" ? started.model : snapshot?.model;
  const changes = snapshot?.changes ?? [];
  const hasLinkedChanges = Boolean(
    snapshot && (snapshot.parentSessionId || children.length > 0),
  );
  const sessionOpen = section("session");

  return (
    <aside
      ref={paneRef}
      tabIndex={-1}
      className="workbench-inspector wb-inspector"
      aria-label="会话详情"
    >
      <div className="inspector-header wb-inspector-head">
        <div className="inspector-title-row">
          <span className="inspector-head-title">会话详情</span>
          {snapshot && status && <StatusBadge status={status} />}
        </div>
        <div className="inspector-head-actions">
          {onRequestCollapse && (
            <IconButton
              size="sm"
              className="wb-inspector-close"
              label="收起详情"
              icon={<SidebarSimple size={15} />}
              onClick={onRequestCollapse}
            />
          )}
        </div>
      </div>
      <div className="inspector-scroll">
        {!snapshot ? (
          <>
            {drawerApprovals.length > 0 && (
              <p className="wb-muted inspector-empty">
                有 {drawerApprovals.length} 个后台请求待批准，打开对应会话处理。
              </p>
            )}
            {state.isSnapshotLoading ? (
              <p className="wb-muted inspector-empty">正在读取执行记录…</p>
            ) : (
              <EmptyState
                variant="compact"
                className="inspector-empty"
                title="选择一个会话，查看详情"
              />
            )}
          </>
        ) : (
          <div className="inspector-sections-list">
            {attentionCount > 0 && (
              <InspectorSection
                id="attention"
                title="需要处理"
                tone="attention"
                summary={`${attentionCount} 项`}
                {...section("attention")}
              >
                {drawerApprovals.map((r) => {
                  const request = r.pendingApproval;
                  if (!request) return null;
                  const background = r.sessionId !== state.activeSessionId;
                  return (
                    <div key={request.id} className="inspector-attention-item">
                      <div className="inspector-attention-meta">
                        <span>
                          {request.childSessionId
                            ? `子任务审批 · ${request.childSessionId}`
                            : "后台会话待批准"}
                        </span>
                        {background && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void selectSession(r.sessionId)}
                          >
                            打开会话
                          </Button>
                        )}
                      </div>
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
                    </div>
                  );
                })}
                {failedChildren.map((child) => (
                  <div key={child.id} className="inspector-attention-item">
                    <div className="inspector-attention-meta">
                      <span className="inspector-attention-title">
                        子任务{child.status === "failed" ? "失败" : "已中断"} ·{" "}
                        {child.title}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void selectSession(child.id)}
                      >
                        查看
                      </Button>
                    </div>
                  </div>
                ))}
              </InspectorSection>
            )}

            <InspectorSection
              id="progress"
              title="进度"
              summary={planOverviewSummary(snapshot)}
              {...section("progress")}
            >
              <PlanOverview snapshot={snapshot} />
            </InspectorSection>

            {hasSubtasks && (
              <InspectorSection
                id="subtasks"
                title="子任务"
                summary={
                  children.length === 0
                    ? "当前为子任务"
                    : [
                        `${children.length} 个`,
                        runningChildren > 0 ? `${runningChildren} 运行中` : "",
                        doneChildren > 0 ? `${doneChildren} 完成` : "",
                        failedChildren.length > 0
                          ? `${failedChildren.length} 异常`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                }
                {...section("subtasks")}
              >
                <SubAgentsPanel key={`subagents:${snapshot.id}`} embedded />
              </InspectorSection>
            )}

            <InspectorSection
              id="changes"
              title="变更"
              summary={
                changes.length > 0 ? `${changes.length} 个文件` : "暂无变更"
              }
              {...section("changes")}
            >
              {changes.length > 0 ? (
                <div className="inspector-change-list">
                  {changes.map((change, i) => (
                    <ChangeRow key={`${change.path}-${i}`} change={change} />
                  ))}
                </div>
              ) : (
                <p className="wb-muted inspector-row-hint">
                  本会话尚无直接文件变更
                </p>
              )}
              {hasLinkedChanges && (
                <details className="inspector-row-disclosure">
                  <summary>
                    <span>关联任务的变更</span>
                  </summary>
                  <div className="inspector-row-disclosure-body">
                    <ChangeSessionNavigation
                      key={`changes-navigation:${snapshot.id}`}
                      sessionId={snapshot.id}
                      parentSessionId={snapshot.parentSessionId}
                      sessions={state.sessions}
                      onOpenChanges={(id) => {
                        rememberSectionOpen(id, "changes", true);
                        void selectSession(id);
                      }}
                    />
                  </div>
                </details>
              )}
              <CheckpointPanel key={`checkpoints:${snapshot.id}`} />
            </InspectorSection>

            <ContextManagementPanel
              key={`context:${snapshot.id}`}
              section={section("context")}
            />

            <InspectorSection
              id="session"
              title="会话信息"
              summary={permissionLabels[permission].split(" · ")[0]}
              action={
                <IconButton
                  size="sm"
                  label="刷新记录"
                  icon={<ArrowsCounterClockwise size={13} weight="bold" />}
                  onClick={() => void refreshActiveSession()}
                />
              }
              {...sessionOpen}
            >
              <dl className="wb-details inspector-info-grid">
                <dt>模型</dt>
                <dd className="wb-val-mono" title={model}>
                  <code>{model}</code>
                </dd>
                <dt>权限</dt>
                <dd>{permissionLabels[permission].split(" · ")[0]}</dd>
                <dt>工作区</dt>
                <dd className="wb-val-mono" title={snapshot.workspace}>
                  <code>{snapshot.workspace}</code>
                </dd>
              </dl>
              {storedActive && (
                <p className="wb-muted inspector-stored-notice">
                  已保存的状态，本窗口没有运行句柄。刷新可查看最新记录；取消操作由主机确认。
                </p>
              )}
              <BrowserRow
                sessionId={snapshot.id}
                permission={permission}
                visible={sessionOpen.open}
              />
            </InspectorSection>
          </div>
        )}
      </div>
      {snapshot && (
        <div className="inspector-footer">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openWorkspaceResources("files")}
          >
            <FolderOpen size={13} aria-hidden="true" />
            <span>工作区文件</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openWorkspaceResources("resources")}
          >
            <Plugs size={13} aria-hidden="true" />
            <span>项目资源与 MCP</span>
            <ArrowSquareOut size={11} aria-hidden="true" />
          </Button>
        </div>
      )}
    </aside>
  );
}

/**
 * 浏览器只占会话信息里的一行；展开后才挂载完整面板并开始探测状态，
 * 面板仍按会话绑定（key）且只在可见时探测。
 */
function BrowserRow({
  sessionId,
  permission,
  visible,
}: {
  readonly sessionId: string;
  readonly permission: Parameters<typeof BrowserPanel>[0]["permission"];
  readonly visible: boolean;
}) {
  const [open, toggle] = useReducer((value: boolean) => !value, false);
  return (
    <details
      className="inspector-row-disclosure"
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) toggle();
      }}
    >
      <summary>
        <span>浏览器</span>
        <span className="inspector-row-hint">
          {open ? "预览与接管" : "展开后检测状态"}
        </span>
      </summary>
      {open && (
        <div className="inspector-row-disclosure-body">
          <BrowserPanel
            key={`browser:${sessionId}`}
            sessionId={sessionId}
            permission={permission}
            active={visible && open}
          />
        </div>
      )}
    </details>
  );
}
