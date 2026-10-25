import {
  PUBLISHED_HTML_PREVIEW_MAX_BYTES,
  PUBLISHED_PREVIEW_MAX_BYTES,
  type PublishedFile,
  publishedFileResponseSchema,
} from "@forge/core/shared/published-files";
import { DownloadSimple, Eye, FileText } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionId } from "../../shared-types";
import { htmlPreviewAvailable } from "../../state/html-preview";
import { Button } from "../primitives/Button";
import { HtmlPreview } from "../primitives/HtmlPreview";
import { Dialog } from "./Dialog";
import "./published-files.css";

const rasterTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function fileSize(size: number): string {
  return size < 1024
    ? `${size} B`
    : size < 1024 * 1024
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

type HtmlAction = "idle" | "preview" | "source";

function PublishedFileCard({
  sessionId,
  file,
}: {
  readonly sessionId: SessionId;
  readonly file: PublishedFile;
}) {
  const image = file.previewKind === "image" && rasterTypes.has(file.mimeType);
  const html = file.previewKind === "html";
  const text = file.previewKind === "text";
  // Text attachment previews stay capped at 1 MiB. HTML documents use the
  // larger, shared preview budget: 8 MiB for both the isolated render and the
  // raw-source view. Anything larger is download-only with an explicit note.
  const textPreview = text && file.size <= PUBLISHED_PREVIEW_MAX_BYTES;
  const htmlLoadable = html && file.size <= PUBLISHED_HTML_PREVIEW_MAX_BYTES;
  const htmlPreviewHost = htmlLoadable && htmlPreviewAvailable();
  const [imageUrl, setImageUrl] = useState("");
  const [htmlMarkup, setHtmlMarkup] = useState("");
  const [htmlOpen, setHtmlOpen] = useState(false);
  const [htmlAction, setHtmlAction] = useState<HtmlAction>("idle");
  const [source, setSource] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const pending = useRef<Promise<Uint8Array> | undefined>(undefined);
  const urls = useRef(new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const load = useCallback(() => {
    if (!pending.current) {
      pending.current = (async () => {
        if (typeof window.forge?.getPublishedFile !== "function")
          throw new Error("此宿主尚不支持附件，请更新后重试。");
        const response = publishedFileResponseSchema.parse(
          await window.forge.getPublishedFile(sessionId, file.id),
        );
        if (
          response.file.id !== file.id ||
          response.file.sha256 !== file.sha256 ||
          response.file.size !== file.size
        )
          throw new Error("附件与会话记录不匹配。");
        const binary = atob(response.base64);
        if (binary.length !== file.size) throw new Error("附件内容不完整。");
        // Avoid materializing tens of millions of string-iterator elements for
        // 50 MiB attachments; allocate the final byte buffer directly.
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++)
          bytes[index] = binary.charCodeAt(index);
        return bytes;
      })().catch((cause) => {
        pending.current = undefined;
        throw cause;
      });
    }
    return pending.current;
  }, [sessionId, file.id, file.sha256, file.size]);
  useEffect(() => {
    active.current = true;
    if (image) {
      void load()
        .then((bytes) => {
          if (!active.current) return;
          // Desktop CSP deliberately disallows blob subresources; raster data URLs
          // already have a safe img-src allowance and never grant document access.
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 8192)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 8192),
            );
          setImageUrl(`data:${file.mimeType};base64,${btoa(binary)}`);
        })
        .catch((cause) => {
          if (active.current)
            setError(cause instanceof Error ? cause.message : "图片加载失败。");
        });
    }
    const allocated = urls.current;
    const scheduled = timers.current;
    return () => {
      active.current = false;
      for (const timer of scheduled) clearTimeout(timer);
      scheduled.clear();
      for (const url of allocated) URL.revokeObjectURL(url);
      allocated.clear();
    };
  }, [image, file.mimeType, load]);

  /** Text/image preview plus download; never opens the HTML document action. */
  async function act(download: boolean) {
    if (busy || htmlAction !== "idle") return;
    setBusy(true);
    setError("");
    try {
      if (download && typeof window.forge.savePublishedFile === "function") {
        await window.forge.savePublishedFile(sessionId, file.id);
        return;
      }
      const bytes = await load();
      if (!active.current) return;
      if (download) {
        // Always download as opaque bytes: HTML/SVG must never become a navigable document.
        const url = URL.createObjectURL(
          new Blob([bytes as Uint8Array<ArrayBuffer>], {
            type: "application/octet-stream",
          }),
        );
        urls.current.add(url);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.current.delete(url);
          timers.current.delete(timer);
        }, 30000);
        timers.current.add(timer);
      } else if (image) {
        setTextOpen(true);
      } else if (textPreview) {
        setSource(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        setTextOpen(true);
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error ? cause.message : "附件加载失败，请重试。",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }

  /**
   * HTML is loaded once, then rendered by the same host-served, sandboxed
   * document preview used by code blocks and changed files. The raw source is
   * a separate explicit action, so the two dialogs never stack. `srcdoc`,
   * data: and blob: documents are never used.
   */
  async function openHtml(mode: Exclude<HtmlAction, "idle">) {
    // One HTML action at a time: a second click must not supersede an
    // in-flight read or open the other dialog when the first resolves.
    if (busy || htmlAction !== "idle") return;
    setHtmlAction(mode);
    setError("");
    try {
      const bytes = await load();
      if (!active.current) return;
      const markup = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!active.current) return;
      if (mode === "preview") {
        setHtmlMarkup(markup);
        setSourceOpen(false);
        setTextOpen(false);
        setHtmlOpen(true);
      } else {
        setSource(markup);
        setHtmlOpen(false);
        setTextOpen(false);
        setSourceOpen(true);
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : mode === "preview"
              ? "HTML 预览加载失败，请重试。"
              : "附件加载失败，请重试。",
        );
    } finally {
      if (active.current) setHtmlAction("idle");
    }
  }

  const htmlWorking = htmlAction !== "idle";
  return (
    <article className="published-file" aria-label={`附件 ${file.name}`}>
      {image && imageUrl ? (
        <button
          type="button"
          className="published-file-thumb"
          onClick={() => void act(false)}
          aria-label={`预览 ${file.name}`}
        >
          <img
            src={imageUrl}
            alt={file.name}
            loading="lazy"
            onError={() => {
              setImageUrl("");
              setError("图片无法解码，仍可下载原文件。");
            }}
          />
        </button>
      ) : (
        <FileText
          size={28}
          className="published-file-icon"
          aria-hidden="true"
        />
      )}
      <div className="published-file-info">
        <strong className="published-file-name" title={file.name}>
          {file.name}
        </strong>
        <span className="wb-muted">{fileSize(file.size)} · 已保存快照</span>
        {file.description && <p>{file.description}</p>}
        {!image && !html && !textPreview && (
          <span className="wb-muted">
            {text ? "超过 1 MiB，请下载查看" : "此格式支持下载"}
          </span>
        )}
        {html && !htmlLoadable && (
          <span className="wb-muted">超过 8 MiB 预览上限，请下载查看。</span>
        )}
        {html && htmlLoadable && !htmlPreviewHost && (
          <span className="wb-muted">
            当前宿主不支持隔离 HTML 预览；可查看源码或下载原文件。
          </span>
        )}
        <div className="published-file-actions">
          {image && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || htmlWorking}
              icon={<Eye size={14} />}
              onClick={() => void act(false)}
            >
              预览
            </Button>
          )}
          {textPreview && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || htmlWorking}
              icon={<Eye size={14} />}
              onClick={() => void act(false)}
            >
              预览
            </Button>
          )}
          {htmlPreviewHost && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Eye size={14} />}
              disabled={htmlWorking || busy}
              aria-busy={htmlAction === "preview" ? "true" : undefined}
              onClick={() => void openHtml("preview")}
            >
              {htmlAction === "preview" ? "正在准备…" : "HTML 预览"}
            </Button>
          )}
          {htmlLoadable && (
            <Button
              variant="ghost"
              size="sm"
              disabled={htmlWorking || busy}
              aria-busy={htmlAction === "source" ? "true" : undefined}
              onClick={() => void openHtml("source")}
            >
              {htmlAction === "source" ? "正在读取…" : "查看源码"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || htmlWorking}
            icon={<DownloadSimple size={14} />}
            onClick={() => void act(true)}
          >
            {busy ? "正在读取…" : "下载"}
          </Button>
        </div>
        {error && (
          <p className="published-file-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {image && textOpen && (
        <Dialog
          title={`文件预览 · ${file.name}`}
          onClose={() => setTextOpen(false)}
          initialFocus=".modal-close"
        >
          <img
            className="published-file-full-image"
            src={imageUrl}
            alt={file.name}
          />
        </Dialog>
      )}
      {text && textOpen && (
        <Dialog
          title={`文件预览 · ${file.name}`}
          onClose={() => setTextOpen(false)}
          initialFocus=".modal-close"
        >
          <pre className="published-file-text">{source}</pre>
          <p className="wb-muted">纯文本预览，不执行文件内容。</p>
        </Dialog>
      )}
      {html && sourceOpen && (
        <Dialog
          title={`文件源码 · ${file.name}`}
          onClose={() => setSourceOpen(false)}
          initialFocus=".modal-close"
        >
          <pre className="published-file-text">{source}</pre>
          <p className="wb-muted">
            原始 HTML 源码，仅以纯文本显示，不执行文件内容。使用“HTML
            预览”在隔离沙箱中渲染。
          </p>
        </Dialog>
      )}
      {htmlPreviewHost && htmlOpen && (
        <HtmlPreview
          html={htmlMarkup}
          open={htmlOpen}
          showTrigger={false}
          title={`HTML 预览 · ${file.name}`}
          onOpenChange={setHtmlOpen}
        />
      )}
    </article>
  );
}

/** Kept outside the execution disclosure so delivered files remain visible after completion. */
export function PublishedFiles({
  sessionId,
  files,
}: {
  readonly sessionId: SessionId;
  readonly files: readonly PublishedFile[];
}) {
  if (!files.length) return null;
  return (
    <section className="published-files" aria-label="Forge 交付的文件">
      {files.map((file) => (
        <PublishedFileCard
          key={`${sessionId}:${file.id}`}
          sessionId={sessionId}
          file={file}
        />
      ))}
    </section>
  );
}
