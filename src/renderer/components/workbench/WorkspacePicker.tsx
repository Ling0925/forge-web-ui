import {
  ArrowElbowDownLeft,
  ArrowUp,
  CaretDown,
  CaretRight,
  Check,
  ClockCounterClockwise,
  FolderDashed,
  FolderOpen,
  House,
  MagnifyingGlass,
  PencilSimple,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isAbsoluteWorkspacePath,
  type WorkspaceDirectoryPage,
} from "@forge/core/shared/workspaces";
import { hostCapabilities } from "../../web-host";
import { EmptyState } from "../primitives/EmptyState";
import { Button } from "../primitives/Button";
import "./workspace-picker.css";
import { useDismiss } from "../primitives/useDismiss";
import { IconButton } from "../primitives/IconButton";

const RECENT_WORKSPACES_STORAGE_KEY = "forge-recent-workspaces";
const MAX_RECENT_WORKSPACES = 6;

export interface PathBreadcrumb {
  readonly label: string;
  readonly path: string;
}

export function splitWorkspaceDisplay(rawPath: string): {
  readonly name: string;
  readonly parent: string;
  readonly shortParent: string;
  readonly immediateParent: string;
} {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return {
      name: "选择工作区",
      parent: "",
      shortParent: "",
      immediateParent: "",
    };
  }
  const isWindows =
    /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("\\\\");
  const sep = isWindows ? "\\" : "/";
  const normalized = trimmed.replace(/[\\/]+$/, "");
  if (!normalized || normalized === "/" || /^[A-Za-z]:$/.test(normalized)) {
    return { name: trimmed, parent: "", shortParent: "", immediateParent: "" };
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const name = parts.at(-1) ?? trimmed;
  if (parts.length <= 1) {
    const root = isWindows ? "" : "/";
    return { name, parent: root, shortParent: root, immediateParent: root };
  }
  const parentParts = parts.slice(0, -1);
  const parent = isWindows
    ? parentParts.join("\\")
    : `/${parentParts.join("/")}`;
  const immediateParent = parentParts.at(-1) ?? "";
  const shortParent =
    parentParts.length > 2 ? parentParts.slice(-2).join(sep) : parent;
  return { name, parent, shortParent, immediateParent };
}

export function parsePathBreadcrumbs(
  rawPath: string,
): readonly PathBreadcrumb[] {
  const trimmed = rawPath.trim();
  if (!trimmed) return [];

  if (/^[A-Za-z]:[\\/]/.test(trimmed)) {
    const drive = `${trimmed.slice(0, 2)}\\`;
    const rest = trimmed.slice(2).split(/[\\/]/).filter(Boolean);
    const crumbs: PathBreadcrumb[] = [{ label: drive, path: drive }];
    let acc = drive.replace(/\\$/, "");
    for (const part of rest) {
      acc = `${acc}\\${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  if (trimmed.startsWith("\\\\")) {
    const parts = trimmed.replace(/^\\\\/, "").split(/[\\/]/).filter(Boolean);
    if (parts.length === 0) return [{ label: "\\\\", path: "\\\\" }];
    const crumbs: PathBreadcrumb[] = [];
    let acc = `\\\\${parts[0]}`;
    crumbs.push({ label: acc, path: acc });
    for (const part of parts.slice(1)) {
      acc = `${acc}\\${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  if (trimmed.startsWith("/")) {
    const parts = trimmed.split("/").filter(Boolean);
    const crumbs: PathBreadcrumb[] = [{ label: "/", path: "/" }];
    let acc = "";
    for (const part of parts) {
      acc = `${acc}/${part}`;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  }

  return [{ label: trimmed, path: trimmed }];
}

function readStoredRecentWorkspaces(): readonly string[] {
  try {
    const raw = localStorage.getItem(RECENT_WORKSPACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is string =>
        typeof item === "string" && isAbsoluteWorkspacePath(item.trim()),
    );
  } catch {
    return [];
  }
}

function persistRecentWorkspace(
  selectedPath: string,
  existing: readonly string[],
): readonly string[] {
  const normalized = selectedPath.trim();
  if (!isAbsoluteWorkspacePath(normalized)) return existing;
  const next = [
    normalized,
    ...existing.filter((item) => item !== normalized),
  ].slice(0, MAX_RECENT_WORKSPACES);
  try {
    localStorage.setItem(RECENT_WORKSPACES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore storage quota errors */
  }
  return next;
}

export function WorkspacePicker({
  workspace,
  recentWorkspaces = [],
  chooseWorkspace,
  onChange,
  onDone,
}: {
  readonly workspace: string;
  readonly recentWorkspaces?: readonly string[];
  readonly chooseWorkspace: () => Promise<string | null>;
  readonly onChange: (path: string) => void;
  readonly onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<WorkspaceDirectoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [storedRecent, setStoredRecent] = useState<readonly string[]>(() =>
    readStoredRecentWorkspaces(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const crumbsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dirListRef = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const nativePending = useRef(false);
  const alive = useRef(true);
  const panelId = useId();
  const searchId = useId();
  const restricted =
    hostCapabilities.web && window.forge.restrictWorkspace !== false;
  const canBrowse =
    hostCapabilities.web &&
    !restricted &&
    Boolean(window.forge.browseWorkspaces);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);

  const browse = useCallback(async (path?: string) => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setQuery("");
    try {
      const read = window.forge.browseWorkspaces;
      if (!read)
        throw new Error("目录浏览不可用，请重启 Forge 服务并刷新页面。");
      const result = await read(path);
      if (request !== generation.current || !alive.current) return;
      setPage(result);
    } catch (cause) {
      if (request !== generation.current || !alive.current) return;
      setError(
        `无法读取目录，请选择其他目录或返回默认目录。${cause instanceof Error ? ` ${cause.message}` : ""}`,
      );
    } finally {
      if (request === generation.current && alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (canBrowse) {
      setPage(null);
      void browse(workspace || undefined);
    }
    panelRef.current?.focus();
    return () => {
      generation.current++;
    };
  }, [open, canBrowse, workspace, browse]);
  useDismiss({
    open,
    refs: [containerRef],
    onDismiss: () => setOpen(false),
  });

  const currentPath = page?.path ?? workspace;

  // Scroll breadcrumbs to the deepest (rightmost) segment when opened or when currentPath changes
  useEffect(() => {
    const el = crumbsRef.current;
    if (!open || !el) return;
    el.scrollLeft = el.scrollWidth;
    const raf = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth;
    });
    return () => cancelAnimationFrame(raf);
  }, [open, currentPath]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const commitWorkspace = (selectedPath: string) => {
    const clean = selectedPath.trim();
    if (!clean) return;
    setStoredRecent((prev) => persistRecentWorkspace(clean, prev));
    onChange(clean);
    setOpen(false);
    onDone();
  };

  const selectNative = async () => {
    if (nativePending.current) return;
    nativePending.current = true;
    setLoading(true);
    setError("");
    try {
      const path = await chooseWorkspace();
      if (!alive.current) return;
      if (path) {
        commitWorkspace(path);
      }
    } catch (cause) {
      if (alive.current) {
        setError(
          cause instanceof Error ? cause.message : "选择目录失败，请重试。",
        );
        setOpen(true);
      }
    } finally {
      nativePending.current = false;
      if (alive.current) setLoading(false);
    }
  };

  const triggerDisplay = useMemo(
    () => splitWorkspaceDisplay(workspace),
    [workspace],
  );
  const currentDisplay = useMemo(
    () => splitWorkspaceDisplay(currentPath),
    [currentPath],
  );
  const breadcrumbs = useMemo(
    () => parsePathBreadcrumbs(currentPath),
    [currentPath],
  );

  const mergedRecentWorkspaces = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const candidate of [...storedRecent, ...recentWorkspaces, workspace]) {
      const trimmed = candidate?.trim();
      if (!trimmed || !isAbsoluteWorkspacePath(trimmed) || seen.has(trimmed))
        continue;
      seen.add(trimmed);
      list.push(trimmed);
      if (list.length >= MAX_RECENT_WORKSPACES) break;
    }
    return list;
  }, [storedRecent, recentWorkspaces, workspace]);

  const duplicateRecentNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of mergedRecentWorkspaces) {
      const { name } = splitWorkspaceDisplay(item);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([name]) => name),
    );
  }, [mergedRecentWorkspaces]);

  const showRecentSection =
    canBrowse &&
    (mergedRecentWorkspaces.length > 1 ||
      (mergedRecentWorkspaces.length === 1 &&
        Boolean(currentPath) &&
        mergedRecentWorkspaces[0] !== currentPath));

  const trimmedQuery = query.trim();
  const isPathQuery = useMemo(() => {
    if (!trimmedQuery) return false;
    return isAbsoluteWorkspacePath(trimmedQuery);
  }, [trimmedQuery]);

  const filteredDirectories = useMemo(() => {
    const dirs = page?.directories ?? [];
    if (!trimmedQuery || isPathQuery) return dirs;
    const needle = trimmedQuery.toLowerCase();
    return dirs.filter((dir) => dir.name.toLowerCase().includes(needle));
  }, [page?.directories, trimmedQuery, isPathQuery]);

  const startEditingCurrentPath = () => {
    if (!currentPath) return;
    setQuery(currentPath);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleQuerySubmit = () => {
    if (!trimmedQuery) return;
    if (isPathQuery) {
      void browse(trimmedQuery);
      return;
    }
    if (
      !loading &&
      filteredDirectories.length === 1 &&
      filteredDirectories[0]
    ) {
      void browse(filteredDirectories[0].path);
    }
  };

  const isCurrentAlreadySelected = Boolean(
    page?.path && workspace && page.path === workspace,
  );

  return (
    <div
      className="composer-project"
      ref={containerRef}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key === "Tab" && open) {
          const items = Array.from(
            panelRef.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled), summary",
            ) ?? [],
          ).filter((item) => item.getClientRects().length > 0);
          const first = items[0];
          const last = items.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panelRef.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === panelRef.current)
          ) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`composer-project-trigger${open ? " is-open" : ""}`}
        title={workspace || "选择项目目录"}
        aria-label="选择工作区"
        aria-haspopup={hostCapabilities.web ? "dialog" : undefined}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={!hostCapabilities.web && loading}
        onClick={() => {
          if (hostCapabilities.web) setOpen(!open);
          else void selectNative();
        }}
      >
        <span className="composer-project-trigger-icon" aria-hidden="true">
          <FolderOpen size={14} weight="duotone" />
        </span>
        <span className="composer-project-trigger-name">
          {triggerDisplay.name}
        </span>
        {triggerDisplay.shortParent && (
          <span className="composer-project-trigger-parent" aria-hidden="true">
            {triggerDisplay.shortParent}
          </span>
        )}
        <CaretDown
          size={12}
          className="composer-project-trigger-caret"
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div
            className="workspace-picker-backdrop"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            id={panelId}
            className="composer-project-panel workspace-picker-panel"
            role="dialog"
            aria-label={
              hostCapabilities.web ? "选择服务器工作区" : "选择工作区"
            }
            tabIndex={-1}
          >
            <div className="workspace-picker-header">
              <div className="workspace-picker-header-title">
                <div className="workspace-picker-icon-badge" aria-hidden="true">
                  <FolderOpen size={18} weight="duotone" />
                </div>
                <div className="workspace-picker-title-group">
                  <div className="workspace-picker-heading-row">
                    <span className="workspace-picker-heading">
                      {hostCapabilities.web ? "选择服务器工作区" : "选择工作区"}
                    </span>
                    {canBrowse && page?.path && (
                      <span
                        className={`workspace-picker-state-pill${
                          isCurrentAlreadySelected
                            ? " is-active"
                            : " is-changed"
                        }`}
                      >
                        {isCurrentAlreadySelected
                          ? "当前工作区"
                          : "新目录待确认"}
                      </span>
                    )}
                  </div>
                  <div className="workspace-picker-current-path-line">
                    <output
                      className="workspace-picker-path"
                      aria-label="当前浏览目录"
                      title={currentPath || "尚未选择目录"}
                    >
                      {currentPath || "尚未选择目录"}
                    </output>
                    {canBrowse && currentPath && (
                      <button
                        type="button"
                        className="workspace-picker-edit-path-btn"
                        disabled={loading}
                        onClick={startEditingCurrentPath}
                        title="在搜索栏中编辑当前路径以快速跳转"
                        aria-label="编辑当前路径"
                      >
                        <PencilSimple size={11} aria-hidden="true" />
                        <span>编辑路径</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <IconButton
                label="关闭面板"
                icon={<X size={16} aria-hidden="true" />}
                onClick={close}
                title="关闭 (Esc)"
              />
            </div>

            <div className="workspace-picker-body">
              {canBrowse ? (
                <>
                  {showRecentSection && (
                    <div
                      className="workspace-picker-recent"
                      aria-label="最近使用的工作区"
                    >
                      <div className="workspace-picker-section-label">
                        <ClockCounterClockwise size={13} aria-hidden="true" />
                        <span>最近使用</span>
                        <span className="workspace-picker-section-hint">
                          点击直接选用
                        </span>
                      </div>
                      <div className="workspace-picker-recent-list">
                        {mergedRecentWorkspaces.map((recentPath) => {
                          const info = splitWorkspaceDisplay(recentPath);
                          const isCurrentWorkspace = recentPath === workspace;
                          const isBrowsingThis = recentPath === currentPath;
                          const showDisambiguator =
                            duplicateRecentNames.has(info.name) &&
                            Boolean(info.immediateParent);
                          return (
                            <button
                              type="button"
                              key={recentPath}
                              className={`workspace-picker-recent-chip${
                                isCurrentWorkspace ? " is-selected" : ""
                              }${isBrowsingThis ? " is-browsing" : ""}`}
                              title={`${recentPath}${isCurrentWorkspace ? "（当前工作区）" : "（点击立即切换）"}`}
                              aria-label={`切换到最近工作区 ${info.name} (${recentPath})`}
                              onClick={() => {
                                commitWorkspace(recentPath);
                              }}
                            >
                              <FolderOpen
                                size={13}
                                weight="duotone"
                                className="workspace-picker-recent-icon"
                                aria-hidden="true"
                              />
                              <span className="workspace-picker-recent-name">
                                {info.name}
                              </span>
                              {showDisambiguator && (
                                <span className="workspace-picker-recent-parent">
                                  {info.immediateParent}
                                </span>
                              )}
                              {isCurrentWorkspace && (
                                <Check
                                  size={11}
                                  weight="bold"
                                  className="workspace-picker-recent-check"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="workspace-picker-explorer">
                    <div className="workspace-picker-location-top">
                      <div
                        ref={crumbsRef}
                        className="workspace-picker-breadcrumbs"
                        aria-label="目录层级导航"
                      >
                        {breadcrumbs.map((crumb, index) => {
                          const isLast = index === breadcrumbs.length - 1;
                          return (
                            <span
                              className="workspace-picker-crumb-item"
                              key={crumb.path}
                            >
                              {index > 0 && (
                                <CaretRight
                                  size={10}
                                  className="workspace-picker-crumb-sep"
                                  aria-hidden="true"
                                />
                              )}
                              {isLast ? (
                                <span
                                  className="workspace-picker-crumb is-current"
                                  title={crumb.path}
                                >
                                  {crumb.label}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="workspace-picker-crumb"
                                  disabled={loading}
                                  title={`跳转到 ${crumb.path}`}
                                  aria-label={`跳转到上级目录 ${crumb.path}`}
                                  onClick={() => void browse(crumb.path)}
                                >
                                  {crumb.label}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>

                      <div className="workspace-picker-toolbar">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={loading || !page?.parent}
                          onClick={() => {
                            if (page?.parent) void browse(page.parent);
                          }}
                        >
                          <ArrowUp size={13} aria-hidden="true" /> 上一级
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={loading}
                          onClick={() => void browse()}
                        >
                          <House size={13} aria-hidden="true" /> 默认目录
                        </Button>
                      </div>
                    </div>

                    <div className="workspace-picker-explorer-header">
                      <div className="workspace-picker-search-box">
                        <MagnifyingGlass
                          size={14}
                          className="workspace-picker-search-icon"
                          aria-hidden="true"
                        />
                        <input
                          ref={searchInputRef}
                          id={searchId}
                          type="text"
                          className="workspace-picker-search-input"
                          value={query}
                          placeholder="搜索子文件夹，或输入绝对路径按 Enter 跳转…"
                          aria-label="搜索子文件夹或输入跳转路径"
                          onChange={(event) => setQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleQuerySubmit();
                            } else if (event.key === "ArrowDown") {
                              const firstDir =
                                dirListRef.current?.querySelector<HTMLButtonElement>(
                                  ".workspace-picker-directory",
                                );
                              if (firstDir) {
                                event.preventDefault();
                                firstDir.focus();
                              }
                            }
                          }}
                        />
                        {query && (
                          <button
                            type="button"
                            className="workspace-picker-search-clear"
                            onClick={() => {
                              setQuery("");
                              searchInputRef.current?.focus();
                            }}
                            aria-label="清空输入"
                            title="清空"
                          >
                            <X size={12} aria-hidden="true" />
                          </button>
                        )}
                        {isPathQuery && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={loading || !trimmedQuery}
                            onClick={() => void browse(trimmedQuery)}
                          >
                            跳转{" "}
                            <ArrowElbowDownLeft size={12} aria-hidden="true" />
                          </Button>
                        )}
                      </div>

                      <div className="workspace-picker-directories-meta">
                        <span>子文件夹</span>
                        {page && !loading && (
                          <span className="workspace-picker-dir-count">
                            {trimmedQuery && !isPathQuery
                              ? `${filteredDirectories.length} / ${page.directories.length}`
                              : `${page.directories.length}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      ref={dirListRef}
                      className={`workspace-picker-directories${
                        !loading && filteredDirectories.length >= 4
                          ? " is-grid"
                          : ""
                      }`}
                      aria-label="子目录"
                      aria-busy={loading}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Backspace" &&
                          page?.parent &&
                          !loading
                        ) {
                          event.preventDefault();
                          void browse(page.parent);
                          return;
                        }
                        if (
                          event.key === "ArrowDown" ||
                          event.key === "ArrowUp" ||
                          event.key === "ArrowRight" ||
                          event.key === "ArrowLeft"
                        ) {
                          const buttons = Array.from(
                            dirListRef.current?.querySelectorAll<HTMLButtonElement>(
                              ".workspace-picker-directory:not(:disabled)",
                            ) ?? [],
                          );
                          const currentIndex = buttons.indexOf(
                            document.activeElement as HTMLButtonElement,
                          );
                          if (currentIndex === -1) return;
                          event.preventDefault();
                          const delta =
                            event.key === "ArrowDown" ||
                            event.key === "ArrowRight"
                              ? 1
                              : -1;
                          const nextIndex = currentIndex + delta;
                          if (nextIndex < 0) {
                            searchInputRef.current?.focus();
                          } else if (nextIndex < buttons.length) {
                            buttons[nextIndex]?.focus();
                          }
                        }
                      }}
                    >
                      {loading && (
                        <div className="workspace-picker-loading" role="status">
                          <SpinnerGap
                            size={20}
                            className="workspace-picker-spinner"
                            aria-hidden="true"
                          />
                          <span>正在读取目录…</span>
                        </div>
                      )}
                      {!loading &&
                        filteredDirectories.map((directory) => (
                          <button
                            type="button"
                            className="workspace-picker-directory"
                            key={directory.path}
                            onClick={() => void browse(directory.path)}
                            title={directory.path}
                          >
                            <div
                              className="workspace-picker-dir-icon"
                              aria-hidden="true"
                            >
                              <FolderOpen size={15} weight="duotone" />
                            </div>
                            <span className="workspace-picker-dir-name">
                              {directory.name}
                            </span>
                            <CaretRight
                              size={13}
                              className="workspace-picker-dir-arrow"
                              aria-hidden="true"
                            />
                          </button>
                        ))}
                      {!loading && page && page.directories.length === 0 && (
                        <EmptyState
                          variant="compact"
                          className="workspace-picker-empty"
                          icon={<FolderDashed size={22} />}
                          title="当前目录下无子文件夹"
                          description="已到达最深层级，可直接点击下方“选择此目录”。"
                        />
                      )}
                      {!loading &&
                        page &&
                        page.directories.length > 0 &&
                        filteredDirectories.length === 0 && (
                          <EmptyState
                            variant="compact"
                            className="workspace-picker-empty"
                            icon={<MagnifyingGlass size={22} />}
                            title={`没有匹配“${trimmedQuery}”的子文件夹`}
                            description="可尝试其他关键词，或粘贴完整绝对路径按 Enter 跳转。"
                          />
                        )}
                    </div>
                  </div>

                  {page?.truncated && (
                    <div className="workspace-picker-truncated-notice">
                      <p className="workspace-picker-helper">
                        子目录较多，仅展示前 {page.directories.length}{" "}
                        项；可在上方搜索框过滤或直接输入路径跳转。
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="workspace-picker-restricted-box">
                  <p className="workspace-picker-helper">
                    {restricted
                      ? "此 Web 服务已绑定固定工作区，无法切换到其他目录。"
                      : "使用系统目录选择器指定会话所在的项目文件夹。"}
                  </p>
                </div>
              )}

              {hostCapabilities.web && !restricted && !canBrowse && (
                <div className="workspace-picker-error-box" role="alert">
                  <p>目录浏览不可用，请重启 Forge 服务并刷新页面。</p>
                </div>
              )}

              {error && (
                <div className="workspace-picker-error-box" role="alert">
                  <p className="workspace-picker-error">{error}</p>
                </div>
              )}
            </div>

            <div className="workspace-picker-actions">
              <div className="workspace-picker-selection-summary">
                {canBrowse && page?.path ? (
                  <>
                    <span className="workspace-picker-selection-label">
                      将选定
                    </span>
                    <span
                      className="workspace-picker-selection-target"
                      title={page.path}
                    >
                      <FolderOpen
                        size={13}
                        weight="duotone"
                        aria-hidden="true"
                      />
                      <strong>{currentDisplay.name}</strong>
                    </span>
                  </>
                ) : (
                  <span className="workspace-picker-status-hint">
                    {restricted ? "工作区已由服务端锁定" : "请选择会话工作目录"}
                  </span>
                )}
              </div>
              <div className="workspace-picker-buttons">
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  {restricted ? "关闭" : "取消"}
                </Button>
                {canBrowse && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={loading || !page}
                    onClick={() => {
                      if (!page) return;
                      commitWorkspace(page.path);
                    }}
                  >
                    选择此目录
                  </Button>
                )}
                {!hostCapabilities.web && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    disabled={loading}
                    onClick={() => void selectNative()}
                  >
                    选择目录
                  </Button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
