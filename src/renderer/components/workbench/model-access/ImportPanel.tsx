import type {
  ModelAccessRequest,
  ModelAccessResult,
} from "@forge/core/shared/model-access";
import { CaretDown, Plugs } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { Field } from "../../primitives/Field";
import { Tag } from "../../primitives/Tag";
import { describedFailure } from "./drafts";

export function ImportPanel({
  onApplied,
}: {
  readonly onApplied: (ids: readonly string[]) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<Extract<
    ModelAccessResult,
    { type: "import-preview" }
  > | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const access = (input: ModelAccessRequest) => {
    if (!window.forge.modelAccess)
      throw new Error("当前宿主不支持模型接入管理。");
    return window.forge.modelAccess(input);
  };
  const doPreview = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await access({ type: "import-preview", text });
      if (result.type === "import-preview") {
        setPreview(result);
        setSelected(new Set(result.sources.map((source) => source.id)));
      }
    } catch (previewError) {
      setPreview(null);
      setError(describedFailure(previewError));
    } finally {
      setBusy(false);
    }
  };
  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await access({
        type: "import-apply",
        previewId: preview.previewId,
        sourceIds: [...selected],
      });
      if (result.type === "import-apply") {
        setMessage(`已导入 ${result.applied.length} 个来源。`);
        setPreview(null);
        setText("");
        await onApplied(result.applied);
      }
    } catch (applyError) {
      setError(describedFailure(applyError));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="model-access-fold model-access-import">
      <summary className="model-access-import-summary">
        <div className="model-access-import-summary-main">
          <span className="model-access-import-icon" aria-hidden="true">
            <Plugs size={15} />
          </span>
          <div className="model-access-import-summary-text">
            <span className="model-access-import-title">导入来源</span>
            <span className="model-access-import-subtitle">
              支持粘贴 JSON 配置或导入链接，先预览校验再按需勾选合并
            </span>
          </div>
        </div>
        <div className="model-access-import-summary-meta">
          {preview ? (
            <Tag tone="accent">
              待导入 {selected.size}/{preview.sources.length}
            </Tag>
          ) : message ? (
            <Tag tone="success">{message}</Tag>
          ) : (
            <Tag>JSON / 链接</Tag>
          )}
          <CaretDown
            size={14}
            className="model-access-fold-caret"
            aria-hidden="true"
          />
        </div>
      </summary>
      <div className="model-access-section-body model-access-import-body">
        <Field
          id="model-access-import-text"
          label="文本或链接"
          helper="粘贴导出的来源 JSON 片段（包含 sources 数组或来源对象）或 http(s):// 导入地址"
        >
          <textarea
            id="model-access-import-text"
            className="model-access-json"
            rows={4}
            value={text}
            spellCheck={false}
            placeholder='例如：{"sources": [{"id": "openai", ...}]} 或 https://example.com/sources.json'
            onChange={(event) => {
              setText(event.target.value);
              setPreview(null);
              setMessage("");
            }}
          />
        </Field>
        <div className="model-access-import-toolbar">
          <div className="model-access-actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !text.trim()}
              loading={busy && !preview}
              onClick={() => void doPreview()}
            >
              预览
            </Button>
            {preview && (
              <Button
                size="sm"
                variant="primary"
                disabled={busy || selected.size === 0}
                loading={busy}
                onClick={() => void apply()}
              >
                应用导入
              </Button>
            )}
            {(text.trim().length > 0 || preview !== null) && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setText("");
                  setPreview(null);
                  setError("");
                  setMessage("");
                }}
              >
                清空
              </Button>
            )}
          </div>
          <div className="model-access-import-feedback">
            {message && (
              <span className="model-access-status is-success">{message}</span>
            )}
            {error && (
              <span className="model-access-status is-error" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
        {preview && (
          <div className="model-access-preview">
            <div className="model-access-preview-head">
              <span className="model-access-preview-summary">
                识别到 <strong>{preview.sources.length}</strong> 个来源 · 已选{" "}
                <strong>{selected.size}</strong> 项
              </span>
              {preview.sources.length > 1 && (
                <div className="model-param-quick-links">
                  <button
                    type="button"
                    className="model-param-link-btn"
                    disabled={busy || selected.size === preview.sources.length}
                    onClick={() =>
                      setSelected(
                        new Set(preview.sources.map((item) => item.id)),
                      )
                    }
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="model-param-link-btn is-muted"
                    disabled={busy || selected.size === 0}
                    onClick={() => setSelected(new Set())}
                  >
                    取消全选
                  </button>
                </div>
              )}
            </div>
            {preview.warnings.length > 0 && (
              <ul className="model-access-warnings">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="model-access-preview-list">
              {preview.sources.map((source) => {
                const isChecked = selected.has(source.id);
                const hasWarning = source.warnings.length > 0;
                return (
                  <label
                    className={`model-access-preview-row${isChecked ? " is-selected" : ""}${hasWarning ? " has-warning" : ""}`}
                    key={source.id}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(source.id);
                        else next.delete(source.id);
                        setSelected(next);
                      }}
                    />
                    <div className="model-access-preview-main">
                      <span className="model-access-preview-label">
                        {source.label}
                      </span>
                      <code>{source.id}</code>
                      {source.baseUrl && (
                        <span className="model-access-preview-url">
                          {source.baseUrl}
                        </span>
                      )}
                    </div>
                    <div className="model-access-preview-badges">
                      <Tag>{source.model || "未指定模型"}</Tag>
                      <Tag>{source.credentialCount} 凭据</Tag>
                      {source.warnings.map((warning) => (
                        <span
                          className="model-access-status is-error model-access-preview-warning"
                          key={warning}
                        >
                          {warning}
                        </span>
                      ))}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
