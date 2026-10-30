import { Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { Field } from "../../primitives/Field";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Tag } from "../../primitives/Tag";
import { AccountLoginPanel } from "./AccountLoginPanel";
import {
  type AccountQuota,
  type EditableCredential,
  describedFailure,
  freshCredentials,
  randomId,
  statusLabel,
} from "./drafts";

function QuotaView({ quota }: { readonly quota: AccountQuota }) {
  return (
    <div className="model-access-quota">
      <span className="model-access-quota-head">
        {[quota.platform, quota.plan].filter(Boolean).join(" · ")}
      </span>
      {quota.windows.map((window) => (
        <div className="model-access-quota-row" key={window.id}>
          <span>{window.name}</span>
          <span>
            {window.unlimited
              ? "不限"
              : `${window.remaining ?? "?"} / ${window.limit ?? "?"}`}
          </span>
          {window.usedPercent !== null && (
            <span>{Number(window.usedPercent.toFixed(1))}%</span>
          )}
          {window.resetAt && (
            <span>{new Date(window.resetAt).toLocaleString()}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function CredentialsEditor({
  sourceId,
  sourceReady,
  credentials,
  activeCredentialId,
  disabled,
  onCredentials,
  onActive,
  onCompleted,
}: {
  readonly sourceId: string;
  readonly sourceReady: boolean;
  readonly credentials: readonly EditableCredential[];
  readonly activeCredentialId: string | undefined;
  readonly disabled: boolean;
  readonly onCredentials: (value: readonly EditableCredential[]) => void;
  readonly onActive: (value: string) => void;
  readonly onCompleted: () => Promise<void>;
}) {
  const [quota, setQuota] = useState<Readonly<Record<string, AccountQuota>>>(
    {},
  );
  const [quotaError, setQuotaError] = useState<
    Readonly<Record<string, string>>
  >({});
  const [quotaBusy, setQuotaBusy] = useState<Readonly<Record<string, boolean>>>(
    {},
  );
  const update = (id: string, patch: Partial<EditableCredential>) =>
    onCredentials(
      credentials.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  const remove = (credential: EditableCredential) => {
    const remaining = credentials.filter((item) => item.id !== credential.id);
    if (!remaining.length) {
      onCredentials(freshCredentials());
      onActive("default");
      return;
    }
    onCredentials(remaining);
    if (activeCredentialId === credential.id)
      onActive(remaining.find((item) => item.enabled)?.id ?? remaining[0]!.id);
  };
  const loadQuota = async (credential: EditableCredential) => {
    if (!window.forge.modelAccess) {
      setQuotaError((old) => ({
        ...old,
        [credential.id]: "当前宿主不支持额度查询。",
      }));
      return;
    }
    setQuotaBusy((old) => ({ ...old, [credential.id]: true }));
    setQuotaError((old) => ({ ...old, [credential.id]: "" }));
    try {
      const result = await window.forge.modelAccess({
        type: "quota",
        sourceId,
        credentialId: credential.id,
      });
      if (result.type === "quota")
        setQuota((old) => ({ ...old, [credential.id]: result.quota }));
    } catch (error) {
      setQuotaError((old) => ({
        ...old,
        [credential.id]: describedFailure(error),
      }));
    } finally {
      setQuotaBusy((old) => ({ ...old, [credential.id]: false }));
    }
  };
  return (
    <section className="model-access-section" aria-label="账号与凭据">
      <div className="model-access-heading">
        <h4>账号与凭据</h4>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          disabled={disabled}
          onClick={() =>
            onCredentials([
              ...credentials,
              {
                id: randomId("key"),
                label: `API 密钥 ${credentials.length + 1}`,
                enabled: true,
                type: "api-key",
                apiKey: "",
                clearKey: false,
                status: "ready",
              },
            ])
          }
        >
          添加凭据
        </Button>
      </div>
      <div className="model-access-credential-list">
        {credentials.map((credential) => (
          <div className="model-access-credential" key={credential.id}>
            <div className="model-access-credential-head">
              <label className="model-access-radio">
                <input
                  type="radio"
                  name="model-access-active-credential"
                  checked={activeCredentialId === credential.id}
                  disabled={disabled || !credential.enabled}
                  onChange={() => onActive(credential.id)}
                  aria-label={`选择凭据 ${credential.label}`}
                />
                <Input
                  aria-label="凭据标签"
                  value={credential.label}
                  onChange={(event) =>
                    update(credential.id, { label: event.target.value })
                  }
                />
              </label>
              <Tag>
                {credential.type === "account"
                  ? `账号${credential.platform ? ` · ${credential.platform}` : ""}`
                  : "API Key"}
              </Tag>
              <span className="model-access-status">
                {statusLabel(credential.status)}
              </span>
              <label className="model-access-check">
                <Checkbox
                  checked={credential.enabled}
                  disabled={disabled}
                  aria-label={`启用凭据 ${credential.label}`}
                  onCheckedChange={(checked) =>
                    update(credential.id, { enabled: checked })
                  }
                />
                启用
              </label>
            </div>
            {credential.type === "api-key" ? (
              <div className="model-access-credential-fields">
                <Field id={`model-access-key-${credential.id}`} label="密钥">
                  <Input
                    id={`model-access-key-${credential.id}`}
                    type="password"
                    autoComplete="off"
                    aria-label={`凭据密钥 ${credential.label}`}
                    value={credential.apiKey}
                    placeholder={
                      credential.status === "ready" && credential.apiKey === ""
                        ? "已保存，留空不变"
                        : "API 密钥"
                    }
                    disabled={disabled || credential.clearKey}
                    onChange={(event) =>
                      update(credential.id, { apiKey: event.target.value })
                    }
                  />
                </Field>
                <label className="model-access-check">
                  <Checkbox
                    checked={credential.clearKey}
                    disabled={disabled}
                    aria-label={`清除凭据密钥 ${credential.label}`}
                    onCheckedChange={(checked) =>
                      update(credential.id, {
                        clearKey: checked,
                        ...(checked ? { apiKey: "" } : {}),
                      })
                    }
                  />
                  清除密钥
                </label>
                <IconButton
                  label={`删除凭据 ${credential.label}`}
                  icon={<Trash size={14} aria-hidden="true" />}
                  disabled={disabled}
                  onClick={() => remove(credential)}
                />
              </div>
            ) : (
              <div className="model-access-credential-fields">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={disabled || quotaBusy[credential.id]}
                  loading={quotaBusy[credential.id] === true}
                  onClick={() => void loadQuota(credential)}
                  aria-label={`查询额度 ${credential.label}`}
                >
                  查询额度
                </Button>
                <IconButton
                  label={`删除账号 ${credential.label}`}
                  icon={<Trash size={14} aria-hidden="true" />}
                  disabled={disabled}
                  onClick={() => remove(credential)}
                />
                {quota[credential.id] && (
                  <QuotaView quota={quota[credential.id]!} />
                )}
                {quotaError[credential.id] && (
                  <span className="model-access-status is-error" role="alert">
                    {quotaError[credential.id]}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {sourceReady && (
        <AccountLoginPanel
          sourceId={sourceId}
          disabled={disabled}
          onCompleted={onCompleted}
        />
      )}
    </section>
  );
}
