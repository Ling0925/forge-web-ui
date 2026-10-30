import {
  Archive,
  ArrowClockwise,
  CaretRight,
  ChartBar,
  Folder,
  FolderOpen,
  Gear,
  MagnifyingGlass,
  Plus,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { isPrimarySession } from "@forge/core/shared/sessions";
import type { SessionSummary } from "../../shared-types";
import { shallowEqual, useWorkbenchActions, useWorkbenchSelector } from "../../state/workbench-store";
import { modelServiceStatus } from "../../state/model-service-status";
import { ForgeMark } from "../primitives/ForgeMark";
import { SessionListItem } from "./SessionListItem";

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
const PAGE_SIZE = 10;

export function Sidebar() {
  const { openNewSession, setMobileSidebar, openSettings, openUsageDashboard, createSession } = useWorkbenchActions();
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
  const [creatingWorkspace, setCreatingWorkspace] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<
    Readonly<Record<string, boolean>>
  >({});
  const [visibleLimits, setVisibleLimits] = useState<
    Readonly<Record<string, number>>
  >({});
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const sessions = state.sessions.filter(isPrimarySession);
  const filtered = sessions.filter(
    (session) =>
      (showArchived || !session.archived) &&
      `${session.title} ${session.workspace}`.toLowerCase().includes(needle),
  );
  // Keep navigation independent of activity-ordered API results: folders follow
  // their names and sessions follow creation time, with fixed tie-breakers.
  const groups: readonly SessionGroup[] = (() => {
    const byWorkspace = new Map<string, SessionSummary[]>();
    for (const session of filtered) {
      const existing = byWorkspace.get(session.workspace);
      if (existing) existing.push(session);
      else byWorkspace.set(session.workspace, [session]);
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
        (s) => s.workspace === workspace,
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
              <Plus size={15} weight="bold" />
              <span>新任务</span>
            </button>
            <button
              type="button"
              className="wb-icon-btn sidebar-mobile-close"
              onClick={() => setMobileSidebar(false)}
              aria-label="关闭侧边栏"
              title="关闭侧边栏"
            >
              <X size={15} weight="bold" />
            </button>
          </div>
        </div>
      </div>

      <div className="sidebar-search">
        <div className="sidebar-search-input-wrap">
          <MagnifyingGlass size={13} className="sidebar-search-icon" />
          <input
            className="sidebar-search-input"
            aria-label="搜索会话"
            placeholder="搜索任务 / 工作区..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className={`sidebar-archive-toggle ${showArchived ? "is-active" : ""}`}
          onClick={() => setShowArchived(!showArchived)}
          title={showArchived ? "隐藏归档会话" : "显示归档会话"}
          aria-pressed={showArchived}
        >
          <Archive size={13} weight={showArchived ? "fill" : "regular"} />
        </button>
      </div>

      <div className="sidebar-sessions-list">
        {state.isSessionsLoading && sessions.length === 0 ? (
          <p className="wb-muted sidebar-empty">正在加载会话...</p>
        ) : sessions.length === 0 ? (
          <p className="wb-muted sidebar-empty">暂无历史任务</p>
        ) : groups.length === 0 ? (
          <p className="wb-muted sidebar-empty">没有匹配的任务</p>
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
                    {isCollapsed ? (
                      <Folder
                        size={13}
                        weight="regular"
                        className="session-folder-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <FolderOpen
                        size={13}
                        weight="regular"
                        className="session-folder-icon"
                        aria-hidden="true"
                      />
                    )}
                    <span className="session-folder-name">
                      {workspaceName(group.workspace)}
                    </span>
                    <span className="session-folder-count">
                      {group.sessions.length}
                    </span>
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
                        <span>See more</span>
                      </button>
                    )}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-model-status"
          data-state={serviceStatus.state}
          title={serviceStatus.hint}
          onClick={() => {
            setMobileSidebar(false);
            openSettings(true);
          }}
        >
          <i
            className="sidebar-status-dot wb-status-dot"
            data-status={
              serviceStatus.state === "configured"
                ? "ready"
                : serviceStatus.state === "loading"
                  ? "running"
                  : "awaiting_approval"
            }
            aria-hidden="true"
          />
          <span>{serviceStatus.label}</span>
          <CaretRight size={12} className="sidebar-status-arrow" aria-hidden="true" />
        </button>

        <div className="sidebar-footer-actions">
          <button
            type="button"
            className="sidebar-settings-btn"
            onClick={() => {
              setMobileSidebar(false);
              openUsageDashboard(true);
            }}
            title="用量看板"
            aria-label="用量看板"
          >
            <ChartBar size={15} />
            <span>用量</span>
          </button>
          <button
            type="button"
            className="sidebar-settings-btn"
            onClick={() => {
              setMobileSidebar(false);
              openSettings(true);
            }}
            title="设置"
            aria-label="设置"
          >
            <Gear size={15} />
            <span>设置</span>
          </button>
          <button
            type="button"
            className="sidebar-refresh-btn"
            onClick={() => window.location.reload()}
            title="刷新界面"
            aria-label="刷新界面"
          >
            <ArrowClockwise size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
