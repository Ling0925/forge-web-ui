import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { subscribeInspectorSection } from "../../state/inspector-sections";
import { useGlobalModalShortcuts } from "../../state/modal-shortcuts";
import { WorkbenchProvider } from "../../state/workbench-context";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { Button } from "../primitives/Button";
import { DeferredPanel } from "../primitives/DeferredPanel";
import { ErrorState } from "../primitives/ErrorState";
import { Composer } from "./Composer";
import { Inspector } from "./Inspector";
import { Sidebar } from "./Sidebar";
import { Transcript } from "./Transcript";
import { Welcome } from "./Welcome";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { WorkspaceResourcesDialog } from "./WorkspaceResourcesDialog";
import "./workbench.css";
import "./app.css";
import "./workbench-header.css";
import "./new-session.css";
import "./inspector.css";
import "../../styles/motion.css";

const loadSettingsPanel = () =>
  import("./Settings").then((module) => ({ default: module.Settings }));
const loadUsageDashboard = () =>
  import("./UsageDashboard").then((module) => ({
    default: module.UsageDashboard,
  }));

function Workbench() {
  const {
    openNewSession,
    openSettings,
    openUsageDashboard,
    setMobileTab,
    setMobileSidebar,
    clearAlert,
    loadSettings,
    loadSessions,
    refreshActiveSession,
  } = useWorkbenchActions();
  // The shell only needs layout flags and approval counts. Selecting them keeps
  // streamed tokens (which only touch `activeRuns[id]`) from re-rendering the
  // whole workbench tree.
  const state = useWorkbenchSelector(({ state }) => {
    const runs = Object.values(state.activeRuns);
    return {
      isSettingsOpen: state.isSettingsOpen,
      isUsageDashboardOpen: state.isUsageDashboardOpen,
      isNewSessionOpen: state.isNewSessionOpen,
      activeSessionId: state.activeSessionId,
      mobileTab: state.mobileTab,
      isMobileSidebarOpen: state.isMobileSidebarOpen,
      alertError: state.alertError,
      pending: runs.filter((run) => run.pendingApproval).length,
      backgroundPending: runs.filter(
        (run) => run.pendingApproval && run.sessionId !== state.activeSessionId,
      ).length,
    };
  }, shallowEqual);
  useGlobalModalShortcuts({
    onNewSession: (open) => {
      if (!state.isSettingsOpen) openNewSession(open);
    },
    onSettings: openSettings,
    onEscape: () => setMobileSidebar(false),
  });
  const isNew = state.isNewSessionOpen || !state.activeSessionId;
  const { pending, backgroundPending } = state;
  // Conversation first; details remain one click away, including on wide screens.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [focusToken, setFocusToken] = useState(0);
  const previousBackgroundPending = useRef(0);
  const detailsToggleRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (backgroundPending > 0 && previousBackgroundPending.current === 0) {
      setInspectorCollapsed(false);
    }
    previousBackgroundPending.current = backgroundPending;
  }, [backgroundPending]);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(min-width: 1001px)");
    const update = (e: MediaQueryListEvent) => {
      if (!e.matches) {
        setInspectorCollapsed(true);
        setMobileTab("task");
      }
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [setMobileTab]);
  useEffect(() => {
    // 1001px ~ 1280px: the inspector is an overlay drawer, so crossing into
    // this range collapses it instead of squeezing the reading column.
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1280px)");
    const update = (e: MediaQueryListEvent) => {
      if (e.matches) setInspectorCollapsed(true);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const revealInspector = () => {
    setInspectorCollapsed(false);
    setMobileTab("inspector");
    setFocusToken((token) => token + 1);
  };
  const closeInspector = () => {
    setInspectorCollapsed(true);
    setMobileTab("task");
  };
  // The selected session's request is decided in the transcript; jump there.
  const locateApproval = () => {
    setMobileTab("task");
    requestAnimationFrame(() => {
      const target = document.querySelector(
        ".workbench-main [data-approval-id]",
      );
      if (target instanceof HTMLElement)
        target.scrollIntoView({ block: "center", behavior: "auto" });
    });
  };
  const revealRef = useRef(revealInspector);
  revealRef.current = revealInspector;
  useEffect(
    () =>
      subscribeInspectorSection(() => {
        revealRef.current();
      }),
    [],
  );
  return (
    <>
      <div
        hidden={state.isSettingsOpen}
        inert={state.isSettingsOpen}
        style={state.isSettingsOpen ? { display: "none" } : undefined}
        className={`workbench wb-app mobile-${state.mobileTab}${inspectorCollapsed ? " inspector-collapsed" : ""}${state.isMobileSidebarOpen ? " sidebar-open" : ""}`}
      >
        <button
          type="button"
          tabIndex={-1}
          className={`wb-sidebar-backdrop${state.isMobileSidebarOpen ? " is-open" : ""}`}
          onClick={() => setMobileSidebar(false)}
          aria-hidden="true"
        />
        <Sidebar />
        <div className="workbench-content">
          <WorkbenchHeader
            isNew={isNew}
            pending={pending}
            backgroundPending={backgroundPending}
            onLocateApproval={locateApproval}
            inspector={{
              collapsed: inspectorCollapsed,
              toggleRef: detailsToggleRef,
              reveal: revealInspector,
              close: closeInspector,
            }}
          />
          <div className="workbench-panes">
            <main className={`workbench-main${isNew ? " wb-new-session" : ""}`}>
              {state.alertError && (
                <ErrorState
                  title="操作未完成"
                  error={state.alertError}
                  actions={
                    <>
                      <Button
                        onClick={() => {
                          clearAlert();
                          void loadSettings();
                          void loadSessions();
                          void refreshActiveSession();
                        }}
                      >
                        刷新 / 重试
                      </Button>
                      <Button onClick={clearAlert}>关闭提示</Button>
                    </>
                  }
                />
              )}
              {isNew ? <Welcome /> : <Transcript />}
              <Composer isNew={isNew} />
            </main>
            {!inspectorCollapsed && (
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className="wb-inspector-scrim"
                onClick={closeInspector}
              />
            )}
            <Inspector
              focusToken={focusToken}
              onRequestCollapse={() => {
                flushSync(() => {
                  closeInspector();
                });
                detailsToggleRef.current?.focus();
              }}
            />
          </div>
        </div>
      </div>
      <DeferredPanel
        open={state.isSettingsOpen}
        label="设置"
        onClose={() => openSettings(false)}
        load={loadSettingsPanel}
      />
      <WorkspaceResourcesDialog />
      <DeferredPanel
        open={state.isUsageDashboardOpen}
        label="用量看板"
        onClose={() => openUsageDashboard(false)}
        load={loadUsageDashboard}
      />
    </>
  );
}

export function App() {
  return (
    <WorkbenchProvider>
      <Workbench />
    </WorkbenchProvider>
  );
}
