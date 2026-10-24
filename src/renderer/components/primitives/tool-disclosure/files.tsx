import {
  Check,
  CheckCircle,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  Funnel,
  HardDrive,
  Lightning,
  ListBullets,
  ListNumbers,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ToolCopyButton, SectionHead } from "./common";

function formatBytes(bytes?: number): string | null {
  if (typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0)
    return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function formatLineRange(record: Record<string, unknown>): string | null {
  const linesReturned =
    typeof record.lines_returned === "number"
      ? record.lines_returned
      : undefined;
  const totalLines =
    typeof record.total_lines === "number" ? record.total_lines : undefined;
  const offset = typeof record.offset === "number" ? record.offset : 0;
  const endLine =
    typeof record.end_line === "number" && record.end_line !== null
      ? record.end_line
      : undefined;

  if (linesReturned === undefined && totalLines === undefined) return null;

  if (
    linesReturned !== undefined &&
    totalLines !== undefined &&
    totalLines > linesReturned
  ) {
    const start = linesReturned > 0 ? offset + 1 : 0;
    const end = endLine ?? offset + linesReturned;
    return `第 ${start}–${end} 行 / 共 ${totalLines} 行`;
  }

  const count = totalLines ?? linesReturned;
  return count !== undefined ? `共 ${count} 行` : null;
}

export function ReadFileResultView({
  record,
  isWaiting,
}: {
  readonly record: Record<string, unknown>;
  readonly isWaiting: boolean;
}) {
  const content =
    typeof record.content === "string" ? record.content : undefined;
  const unchanged = record.unchanged === true;
  const lineText = formatLineRange(record);
  const sizeText =
    typeof record.size_bytes === "number"
      ? formatBytes(record.size_bytes)
      : null;
  const cacheHit = record.cache_hit === true;
  const truncated = record.truncated === true;

  if (isWaiting && content === undefined && !unchanged) {
    return (
      <div className="tool-section">
        <SectionHead title="文件内容" />
        <span className="tool-section-empty">等待文件读取…</span>
      </div>
    );
  }

  return (
    <div className="tool-section tool-read-section">
      <SectionHead
        title="文件内容"
        action={
          content ? (
            <ToolCopyButton text={content} label="复制内容" />
          ) : undefined
        }
      />
      {(lineText || sizeText || cacheHit || truncated) && (
        <div className="tool-read-meta">
          {lineText && (
            <span className="tool-read-badge" title="读取行数范围">
              <ListNumbers size={12} weight="bold" aria-hidden="true" />
              <span>{lineText}</span>
            </span>
          )}
          {sizeText && (
            <span className="tool-read-badge" title="文件大小">
              <HardDrive size={12} weight="regular" aria-hidden="true" />
              <span>{sizeText}</span>
            </span>
          )}
          {cacheHit && (
            <span
              className="tool-read-badge tool-read-badge-cache"
              title="已从本地缓存命中"
            >
              <Lightning size={12} weight="fill" aria-hidden="true" />
              <span>缓存命中</span>
            </span>
          )}
          {truncated && (
            <span
              className="tool-read-badge tool-read-badge-warn"
              title="内容超出单次读取上限已截断"
            >
              <WarningCircle size={12} weight="fill" aria-hidden="true" />
              <span>已截断</span>
            </span>
          )}
        </div>
      )}

      {unchanged ? (
        <div className="tool-read-unchanged">
          <CheckCircle size={14} weight="fill" aria-hidden="true" />
          <span>文件内容未变更（与当前缓存一致）</span>
        </div>
      ) : content !== undefined ? (
        <pre className="tool-param-block">{content}</pre>
      ) : (
        <span className="tool-section-empty">文件无内容</span>
      )}
    </div>
  );
}

function splitPath(fullPath: string): {
  readonly dir: string;
  readonly name: string;
} {
  const normalized = fullPath.replace(/\\/g, "/");
  const trimmed =
    normalized.endsWith("/") && normalized.length > 1
      ? normalized.slice(0, -1)
      : normalized;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash === -1) {
    return { dir: "", name: normalized };
  }
  return {
    dir: normalized.slice(0, lastSlash + 1),
    name: normalized.slice(lastSlash + 1),
  };
}

function FileCopyButton({ path }: { readonly path: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(path);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      } catch {
        // clipboard unavailable
      }
    },
    [path],
  );

  return (
    <button
      type="button"
      className={`tool-file-copy-btn${copied ? " is-copied" : ""}`}
      onClick={copy}
      aria-label={copied ? "已复制路径" : "复制路径"}
      title={copied ? "已复制路径" : "复制路径"}
    >
      {copied ? (
        <Check size={12} weight="bold" aria-hidden="true" />
      ) : (
        <Copy size={12} aria-hidden="true" />
      )}
    </button>
  );
}

function FileItemRow({
  entry,
}: {
  readonly entry: { readonly path: string; readonly kind?: string };
}) {
  const isDir = entry.kind === "directory" || entry.path.endsWith("/");
  const { dir, name } = splitPath(entry.path);

  return (
    <li className={`tool-file-item ${isDir ? "is-dir" : "is-file"}`}>
      <span className="tool-file-icon" aria-hidden="true">
        {isDir ? (
          <Folder size={14} weight="fill" className="file-icon-dir" />
        ) : (
          <FileText size={14} weight="regular" className="file-icon-file" />
        )}
      </span>
      <span className="tool-file-path" title={entry.path}>
        {dir && <span className="tool-file-dir">{dir}</span>}
        <span className="tool-file-name">{name || entry.path}</span>
      </span>
      <span className="tool-file-actions">
        {isDir && <span className="tool-file-type-badge">目录</span>}
        <FileCopyButton path={entry.path} />
      </span>
    </li>
  );
}

export function ListFilesResultView({
  record,
  parameters,
  isWaiting,
}: {
  readonly record: Record<string, unknown>;
  readonly parameters?: unknown;
  readonly isWaiting: boolean;
}) {
  if (isWaiting && (!record || !Array.isArray(record.entries))) {
    return (
      <div className="tool-section tool-file-list-section">
        <SectionHead title="文件列表" />
        <span className="tool-section-empty">等待文件列表…</span>
      </div>
    );
  }

  const rawEntries = Array.isArray(record.entries) ? record.entries : [];
  const entries: readonly { readonly path: string; readonly kind?: string }[] =
    rawEntries.map((e) => {
      if (typeof e === "string") return { path: e, kind: "file" };
      if (
        e &&
        typeof e === "object" &&
        typeof (e as Record<string, unknown>).path === "string"
      ) {
        const rec = e as Record<string, unknown>;
        return {
          path: rec.path as string,
          kind: typeof rec.kind === "string" ? rec.kind : "file",
        };
      }
      return { path: String(e), kind: "file" };
    });

  const parsedParams =
    typeof parameters === "object" &&
    parameters !== null &&
    !Array.isArray(parameters)
      ? (parameters as Record<string, unknown>)
      : undefined;

  const glob =
    typeof parsedParams?.glob === "string" ? parsedParams.glob : undefined;
  const isRecursive = parsedParams?.recursive === true;

  const offset = typeof record.offset === "number" ? record.offset : 0;
  const nextOffset =
    typeof record.next_offset === "number" ? record.next_offset : null;
  const truncated = record.truncated === true;
  const scanTruncated = record.scan_truncated === true;

  const dirCount = entries.filter((e) => e.kind === "directory").length;
  const fileCount = entries.length - dirCount;

  const summaryCount =
    entries.length === 0
      ? "0 个项目"
      : dirCount > 0 && fileCount > 0
        ? `${fileCount} 个文件 · ${dirCount} 个目录`
        : dirCount > 0
          ? `${dirCount} 个目录`
          : `${fileCount} 个文件`;

  const allPathsText = entries.map((e) => e.path).join("\n");

  return (
    <div className="tool-section tool-file-list-section">
      <SectionHead
        title="文件列表"
        action={
          entries.length > 0 ? (
            <ToolCopyButton text={allPathsText} label="复制全部路径" />
          ) : undefined
        }
      />

      <div className="tool-read-meta tool-file-meta">
        <span className="tool-read-badge" title="项目总数">
          <ListBullets size={12} weight="bold" aria-hidden="true" />
          <span>{summaryCount}</span>
        </span>

        {glob && (
          <span className="tool-read-badge" title={`匹配模式：${glob}`}>
            <Funnel size={12} weight="fill" aria-hidden="true" />
            <span>{glob}</span>
          </span>
        )}

        {isRecursive && (
          <span className="tool-read-badge" title="已递归遍历子目录">
            <span>递归</span>
          </span>
        )}

        {offset > 0 && (
          <span className="tool-read-badge" title={`当前起始偏移：${offset}`}>
            <span>偏移 {offset}</span>
          </span>
        )}

        {(truncated || nextOffset !== null) && (
          <span
            className="tool-read-badge tool-read-badge-warn"
            title="条目过多，当前仅返回部分结果"
          >
            <WarningCircle size={12} weight="fill" aria-hidden="true" />
            <span>
              已截断{nextOffset !== null ? ` (下一页: ${nextOffset})` : ""}
            </span>
          </span>
        )}

        {scanTruncated && (
          <span
            className="tool-read-badge tool-read-badge-warn"
            title="目录层级或文件量过大，扫描在达到上限时提前终止"
          >
            <WarningCircle size={12} weight="fill" aria-hidden="true" />
            <span>扫描超出上限</span>
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="tool-file-empty">
          <FolderOpen size={20} weight="regular" aria-hidden="true" />
          <span>无匹配文件</span>
        </div>
      ) : (
        <div className="tool-file-list-container">
          <ul className="tool-file-list">
            {entries.map((entry, idx) => (
              <FileItemRow key={`${entry.path}-${idx}`} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
