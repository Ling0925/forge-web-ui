import { useCallback, useId, useRef, useState } from "react";
import { Button } from "../primitives/Button";
import { Input } from "../primitives/Input";
import { Dialog } from "./Dialog";
import "./confirm-dialog.css";

export type ConfirmRequest = Readonly<{
  title: string;
  /** One or two sentences: what happens and what cannot be undone. */
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button red; destructive or high-risk only. */
  tone?: "danger" | "default";
  /** When set, the user must type this exact text before confirming. */
  requireText?: string;
}>;

/**
 * The one in-app confirmation used by Settings (and anything replacing a
 * native `window.confirm`). It is a modal built on `Dialog`, so Escape and the
 * close button cancel, and focus starts on the safe choice.
 */
export function ConfirmDialog({
  request,
  onResult,
}: {
  readonly request: ConfirmRequest;
  readonly onResult: (confirmed: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const blocked =
    request.requireText !== undefined && typed.trim() !== request.requireText;
  return (
    <Dialog
      title={request.title}
      onClose={() => onResult(false)}
      className="confirm-dialog"
      initialFocus={
        request.requireText !== undefined ? "input" : "[data-confirm-cancel]"
      }
    >
      <div className="modal-content confirm-dialog-content">
        <p className="confirm-dialog-body">{request.body}</p>
        {request.requireText !== undefined && (
          <div className="confirm-dialog-type">
            <label htmlFor={inputId}>
              输入 <code>{request.requireText}</code> 以确认
            </label>
            <Input
              id={inputId}
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !blocked) {
                  event.preventDefault();
                  onResult(true);
                }
              }}
            />
          </div>
        )}
      </div>
      <footer className="modal-footer confirm-dialog-actions">
        <Button
          data-confirm-cancel
          variant="ghost"
          onClick={() => onResult(false)}
        >
          {request.cancelLabel ?? "取消"}
        </Button>
        <Button
          variant={request.tone === "danger" ? "danger" : "primary"}
          disabled={blocked}
          onClick={() => onResult(true)}
        >
          {request.confirmLabel}
        </Button>
      </footer>
    </Dialog>
  );
}

/**
 * Promise-based confirmation: `await confirm({...})` resolves `true` only when
 * the user explicitly confirms. Render `dialog` once in the owning component.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirm = useCallback((next: ConfirmRequest) => {
    resolver.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const dialog = request ? (
    <ConfirmDialog
      request={request}
      onResult={(confirmed) => {
        const resolve = resolver.current;
        resolver.current = null;
        setRequest(null);
        resolve?.(confirmed);
      }}
    />
  ) : null;
  return { confirm, dialog } as const;
}
