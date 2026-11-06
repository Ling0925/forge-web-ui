import { isPrimarySession } from "@forge/core/shared";
import {
  ArrowsClockwise,
  ChatCircle,
  Gear,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  afterModalsClosed,
  findOpenModalDialog,
} from "../../state/modal-shortcuts";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { Button } from "../primitives/Button";
import { Dialog } from "./Dialog";
import "./command-palette.css";

const mod =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
    ? "⌘"
    : "Ctrl ";

interface PaletteAction {
  readonly id: string;
  /** Accessible name; also what the query matches against. */
  readonly label: string;
  readonly text: string;
  readonly meta?: string;
  readonly icon: ReactNode;
  readonly group: "命令" | "会话";
  readonly run: () => void;
}

const folderName = (workspace: string) =>
  workspace
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || workspace;

export function CommandPalette() {
  const { selectSession, openSettings, openNewSession, refreshActiveSession } =
    useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
      isSettingsOpen: state.isSettingsOpen,
      sessions: state.sessions,
    }),
    shallowEqual,
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const selectedButton = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && selected >= 0)
      selectedButton.current
        ?.querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !event.isComposing
      ) {
        event.preventDefault();
        // Ctrl/Cmd+K toggles the palette itself, but must never stack it on
        // top of another open dialog (settings, new task, or a local panel).
        if (state.isSettingsOpen || (!open && findOpenModalDialog())) return;
        setOpen((value) => !value);
        setQuery("");
        setSelected(0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, state.isSettingsOpen]);
  const iconProps = { size: 16, "aria-hidden": true } as const;
  const actions: PaletteAction[] = [
    {
      id: "new",
      label: "新建会话",
      text: "新建会话",
      meta: `${mod}N`,
      icon: <Plus {...iconProps} />,
      group: "命令" as const,
      run: () => openNewSession(true),
    },
    {
      id: "settings",
      label: "打开设置",
      text: "打开设置",
      meta: `${mod},`,
      icon: <Gear {...iconProps} />,
      group: "命令" as const,
      run: () => openSettings(true),
    },
    ...(state.activeSessionId
      ? [
          {
            id: "refresh",
            label: "刷新当前会话",
            text: "刷新当前会话",
            icon: <ArrowsClockwise {...iconProps} />,
            group: "命令" as const,
            run: () => void refreshActiveSession(),
          },
        ]
      : []),
    ...state.sessions.filter(isPrimarySession).map((session) => ({
      id: session.id,
      label: `打开会话 · ${session.title}${session.archived ? "（已归档）" : ""}`,
      text: session.title,
      meta: session.archived ? "已归档" : folderName(session.workspace),
      icon: <ChatCircle {...iconProps} />,
      group: "会话" as const,
      run: () => void selectSession(session.id),
    })),
  ].filter((action) =>
    action.label.toLowerCase().includes(query.toLowerCase()),
  );
  const execute = (index: number) => {
    const action = actions[index];
    if (!action) return;
    setOpen(false);
    // Close and restore the source focus before handing off to another modal.
    afterModalsClosed(() => action.run());
  };
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="command-palette-trigger"
        aria-label="命令 · Ctrl/Cmd K"
        title="命令 · Ctrl/Cmd K"
        onClick={() => {
          setOpen(true);
          setQuery("");
          setSelected(0);
        }}
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        <span className="command-palette-trigger-label">命令</span>
      </Button>
      <Dialog
        open={open}
        title="命令与会话导航"
        initialFocus="#command-search"
        className="command-palette-dialog"
        onClose={() => setOpen(false)}
      >
        <div className="modal-content command-palette">
          <div className="command-search">
            <MagnifyingGlass
              size={16}
              className="command-search-icon"
              aria-hidden="true"
            />
            <input
              id="command-search"
              className="command-search-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              aria-label="搜索命令或会话"
              placeholder="搜索命令或会话…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setSelected((old) =>
                    Math.max(
                      0,
                      Math.min(
                        actions.length - 1,
                        old + (event.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
                  );
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  execute(selected);
                }
              }}
            />
          </div>
          <p className="visually-hidden command-selection" aria-live="polite">
            {actions[selected]?.label ?? "没有匹配命令"}
          </p>
          <div ref={selectedButton} className="command-list">
            {actions.length === 0 && (
              <p className="command-empty">没有匹配的命令或会话</p>
            )}
            {actions.map((action, index) => (
              <div key={action.id} className="command-row">
                {action.group !== actions[index - 1]?.group && (
                  <div className="command-group-label" aria-hidden="true">
                    {action.group}
                  </div>
                )}
                <button
                  type="button"
                  className={`command-action${selected === index ? " is-selected" : ""}`}
                  title={action.label}
                  aria-label={action.label}
                  aria-current={selected === index ? "true" : undefined}
                  onClick={() => execute(index)}
                  onMouseMove={() => {
                    if (selected !== index) setSelected(index);
                  }}
                >
                  <span className="command-action-icon">{action.icon}</span>
                  <span className="command-action-label">{action.text}</span>
                  {action.meta && (
                    <span className="command-action-meta">{action.meta}</span>
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="command-palette-hint" aria-hidden="true">
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 执行 <kbd>Esc</kbd> 关闭
          </p>
        </div>
      </Dialog>
    </>
  );
}
