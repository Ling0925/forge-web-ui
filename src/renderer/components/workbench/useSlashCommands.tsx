import { matchSlashCommands } from "@forge/core/shared";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "#lib/utils";
import { Kbd } from "#ui/kbd";
import { Spinner } from "#ui/spinner";
import {
  type DesktopSlashHost,
  type DesktopSlashResult,
  desktopSlashLimitation,
  executeDesktopSlash,
} from "./desktop-slash";

export function useSlashCommands(options: {
  prompt: string;
  draftId: string;
  input: RefObject<HTMLTextAreaElement | null>;
  setPrompt: (value: string) => void;
  host: DesktopSlashHost;
  busy: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState(0);
  // The composer stays mounted across sessions; command state must follow its owner.
  const [results, setResults] = useState<
    Readonly<Record<string, DesktopSlashResult>>
  >({});
  const [executions, setExecutions] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const locked = useRef(new Set<string>());
  const result = results[options.draftId] ?? {};
  const executing = executions.has(options.draftId);
  const currentDraft = useRef(options.draftId);
  currentDraft.current = options.draftId;
  const text = options.prompt.trim();
  const isCommand = options.prompt.startsWith("/");
  const matches = matchSlashCommands(text).sort(
    (a, b) => Number(b.name === text) - Number(a.name === text),
  );
  const open =
    isCommand && !dismissed && !/\s/.test(text) && matches.length > 0;
  const index = Math.min(selected, Math.max(0, matches.length - 1));
  const menuId = `slash-${options.draftId}`;
  useEffect(() => {
    setDismissed(false);
    setSelected(0);
  }, [options.prompt, options.draftId]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${menuId}-${index}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, index, menuId]);

  const execute = async (line = text) => {
    if (!isCommand) return false;
    const draftId = options.draftId;
    if (options.busy || locked.current.has(draftId)) return true;
    locked.current.add(draftId);
    setExecutions((old) => new Set(old).add(draftId));
    setResults((old) => ({ ...old, [draftId]: {} }));
    setDismissed(true);
    try {
      const next = await executeDesktopSlash(line, options.host);
      setResults((old) => ({ ...old, [draftId]: next }));
      if (currentDraft.current === draftId && next.clearPrompt)
        options.setPrompt("");
    } catch (error) {
      setResults((old) => ({
        ...old,
        [draftId]: {
          text:
            error instanceof Error
              ? error.message
              : "命令执行失败，未自动重试。",
        },
      }));
    } finally {
      locked.current.delete(draftId);
      setExecutions((old) => {
        const next = new Set(old);
        next.delete(draftId);
        return next;
      });
    }
    return true;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return false;
    const choice = matches[index];
    if (
      open &&
      choice &&
      ["ArrowDown", "ArrowUp", "Escape", "Tab", "Enter"].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === "Escape") setDismissed(true);
      else if (event.key === "ArrowDown" || event.key === "ArrowUp")
        setSelected(
          (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
            matches.length,
        );
      else if (event.key === "Tab") options.setPrompt(choice.name);
      else void execute(choice.name);
      return true;
    }
    if (isCommand && event.key === "Enter") {
      event.preventDefault();
      void execute();
      return true;
    }
    return false;
  };
  return {
    isCommand,
    execute,
    onKeyDown,
    executing,
    inputProps: {
      "aria-controls": open ? menuId : undefined,
      "aria-expanded": open,
      "aria-haspopup": "listbox" as const,
      "aria-activedescendant": open ? `${menuId}-${index}` : undefined,
      onBlur: () => setDismissed(true),
      onFocus: () => setDismissed(false),
    },
    view: (
      <>
        {open && (
          <div
            className={cn(
              "composer-slash-menu mb-2 max-h-[min(280px,35vh)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-sm shadow-dropdown",
              "fade-in-0 slide-in-from-bottom-1 animate-in duration-150 ease-out",
            )}
            id={menuId}
            role="listbox"
            aria-label="Forge 命令"
          >
            {matches.map((command, position) => (
              <div
                key={command.name}
                id={`${menuId}-${position}`}
                role="option"
                aria-selected={position === index}
                className={cn(
                  "flex cursor-pointer items-baseline gap-3 rounded-lg px-2.5 py-2 transition-colors duration-[var(--duration-fast)] hover:bg-accent",
                  position === index &&
                    "bg-brand-soft shadow-[inset_2px_0_0_var(--accent)] hover:bg-brand-soft",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void execute(command.name)}
              >
                <strong
                  className={cn(
                    "min-w-24 shrink-0 font-medium font-mono text-xs",
                    position === index ? "text-brand" : "text-foreground",
                  )}
                >
                  {command.name}
                </strong>
                <span className="min-w-0 text-secondary-text text-xs [overflow-wrap:anywhere]">
                  {command.args} {command.description}
                  {desktopSlashLimitation(command.name) && (
                    <small className="mt-0.5 block text-2xs text-warning">
                      {desktopSlashLimitation(command.name)}
                    </small>
                  )}
                </span>
              </div>
            ))}
            <small className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-border border-t px-2.5 pt-2 pb-1 text-2xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑↓</Kbd> 选择
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Enter</Kbd> 执行
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Tab</Kbd> 补全
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>Esc</Kbd> 关闭
              </span>
            </small>
          </div>
        )}
        {executing && (
          <output
            aria-live="polite"
            className="inline-flex items-center gap-2 px-1 text-muted-foreground text-xs"
          >
            <Spinner className="size-3.5" />
            正在执行命令…
          </output>
        )}
        {result.text && (
          <output
            className="composer-slash-message block max-h-[35vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs [overflow-wrap:anywhere]"
            aria-live="polite"
          >
            {result.text}
          </output>
        )}
        {result.sessions?.map((session) => (
          <button
            key={session.id}
            type="button"
            disabled={executing}
            className="flex min-h-9 w-full cursor-pointer items-center gap-2 truncate rounded-lg border border-border bg-card px-3 text-left text-foreground text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void execute(`/resume ${session.id}`)}
          >
            {session.title} · {session.id}
          </button>
        ))}
      </>
    ),
  };
}
