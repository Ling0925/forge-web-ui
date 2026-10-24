import { Check, Copy, X } from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { type ToolDisclosureProps } from "./types";

/**
 * Terminal-style status glyph (✓ / ✗ / spinner) instead of a status word. The
 * label is preserved for assistive tech only.
 */
export function StatusGlyph({
  status,
  label,
}: {
  readonly status: ToolDisclosureProps["status"];
  readonly label: string;
}) {
  return (
    <span className="tool-disclosure-status" data-status={status}>
      {status === "completed" ? (
        <Check size={13} weight="bold" aria-hidden="true" />
      ) : status === "failed" ? (
        <X size={13} weight="bold" aria-hidden="true" />
      ) : (
        <span className="tool-disclosure-spinner" aria-hidden="true" />
      )}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

/**
 * Quiet copy action for a piece of evidence (command line, result, output). It
 * only ever claims a copy that really happened: an unavailable clipboard leaves
 * the label unchanged.
 */
export function ToolCopyButton({
  text,
  label,
}: {
  readonly text: string;
  readonly label: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (insecure origin, denied permission).
    }
  }, [text]);
  return (
    <button
      type="button"
      className={`tool-copy${copied ? " is-copied" : ""}`}
      onClick={() => void copy()}
      aria-label={copied ? "已复制" : label}
      title={copied ? "已复制" : label}
    >
      {copied ? (
        <Check size={12} weight="bold" aria-hidden="true" />
      ) : (
        <Copy size={12} aria-hidden="true" />
      )}
      <span>{copied ? "已复制" : "复制"}</span>
    </button>
  );
}

export function SectionHead({
  title,
  action,
}: {
  readonly title: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="tool-section-head">
      <span className="tool-section-title">{title}</span>
      {action}
    </div>
  );
}
