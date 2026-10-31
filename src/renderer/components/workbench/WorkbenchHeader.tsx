import { ChatText, SidebarSimple } from "@phosphor-icons/react";
import { type Ref, useEffect, useState } from "react";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { IconButton } from "../primitives/IconButton";
import { CommandPalette } from "./CommandPalette";

interface WorkbenchHeaderProps {
  readonly isNew: boolean;
  readonly pending: number;
  /**
   * Pending requests the Inspector shows (background sessions / subagents).
   * The selected session's own request lives in the transcript, so when
   * nothing else is pending the pill jumps there instead of opening details.
   */
  readonly backgroundPending?: number;
  readonly onLocateApproval?: () => void;
  readonly inspector: {
    readonly collapsed: boolean;
    readonly toggleRef: Ref<HTMLButtonElement>;
    readonly reveal: () => void;
    readonly close: () => void;
  };
}

export function WorkbenchHeader({
  isNew,
  pending,
  backgroundPending = pending,
  onLocateApproval,
  inspector,
}: WorkbenchHeaderProps) {
  const { setMobileSidebar } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeTitle: state.activeSnapshot?.title,
      isMobileSidebarOpen: state.isMobileSidebarOpen,
      mobileTab: state.mobileTab,
    }),
    shallowEqual,
  );
  const [compact, setCompact] = useState(
    () => window.matchMedia("(max-width: 1000px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1000px)");
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const expanded = compact
    ? state.mobileTab === "inspector"
    : !inspector.collapsed;
  const title = isNew ? "新会话" : (state.activeTitle ?? "Forge 工作台");
  return (
    <header className="workbench-task-header">
      <div className="wb-header-start">
        <IconButton
          className="wb-drawer-toggle"
          label="打开会话列表"
          title="会话列表"
          aria-expanded={state.isMobileSidebarOpen}
          icon={<SidebarSimple size={18} />}
          onClick={() => setMobileSidebar(!state.isMobileSidebarOpen)}
        />
        <CommandPalette />
      </div>
      <div className="wb-header-title">
        <h1 title={title}>{title}</h1>
      </div>
      <div className="wb-header-end wb-header-actions">
        {pending > 0 && (
          <button
            type="button"
            className="wb-approval-pill"
            onClick={
              backgroundPending > 0 || !onLocateApproval
                ? inspector.reveal
                : onLocateApproval
            }
            aria-label={`待批准 ${pending} 项，${backgroundPending > 0 || !onLocateApproval ? "打开执行详情" : "定位到消息流"}`}
          >
            待批准 {pending}
          </button>
        )}
        <IconButton
          ref={inspector.toggleRef}
          className="wb-details-toggle"
          active={expanded}
          aria-expanded={expanded}
          label={`${expanded ? "收起详情，返回任务" : "展开详情"}${pending > 0 ? `，待批准 ${pending} 项` : ""}`}
          title={expanded ? "返回任务" : "执行详情"}
          icon={<SidebarSimple size={16} className="wb-details-icon" />}
          onClick={() => {
            setMobileSidebar(false);
            if (expanded) inspector.close();
            else inspector.reveal();
          }}
        >
          <ChatText size={18} className="wb-return-icon" />
          <span className="wb-details-label">详情</span>
          {pending > 0 && (
            <span
              className="wb-header-pending"
              aria-label={`待批准 ${pending} 项`}
            >
              {pending}
            </span>
          )}
        </IconButton>
      </div>
    </header>
  );
}
