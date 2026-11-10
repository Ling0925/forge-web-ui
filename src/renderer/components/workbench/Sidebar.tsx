import { isPrimarySession, sessionOriginWorkspace } from "@forge/core/shared";
import {
  Archive,
  ArrowClockwise,
  CaretRight,
  ChartBar,
  Files,
  Gear,
  MagnifyingGlass,
  NotePencil,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Kbd } from "#ui/kbd";
import type { SessionSummary } from "../../shared-types";
import { modelServiceStatus } from "../../state/model-service-status";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { openWorkspaceResources } from "../../state/workspace-resources";
import { EmptyState } from "../primitives/EmptyState";
import { ForgeMark } from "../primitives/ForgeMark";
import { IconButton } from "../primitives/IconButton";
import { SessionListItem } from "./SessionListItem";
import { SuperAgentSessions } from "./SuperAgentSessions";
import "./sidebar-v2.css";

/** Modifier label for the real Ctrl/Cmd+N shortcut (state/modal-shortcuts.ts). */
const NEW_TASK_MOD =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent)
    ? "⌘"
    : "Ctrl";

/** Folder label for a workspace path; the full path stays available as a tooltip. */
function workspaceName(workspace: string) {
  const trimmed = workspace.replace(/[\\/]+$/, "");
  const leaf = trimmed.split(/[\\/]/).pop();
  return leaf && leaf.length > 0 ? leaf : workspace;
}

interface SessionGroup {
  readonly workspace: string;
  readonly sessions: readonly SessionSummary[];
}

const DEFAULT_VISIBLE_COUNT = 10;
/** Collapse-state key; workspace keys are absolute paths, so this never clashes. */
const SUPER_AGENT_FOLDER = "superagent:";
const PAGE_SIZE = 10;

export function Sidebar() {
  const {
    openNewSession,
    setMobileSidebar,
    openSettings,
    openUsageDashboard,
    createSession,
    selectSession,
  } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
      activeSnapshotModel: state.activeSnapshot?.model,
      isMobileSidebarOpen: state.isMobileSidebarOpen,
      isSessionsLoading: state.isSessionsLoading,
      sessions: state.sessions,
      settings: state.settings,
    }),
    shallowEqual,
  );

  const serviceStatus = modelServiceStatus(state.settings);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState<string | null>(
    null,
  );
  const [collapsedFolders, setCollapsedFolders] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const [visibleLimits, setVisibleLimits] = useState<
    Readonly<Record<string, number>>
  >({});
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const sessions = state.sessions.filter(isPrimarySession);
  const matched = sessions.filter(
    (session) =>
      (showArchived || !session.archived) &&
      `${session.title} ${sessionOriginWorkspace(session)}`
        .toLowerCase()
        .includes(needle),
  );
  // Super-agent Router/Worker sessions get their own group (by core agentRole).
  const filtered = matched.filter((session) => !session.agentRole);
  const agentSessions = matched.filter((session) => session.agentRole);
  // Keep navigation independent of activity-ordered API results: folders follow
  // their names and sessions follow creation time, with fixed tie-breakers.
  const groups: readonly SessionGroup[] = (() => {
    const byWorkspace = new Map<string, SessionSummary[]>();
    for (const session of filtered) {
      const workspace = sessionOriginWorkspace(session);
      const existing = byWorkspace.get(workspace);
      if (existing) existing.push(session);
      else byWorkspace.set(workspace, [session]);
    }
    return [...byWorkspace]
      .map(([workspace, sessions]) => ({
        workspace,
        sessions: sessions.sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
        ),
      }))
      .sort(
        (a, b) =>
          workspaceName(a.workspace).localeCompare(
            workspaceName(b.workspace),
            "zh-CN",
            { numeric: true },
          ) || a.workspace.localeCompare(b.workspace),
      );
  })();
  const toggleFolder = (workspace: string) =>
    setCollapsedFolders((previous) => ({
      ...previous,
      [workspace]: !previous[workspace],
    }));

  const handleSeeMore = (workspace: string, currentEffectiveLimit: number) => {
    setVisibleLimits((previous) => ({
      ...previous,
      [workspace]: currentEffectiveLimit + PAGE_SIZE,
    }));
  };

  const handleCreateSessionInWorkspace = async (
    workspace: string,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (creatingWorkspace) return;
    setCreatingWorkspace(workspace);
    try {
      const allSessionsInWorkspace = state.sessions.filter(
        (s) => sessionOriginWorkspace(s) === workspace,
      );
      const latest = allSessionsInWorkspace[0];
      const candidateModel =
        latest?.model || state.activeSnapshotModel || state.settings?.model;
      const snapshot = await createSession({
        workspace,
        ...(candidateModel ? { model: candidateModel } : {}),
      });
      if (snapshot) {
        setCollapsedFolders((previous) => ({
          ...previous,
          [workspace]: false,
        }));
        setMobileSidebar(false);
        requestAnimationFrame(() => {
          const el =
            document.getElementById(`prompt-${snapshot.id}`) ??
            document.getElementById("new-prompt") ??
            document.querySelector<HTMLTextAreaElement>(".composer-input");
          el?.focus();
        });
      }
    } finally {
      setCreatingWorkspace(null);
    }
  };

  return (
    <aside
      className={`workbench-sidebar ${state.isMobileSidebarOpen ? "is-open" : ""}`}
      aria-label="会话与导航"
    >
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <div className="sidebar-logo">
            <ForgeMark className="sidebar-mark" />
            <span className="sidebar-title">Forge</span>
          </div>
          <div className="sidebar-brand-actions">
            <button
              type="button"
              className="sidebar-new-btn"
              onClick={() => {
                openNewSession(true);
                setMobileSidebar(false);
              }}
              title="新建会话 (Ctrl+N / Cmd+N)"
              aria-label="新建会话"
            >
              <NotePencil size={17} weight="duotone" />
              <span>新任务</span>
              <span className="sidebar-new-kbd" aria-hidden="true">
                <Kbd>{NEW_TASK_MOD}</Kbd>
                <Kbd>N</Kbd>
              </span>
            </button>
            <IconButton
              className="sidebar-mobile-close"
              label="关闭侧边栏"
              icon={<X size={15} weight="bold" />}
              onClick={() => setMobileSidebar(false)}
            />
          </div>
        </div>
      </div>

      <div className="sidebar-search">
        <div className="sidebar-search-input-wrap">
          <MagnifyingGlass size={14} className="sidebar-search-icon" />
          <input
            className="sidebar-search-input"
            aria-label="搜索会话"
            placeholder="搜索任务 / 工作区..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className={`sidebar-archive-toggle ${showArchived ? "is-active" : ""}`}
            onClick={() => setShowArchived(!showArchived)}
            title={showArchived ? "隐藏归档会话" : "显示归档会话"}
            aria-pressed={showArchived}
          >
            <Archive size={14} weight={showArchived ? "fill" : "regular"} />
          </button>
        </div>
      </div>

      <div className="sidebar-sessions-list">
        <SuperAgentSessions
          sessions={agentSessions}
          collapsed={
            !searching && Boolean(collapsedFolders[SUPER_AGENT_FOLDER])
          }
          onToggle={() => toggleFolder(SUPER_AGENT_FOLDER)}
        />
        {state.isSessionsLoading && sessions.length === 0 ? (
          <p className="wb-muted sidebar-empty">正在加载会话...</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            variant="compact"
            className="sidebar-empty"
            title="暂无历史任务"
          />
        ) : groups.length === 0 && agentSessions.length === 0 ? (
          <EmptyState
            variant="compact"
            className="sidebar-empty"
            title="没有匹配的任务"
          />
        ) : (
          groups.map((group) => {
            // A live search must reveal its matches, so collapse state is held
            // back while filtering and restored once the query is cleared.
            const isCollapsed =
              !searching && Boolean(collapsedFolders[group.workspace]);
            const bodyId = `sidebar-folder-${encodeURIComponent(group.workspace)}`;
            const configuredLimit =
              visibleLimits[group.workspace] ?? DEFAULT_VISIBLE_COUNT;
            const activeIndex = group.sessions.findIndex(
              (s) => s.id === state.activeSessionId,
            );
            const effectiveLimit =
              activeIndex >= configuredLimit
                ? Math.ceil((activeIndex + 1) / PAGE_SIZE) * PAGE_SIZE
                : configuredLimit;
            const visibleSessions = group.sessions.slice(0, effectiveLimit);
            const hasMore = visibleSessions.length < group.sessions.length;
            return (
              <section className="session-folder" key={group.workspace}>
                <div className="session-folder-header-row">
                  <button
                    type="button"
                    className={`session-folder-header${isCollapsed ? " is-collapsed" : ""}`}
                    onClick={() => toggleFolder(group.workspace)}
                    aria-expanded={!isCollapsed}
                    aria-controls={bodyId}
                    title={group.workspace}
                  >
                    <CaretRight
                      size={11}
                      weight="bold"
                      className="session-folder-caret"
                      aria-hidden="true"
                    />
                    <span className="session-folder-name">
                      {workspaceName(group.workspace)}
                    </span>
                    <span className="session-folder-count">
                      {group.sessions.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="session-folder-resources-btn"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const inWorkspace = group.sessions.some(
                        (s) => s.id === state.activeSessionId,
                      );
                      const target = group.sessions[0];
                      if (!inWorkspace && target)
                        await selectSession(target.id);
                      setMobileSidebar(false);
                      openWorkspaceResources("files");
                    }}
                    title={`${workspaceName(group.workspace)} 的工作区文件与项目资源`}
                    aria-label={`${workspaceName(group.workspace)} 的工作区文件与项目资源`}
                  >
                    <Files size={12} weight="bold" />
                  </button>
                  <button
                    type="button"
                    className="session-folder-create-btn"
                    onClick={(e) =>
                      handleCreateSessionInWorkspace(group.workspace, e)
                    }
                    disabled={creatingWorkspace === group.workspace}
                    title={`在 ${workspaceName(group.workspace)} 中新建会话`}
                    aria-label={`在 ${workspaceName(group.workspace)} 中新建会话`}
                  >
                    <Plus size={12} weight="bold" />
                  </button>
                </div>
                <div
                  className={`session-folder-collapse${isCollapsed ? " is-collapsed" : ""}`}
                  id={bodyId}
                  aria-hidden={isCollapsed}
                >
                  <div className="session-folder-body">
                    {visibleSessions.map((session) => (
                      <SessionListItem key={session.id} session={session} />
                    ))}
                    {hasMore && (
                      <button
                        type="button"
                        className="session-folder-more"
                        onClick={() =>
                          handleSeeMore(group.workspace, effectiveLimit)
                        }
                        aria-label={`查看更多会话（当前已显示 ${visibleSessions.length}/${group.sessions.length}）`}
                      >
                        <span>查看更多</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* Icon-only actions. The model-service state no longer gets its own
          row: a saved endpoint says nothing useful once it exists, so only a
          missing or loading setup marks the settings icon. */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-actions">
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => {
              setMobileSidebar(false);
              openSettings(true);
            }}
            title={
              serviceStatus.state === "configured"
                ? "设置"
                : `设置 · ${serviceStatus.label}`
            }
            aria-label={
              serviceStatus.state === "configured"
                ? "设置"
                : serviceStatus.label
            }
            data-service={serviceStatus.state}
          >
            <Gear size={17} />
            {serviceStatus.state === "missing" && (
              <span className="sidebar-icon-badge" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="sidebar-icon-btn"
            onClick={() => {
              setMobileSidebar(false);
              openUsageDashboard(true);
            }}
            title="用量看板"
            aria-label="用量看板"
          >
            <ChartBar size={17} />
          </button>
          <button
            type="button"
            className="sidebar-icon-btn sidebar-refresh-btn"
            onClick={() => window.location.reload()}
            title="刷新界面"
            aria-label="刷新界面"
          >
            <ArrowClockwise size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
