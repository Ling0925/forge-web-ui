import type { ProjectContextDto } from "@forge/core/shared/ipc";
import { useEffect, useRef, useState } from "react";
import { OperationScope } from "../../state/operation-scope";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { Button } from "../primitives/Button";
import { requestSettingsSection } from "./settings/settings-options";

export function ProjectResources({
  onLeave,
}: {
  /** Closes the surrounding dialog before Settings opens. */
  readonly onLeave?: () => void;
} = {}) {
  const { openSettings } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
    }),
    shallowEqual,
  );
  const id = state.activeSessionId;
  const scope = useRef(new OperationScope());
  useEffect(() => {
    scope.current = new OperationScope();
    return () => scope.current.close();
  }, []);
  const [context, setContext] = useState<ProjectContextDto | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (id)
      void window.forge
        .getProjectContext(id)
        .then((value) => {
          if (alive) setContext(value);
        })
        .catch((err) => {
          if (alive) setError(err instanceof Error ? err.message : "读取失败");
        });
    return () => {
      alive = false;
    };
  }, [id]);
  const action = async (operation: (valid: () => boolean) => Promise<void>) => {
    const valid = scope.current.begin();
    setBusy(true);
    setError("");
    try {
      await operation(valid);
    } catch (err) {
      if (valid()) setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      if (valid()) setBusy(false);
    }
  };
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <section className="wb-stack">
        <h3>项目指令与技能</h3>
        <Button
          size="sm"
          disabled={!id || busy}
          onClick={() =>
            void action(async (valid) => {
              if (!id) return;
              const value = await window.forge.getProjectContext(id);
              if (valid()) setContext(value);
            })
          }
        >
          重新读取项目上下文
        </Button>
        {context && (
          <>
            <p>
              {context.counts.instructions} 个指令来源 · {context.counts.skills}{" "}
              个技能
            </p>
            <ol>
              {context.instructionSources.map((source) => (
                <li key={source.path}>
                  <code className="wb-wrap-anywhere">{source.path}</code> · 顺序{" "}
                  {source.order} · {source.bytes} 字节
                </li>
              ))}
            </ol>
            {context.skills.map((skill) => (
              <details key={skill.id}>
                <summary>
                  {skill.name}
                  {skill.version ? ` · ${skill.version}` : ""}
                </summary>
                <p>{skill.description}</p>
                <p className="wb-muted wb-wrap-anywhere">
                  {skill.provenance} · {skill.sourceDirectory}
                </p>
                <code className="wb-wrap-anywhere">{skill.id}</code>
              </details>
            ))}
            {context.warnings.map((warning) => (
              <p key={warning} className="form-error">
                {warning}
              </p>
            ))}
            <p className="wb-muted">
              这里只显示元数据。技能正文由模型按需加载，不授予额外权限。
            </p>
          </>
        )}
      </section>
      <section className="wb-stack" aria-label="MCP 服务器">
        <h3>MCP 服务器</h3>
        <p className="wb-muted">
          MCP 服务器对所有工作区生效，在设置中统一添加、启用和测试。
        </p>
        <Button
          size="sm"
          onClick={() => {
            onLeave?.();
            requestSettingsSection("mcp");
            openSettings(true);
          }}
        >
          在设置中管理 MCP 服务器
        </Button>
      </section>
    </>
  );
}
