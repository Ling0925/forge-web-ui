import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { Field } from "../../primitives/Field";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { type ConnectionDraft, randomId } from "./drafts";

export function ConnectionEditor({
  connection,
  disabled,
  onChange,
}: {
  readonly connection: ConnectionDraft;
  readonly disabled: boolean;
  readonly onChange: (value: ConnectionDraft) => void;
}) {
  const [extraBodyError, setExtraBodyError] = useState("");
  const [vertexError, setVertexError] = useState("");
  const patch = (value: Partial<ConnectionDraft>) =>
    onChange({ ...connection, ...value });
  return (
    <details className="model-access-fold model-access-connection">
      <summary>连接</summary>
      <div className="model-access-section-body">
        <div className="model-access-connection-row">
          <span className="model-access-field-label">鉴权</span>
          <span className="model-access-status">
            {connection.authType}
            {connection.authHeader ? ` · ${connection.authHeader}` : ""}
          </span>
          <label className="model-access-check">
            <Checkbox
              checked={connection.authEditing}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ authEditing: checked })}
            />
            修改鉴权
          </label>
        </div>
        {connection.authEditing && (
          <div className="model-access-form-grid">
            <Field id="model-access-auth-type" label="鉴权方式">
              <Select
                id="model-access-auth-type"
                value={connection.authType}
                options={[
                  { value: "auto", label: "自动" },
                  { value: "bearer", label: "Bearer" },
                  { value: "api-key", label: "API Key" },
                  { value: "header", label: "自定义请求头" },
                  { value: "none", label: "无" },
                ]}
                onValueChange={(value) =>
                  patch({
                    authType: value as ConnectionDraft["authType"],
                  })
                }
              />
            </Field>
            {connection.authType === "header" && (
              <Field id="model-access-auth-header" label="鉴权请求头">
                <Input
                  id="model-access-auth-header"
                  value={connection.authHeader}
                  placeholder="X-Api-Key"
                  onChange={(event) =>
                    patch({ authHeader: event.target.value })
                  }
                />
              </Field>
            )}
            <Field id="model-access-auth-prefix" label="鉴权前缀">
              <Input
                id="model-access-auth-prefix"
                value={connection.authPrefix}
                placeholder="留空"
                onChange={(event) => patch({ authPrefix: event.target.value })}
              />
            </Field>
          </div>
        )}
        <div className="model-access-connection-row">
          <span className="model-access-field-label">请求头</span>
          <span className="model-access-status">
            {connection.headers.length
              ? connection.headers.map((header) => header.name).join(", ")
              : "无"}
          </span>
          <label className="model-access-check">
            <Checkbox
              checked={connection.headersEditing}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ headersEditing: checked })}
            />
            修改请求头
          </label>
          {connection.headers.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label="清除全部请求头"
              onClick={() =>
                patch({ headersEditing: true, headersDirty: true, headers: [] })
              }
            >
              清除
            </Button>
          )}
        </div>
        {connection.headersEditing && (
          <div className="model-access-rows">
            {connection.headers.map((header) => (
              <div className="model-access-row" key={header.id}>
                <Input
                  aria-label="请求头名称"
                  value={header.name}
                  placeholder="名称"
                  onChange={(event) =>
                    patch({
                      headersDirty: true,
                      headers: connection.headers.map((item) =>
                        item.id === header.id
                          ? { ...item, name: event.target.value, stored: false }
                          : item,
                      ),
                    })
                  }
                />
                <Input
                  aria-label="请求头值"
                  value={header.value}
                  placeholder={header.stored ? "已保存，留空保留" : "值"}
                  onChange={(event) =>
                    patch({
                      headersDirty: true,
                      headers: connection.headers.map((item) =>
                        item.id === header.id
                          ? {
                              ...item,
                              value: event.target.value,
                              stored: false,
                            }
                          : item,
                      ),
                    })
                  }
                />
                <IconButton
                  label="删除请求头"
                  icon={<Trash size={14} aria-hidden="true" />}
                  disabled={disabled}
                  onClick={() =>
                    patch({
                      headersDirty: true,
                      headers: connection.headers.filter(
                        (item) => item.id !== header.id,
                      ),
                    })
                  }
                />
              </div>
            ))}
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={14} />}
              disabled={disabled}
              onClick={() =>
                patch({
                  headersDirty: true,
                  headers: [
                    ...connection.headers,
                    {
                      id: randomId("header"),
                      name: "",
                      value: "",
                      stored: false,
                    },
                  ],
                })
              }
            >
              添加请求头
            </Button>
          </div>
        )}
        <div className="model-access-connection-row">
          <span className="model-access-field-label">额外参数</span>
          <span className="model-access-status">
            {connection.extraBodyEditing
              ? connection.extraBodyText.trim() || "未修改"
              : connection.hasExtraBody
                ? "已设置"
                : "无"}
          </span>
          <label className="model-access-check">
            <Checkbox
              checked={connection.extraBodyEditing}
              disabled={disabled}
              onCheckedChange={(checked) => {
                setExtraBodyError("");
                patch({ extraBodyEditing: checked });
              }}
            />
            修改额外参数
          </label>
          {connection.hasExtraBody && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label="清除额外参数"
              onClick={() =>
                patch({ extraBodyEditing: true, extraBodyText: "{}" })
              }
            >
              清除
            </Button>
          )}
        </div>
        {connection.extraBodyEditing && (
          <Field
            id="model-access-extra-body"
            label="额外参数 JSON"
            error={extraBodyError || undefined}
          >
            <textarea
              id="model-access-extra-body"
              className="model-access-json"
              value={connection.extraBodyText}
              spellCheck={false}
              rows={4}
              placeholder="{}"
              onChange={(event) => {
                const value = event.target.value;
                setExtraBodyError("");
                patch({ extraBodyText: value });
                if (!value.trim()) return;
                try {
                  const parsed: unknown = JSON.parse(value);
                  if (
                    !parsed ||
                    Array.isArray(parsed) ||
                    typeof parsed !== "object"
                  )
                    setExtraBodyError("必须是 JSON 对象。");
                } catch {
                  setExtraBodyError("JSON 格式错误。");
                }
              }}
            />
          </Field>
        )}
        <div className="model-access-connection-row">
          <span className="model-access-field-label">代理</span>
          <span className="model-access-status">
            {connection.proxyEditing
              ? connection.proxyUrl.trim() || "清除"
              : connection.proxyUrl
                ? "已设置"
                : "无"}
          </span>
          <label className="model-access-check">
            <Checkbox
              checked={connection.proxyEditing}
              disabled={disabled}
              onCheckedChange={(checked) => patch({ proxyEditing: checked })}
            />
            修改代理
          </label>
        </div>
        {connection.proxyEditing && (
          <Field id="model-access-proxy" label="代理地址">
            <Input
              id="model-access-proxy"
              value={connection.proxyUrl}
              placeholder="http://127.0.0.1:7890"
              onChange={(event) => patch({ proxyUrl: event.target.value })}
            />
          </Field>
        )}
        <div className="model-access-connection-row">
          <span className="model-access-field-label">Vertex JSON</span>
          <span className="model-access-status">
            {connection.vertexEditing
              ? connection.vertexText.trim() || "留空保留"
              : connection.hasVertex
                ? "已保存"
                : "无"}
          </span>
          <label className="model-access-check">
            <Checkbox
              checked={connection.vertexEditing}
              disabled={disabled}
              onCheckedChange={(checked) => {
                setVertexError("");
                patch({ vertexEditing: checked });
              }}
            />
            修改 Vertex
          </label>
          {connection.hasVertex && (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              aria-label="清除 Vertex 配置"
              onClick={() => {
                setVertexError("");
                patch({ vertexEditing: true, vertexText: "null" });
              }}
            >
              清除
            </Button>
          )}
        </div>
        {connection.vertexEditing && (
          <Field
            id="model-access-vertex"
            label="Vertex JSON"
            error={vertexError || undefined}
          >
            <textarea
              id="model-access-vertex"
              className="model-access-json"
              value={connection.vertexText}
              spellCheck={false}
              rows={5}
              placeholder={
                connection.hasVertex
                  ? "已保存，留空保留；null 清除"
                  : '{"project":"…","credentials":{…}}'
              }
              onChange={(event) => {
                const value = event.target.value;
                setVertexError("");
                patch({ vertexText: value });
                if (!value.trim()) return;
                try {
                  const parsed: unknown = JSON.parse(value);
                  if (
                    parsed !== null &&
                    (!parsed ||
                      Array.isArray(parsed) ||
                      typeof parsed !== "object")
                  )
                    setVertexError("必须是 JSON 对象或 null。");
                } catch {
                  setVertexError("JSON 格式错误。");
                }
              }}
            />
          </Field>
        )}
      </div>
    </details>
  );
}
