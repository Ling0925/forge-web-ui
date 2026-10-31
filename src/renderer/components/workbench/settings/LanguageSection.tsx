import { Plus, Trash } from "@phosphor-icons/react";
import { Button } from "../../primitives/Button";
import { EmptyState } from "../../primitives/EmptyState";
import { Field } from "../../primitives/Field";
import { Input } from "../../primitives/Input";
import { SaveIndicator } from "./SettingRows";
import type { SettingsForm } from "./useSettingsForm";

export function LanguageSection({ form }: { readonly form: SettingsForm }) {
  const { draft, changeLsp, saveLsp, resetLsp, lspDirty, lspStatus } = form;
  const change = (_name: "lspServers", value: typeof draft.lspServers) =>
    changeLsp(value);
  return (
    <section className="settings-section" aria-label="语言服务配置">
      <div className="settings-flat-group">
        <p className="settings-section-hint">
          最多 8 个服务，服务 ID
          和文件扩展名不能重复。保存不会安装服务；使用时会执行本机命令，请只配置可信程序。
        </p>
        {!draft.lspServers.length && (
          <EmptyState
            variant="inline"
            title="尚未配置语言服务"
            description="添加已安装的语言服务器以启用代码诊断。"
          />
        )}
        {draft.lspServers.map((row, index) => (
          <article className="settings-entry" key={index}>
            <div className="settings-entry-header">
              <h4>
                语言服务 {index + 1}
                {row.id ? ` · ${row.id}` : ""}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash size={14} />}
                onClick={() =>
                  change(
                    "lspServers",
                    draft.lspServers.filter((_, i) => i !== index),
                  )
                }
              >
                移除此语言服务
              </Button>
            </div>
            <div className="settings-columns">
              <Field id={`lsp-${index}-id`} label="服务 ID">
                <Input
                  id={`lsp-${index}-id`}
                  placeholder="例如 ts 或 pyright"
                  value={row.id}
                  onChange={(e) =>
                    change(
                      "lspServers",
                      draft.lspServers.map((v, i) =>
                        i === index ? { ...v, id: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field id={`lsp-${index}-command`} label="启动命令">
                <Input
                  id={`lsp-${index}-command`}
                  placeholder="例如 typescript-language-server"
                  value={row.command}
                  onChange={(e) =>
                    change(
                      "lspServers",
                      draft.lspServers.map((v, i) =>
                        i === index ? { ...v, command: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
            </div>
            <div className="settings-columns">
              <Field
                id={`lsp-${index}-args`}
                label="启动参数"
                helper="JSON 字符串数组"
              >
                <Input
                  id={`lsp-${index}-args`}
                  placeholder='["--stdio"]'
                  aria-describedby={`lsp-${index}-args-helper`}
                  value={row.args}
                  onChange={(e) =>
                    change(
                      "lspServers",
                      draft.lspServers.map((v, i) =>
                        i === index ? { ...v, args: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
              <Field
                id={`lsp-${index}-extensions`}
                label="文件扩展名（逗号分隔）"
              >
                <Input
                  id={`lsp-${index}-extensions`}
                  placeholder=".ts, .tsx"
                  value={row.extensions}
                  onChange={(e) =>
                    change(
                      "lspServers",
                      draft.lspServers.map((v, i) =>
                        i === index ? { ...v, extensions: e.target.value } : v,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          </article>
        ))}
        <div className="settings-card-action-row">
          <SaveIndicator status={lspStatus} />
          {lspDirty && (
            <Button size="sm" variant="ghost" onClick={resetLsp}>
              放弃修改
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={!lspDirty || lspStatus.state === "saving"}
            loading={lspStatus.state === "saving"}
            onClick={() => void saveLsp()}
          >
            保存语言服务
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={<Plus size={14} />}
            disabled={draft.lspServers.length >= 8}
            onClick={() =>
              change("lspServers", [
                ...draft.lspServers,
                { id: "", command: "", args: "[]", extensions: "" },
              ])
            }
          >
            添加语言服务
          </Button>
        </div>
      </div>
    </section>
  );
}
