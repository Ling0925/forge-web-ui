import type { CheckpointDto } from "@forge/core/shared/ipc";
import { useCallback, useEffect, useRef, useState } from "react";
import { OperationScope } from "../../state/operation-scope";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../state/workbench-store";
import { ArrowsCounterClockwise } from "@phosphor-icons/react";
import { Button } from "../primitives/Button";
import { CodeBlock } from "../primitives/CodeBlock";
import { IconButton } from "../primitives/IconButton";
import { Tag } from "../primitives/Tag";
import { Dialog } from "./Dialog";

export function CheckpointPanel() {
  const { refreshActiveSession } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      activeSessionId: state.activeSessionId,
      running: Boolean(
        state.activeSessionId &&
          (state.activeRuns[state.activeSessionId]?.status === "running" ||
            state.activeRuns[state.activeSessionId]?.status ===
              "awaiting_approval" ||
            state.activeSnapshot?.status === "running" ||
            state.activeSnapshot?.status === "awaiting_approval"),
      ),
    }),
    shallowEqual,
  );
  const id = state.activeSessionId;
  const scope = useRef(new OperationScope());
  useEffect(() => {
    scope.current = new OperationScope();
    return () => scope.current.close();
  }, []);
  const [checkpoints, setCheckpoints] = useState<readonly CheckpointDto[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CheckpointDto | null>(null);
  const [diff, setDiff] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const report = useCallback(
    (err: unknown) => setError(err instanceof Error ? err.message : "操作失败"),
    [],
  );
  useEffect(() => {
    let alive = true;
    setCheckpoints([]);
    setSelected(null);
    setDiff("");
    setError("");
    if (id) {
      void window.forge
        .listCheckpoints(id)
        .then((value) => {
          if (alive) setCheckpoints(value);
        })
        .catch((err) => {
          if (alive) report(err);
        });
    }
    return () => {
      alive = false;
    };
  }, [id, report]);
  const action = async (operation: (valid: () => boolean) => Promise<void>) => {
    const valid = scope.current.begin();
    setBusy(true);
    setError("");
    try {
      await operation(valid);
    } catch (err) {
      if (valid()) report(err);
    } finally {
      if (valid()) setBusy(false);
    }
  };
  const running = id && state.running;
  const loadDiff = (checkpoint: CheckpointDto, thenConfirm: boolean) =>
    void action(async (valid) => {
      if (!id) return;
      const value = await window.forge.getCheckpointDiff(id, checkpoint.id);
      if (!valid()) return;
      setSelected(checkpoint);
      setDiff(value);
      setConfirmRestore(thenConfirm);
    });
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="inspector-checkpoints" aria-label="文件检查点">
        <div className="inspector-checkpoints-head">
          <span className="inspector-checkpoints-title">
            检查点
            <span className="inspector-row-hint">{checkpoints.length}</span>
          </span>
          <IconButton
            size="sm"
            label="刷新检查点"
            icon={<ArrowsCounterClockwise size={13} weight="bold" />}
            disabled={!id || busy}
            onClick={() =>
              void action(async (valid) => {
                if (!id) return;
                const value = await window.forge.listCheckpoints(id);
                if (valid()) setCheckpoints(value);
              })
            }
          />
        </div>
        {checkpoints.length === 0 ? (
          <p className="wb-muted inspector-row-hint">
            暂无检查点。写入文件前会自动备份，可在这里逐个恢复。
          </p>
        ) : (
          <ul className="inspector-checkpoint-list">
            {checkpoints.map((checkpoint) => (
              <li
                key={checkpoint.id}
                className={`inspector-checkpoint-row${selected?.id === checkpoint.id ? " is-selected" : ""}`}
              >
                <span
                  className="inspector-checkpoint-path"
                  title={`${checkpoint.path} · ${checkpoint.createdAt}`}
                >
                  {checkpoint.path}
                </span>
                {checkpoint.state !== "completed" && (
                  <Tag tone="muted">
                    {checkpoint.state === "restored" ? "已恢复" : "写入中"}
                  </Tag>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`查看差异 ${checkpoint.path}`}
                  onClick={() => loadDiff(checkpoint, false)}
                >
                  差异
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={
                    busy || Boolean(running) || checkpoint.state !== "completed"
                  }
                  aria-label={`恢复 ${checkpoint.path}`}
                  onClick={() => loadDiff(checkpoint, true)}
                >
                  恢复
                </Button>
              </li>
            ))}
          </ul>
        )}
        {selected && diff && (
          <div className="inspector-checkpoint-diff">
            <CodeBlock code={diff} language="diff" />
          </div>
        )}
        <p className="wb-muted inspector-row-hint">
          只恢复选中文件，不执行 git reset；命令副作用不在备份范围内。
        </p>
      </section>
      {confirmRestore && selected && (
        <Dialog title="确认恢复文件" onClose={() => setConfirmRestore(false)}>
          <div className="modal-content wb-stack">
            <p>
              将 {selected.path} 恢复至检查点 {selected.id}
              。若文件已被其他操作修改，主机会拒绝冲突恢复。
            </p>
            <Button
              variant="danger"
              disabled={busy || Boolean(running)}
              onClick={() =>
                void action(async (valid) => {
                  if (!id) return;
                  await window.forge.restoreCheckpoint(id, selected.id);
                  if (!valid()) return;
                  await refreshActiveSession();
                  const checkpoints = await window.forge.listCheckpoints(id);
                  if (!valid()) return;
                  setCheckpoints(checkpoints);
                  setConfirmRestore(false);
                  setSelected(null);
                })
              }
            >
              确认恢复此文件
            </Button>
            {error && <p role="alert">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
