import {
  CheckCircle,
  CircleDashed,
  WarningCircle,
} from "@phosphor-icons/react";
import { type ToolDisclosureProps } from "./types";
import { formatDuration, paramLabels } from "./presentation";
import { ToolCopyButton, SectionHead } from "./common";

export interface CommandTaskItem {
  readonly id: string;
  readonly status: string;
  readonly title?: string;
  readonly exitCode?: number;
  readonly exit_code?: number;
  readonly duration_ms?: number;
  readonly output_available?: boolean;
}

export function CommandTaskListView({
  tasks,
  pendingIds,
}: {
  readonly tasks: readonly CommandTaskItem[];
  readonly pendingIds?: readonly string[] | undefined;
}) {
  if (tasks.length === 0) {
    return <span className="tool-section-empty">暂无后台任务</span>;
  }
  return (
    <div className="command-tasks-view">
      {tasks.map((task) => {
        const isCompleted = task.status === "completed";
        const isRunning =
          task.status === "running" ||
          task.status === "starting" ||
          pendingIds?.includes(task.id);
        const isFailed = task.status === "failed";
        const exit = task.exitCode ?? task.exit_code;
        return (
          <div
            key={task.id}
            className={`command-task-card status-${task.status}`}
          >
            <div className="command-task-main">
              <span className={`command-task-badge status-${task.status}`}>
                {isCompleted ? (
                  <CheckCircle size={12} weight="fill" />
                ) : isRunning ? (
                  <CircleDashed size={12} weight="bold" />
                ) : (
                  <WarningCircle size={12} weight="fill" />
                )}
                <span>
                  {isCompleted
                    ? "已完成"
                    : isRunning
                      ? "执行中"
                      : isFailed
                        ? "失败"
                        : "已终止"}
                </span>
              </span>
              <code className="command-task-id" title={task.id}>
                #{task.id.slice(0, 8)}
              </code>
              {task.title && (
                <span className="command-task-title">{task.title}</span>
              )}
            </div>
            <div className="command-task-meta">
              {exit !== undefined && (
                <span
                  className={`tool-exit tool-exit-${exit === 0 ? "ok" : "bad"}`}
                >
                  退出码 {exit}
                </span>
              )}
              {typeof task.duration_ms === "number" && (
                <span className="command-task-duration">
                  {formatDuration(task.duration_ms)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ConsoleFact {
  readonly label: string;
  readonly value: string;
}

interface CommandConsoleModel {
  /** The console body: stdout for a command, `output` for a background task. */
  readonly body: string | null;
  readonly stderr: string | null;
  readonly error: string | null;
  readonly exitCode: number | null;
  readonly notices: readonly string[];
  readonly facts: readonly ConsoleFact[];
  /** A background task whose output has not been produced yet. */
  readonly pending: boolean;
}

const consoleBodyKeys = ["stdout", "output"] as const;

const consoleConsumedKeys: ReadonlySet<string> = new Set([
  ...consoleBodyKeys,
  "stderr",
  "error",
  "exit_code",
  "signal",
  "timed_out",
  "spawn_failed",
  "truncated",
  "output_truncated",
  "duration_ms",
  // Internal protocol & pagination fields for background command tasks:
  "id",
  "status",
  "output_available",
  "output_id",
  "output_notice",
  "preview_truncated",
  "result_is_error",
  "offset",
  "offset_units",
  "total_chars",
  "next_offset",
  "action",
  "background",
  "tasks",
  "pending_ids",
]);

function scalarFact(value: unknown): string | null {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length <= 160) return value;
  return null;
}

/**
 * Command results arrive as the tool's own JSON envelope
 * (`{stdout, stderr, exit_code, …}`); the card decodes that envelope instead of
 * printing escaped JSON at the reader. Anything unrecognised is shown verbatim.
 */
export function decodeCommandConsole(
  output: string | null | undefined,
  toolName: string,
): CommandConsoleModel {
  const text = typeof output === "string" ? output : "";
  let record: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed))
      record = parsed as Record<string, unknown>;
  } catch {
    // Plain console output.
  }
  if (!record)
    return {
      // An empty string means "no output", not an empty console viewport.
      body: text === "" ? null : text,
      stderr: null,
      error: null,
      exitCode: null,
      notices: [],
      facts: [],
      pending: false,
    };

  // If a command_task's output payload is itself a JSON string representing
  // the command's completed envelope ({ stdout, stderr, exit_code, ... }),
  // unwrap it so the console displays genuine lines instead of escaped JSON.
  let innerRecord: Record<string, unknown> | null = null;
  if (typeof record.output === "string") {
    try {
      const parsedInner: unknown = JSON.parse(record.output);
      if (
        typeof parsedInner === "object" &&
        parsedInner !== null &&
        !Array.isArray(parsedInner)
      ) {
        innerRecord = parsedInner as Record<string, unknown>;
      }
    } catch {
      // Plain text output
    }
  }

  const stringField = (key: string) =>
    typeof record[key] === "string" ? (record[key] as string) : null;
  const numberField = (key: string) => {
    const value = record[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  const innerStringField = (key: string) =>
    innerRecord && typeof innerRecord[key] === "string"
      ? (innerRecord[key] as string)
      : null;
  const innerNumberField = (key: string) => {
    if (!innerRecord) return null;
    const value = innerRecord[key];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  let body: string | null = null;
  if (innerRecord) {
    const stdout = innerStringField("stdout");
    const out = innerStringField("output");
    const err = innerStringField("error");
    if (stdout !== null) {
      body = stdout;
    } else if (out !== null) {
      body = out;
    } else if (err !== null) {
      body = null;
    } else {
      body = stringField("output") ?? null;
    }
  } else {
    body =
      consoleBodyKeys
        .map((key) => stringField(key))
        .find((value) => value !== null) ?? null;
  }

  const stderr = innerStringField("stderr") ?? stringField("stderr");
  const error = innerStringField("error") ?? stringField("error");
  const exitCode = innerNumberField("exit_code") ?? numberField("exit_code");

  const pending =
    record.output_available === false ||
    innerRecord?.output_available === false;

  const notices: string[] = [];
  const timedOut = record.timed_out === true || innerRecord?.timed_out === true;
  if (timedOut) notices.push("命令超时后已被终止。");
  const spawnFailed =
    record.spawn_failed === true || innerRecord?.spawn_failed === true;
  if (spawnFailed) notices.push("进程未能启动。");
  const signal = innerStringField("signal") ?? stringField("signal");
  if (signal) notices.push(`命令被信号 ${signal} 终止。`);
  if (
    record.output_truncated === true ||
    innerRecord?.output_truncated === true
  )
    notices.push("原始输出已在上限处截断。");
  if (record.truncated === true)
    notices.push(
      toolName === "command_task"
        ? "这是分页结果，还有更多输出可继续读取。"
        : "输出超出采集上限，已停止采集。",
    );
  else if (
    innerRecord?.truncated === true ||
    innerRecord?.preview_truncated === true
  )
    notices.push("输出超出采集上限，已停止采集。");

  const facts: ConsoleFact[] = [];
  const duration =
    innerNumberField("duration_ms") ?? numberField("duration_ms");
  if (duration !== null)
    facts.push({
      label: paramLabels.duration_ms ?? "进程耗时",
      value: formatDuration(duration),
    });

  const taskId = stringField("id");
  if (taskId && toolName === "command_task") {
    facts.push({
      label: "任务标识",
      value: `#${taskId.slice(0, 8)}`,
    });
  }

  for (const [key, value] of Object.entries(record)) {
    if (facts.length >= 8) break;
    if (consoleConsumedKeys.has(key)) continue;
    const fact = scalarFact(value);
    if (fact === null) continue;
    facts.push({ label: paramLabels[key] ?? key, value: fact });
  }

  return {
    body,
    stderr,
    error,
    exitCode,
    notices,
    facts,
    pending,
  };
}

/** The integrated console: the command, its streams and its exit code as one unit. */
export function CommandConsole({
  command,
  cwd,
  error,
  exitCode,
  model,
  status,
}: {
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
  readonly error?: string | null;
  readonly exitCode?: number | null;
  readonly model: CommandConsoleModel;
  readonly status: ToolDisclosureProps["status"];
}) {
  const resolvedExit = exitCode ?? model.exitCode;
  const failure = error ?? model.error;
  const emptyText = model.pending
    ? "命令仍在运行，输出尚未生成。"
    : status === "running"
      ? "等待命令输出…"
      : "工具未返回文本";
  return (
    <div className="tool-terminal-card">
      {command && (
        <div className="tool-terminal-header tool-section">
          <div className="tool-terminal-prompt">
            <pre className="tool-section-content tool-command">{command}</pre>
          </div>
          <div className="tool-terminal-header-meta">
            {cwd && (
              <span className="tool-command-cwd" title={`工作目录：${cwd}`}>
                工作目录 {cwd}
              </span>
            )}
            <ToolCopyButton text={command} label="复制命令" />
          </div>
        </div>
      )}
      <div className="tool-terminal-output tool-section">
        <SectionHead
          title="结果"
          action={
            <div className="tool-section-actions">
              {resolvedExit !== undefined && resolvedExit !== null && (
                <span
                  className={`tool-exit tool-exit-${resolvedExit === 0 ? "ok" : "bad"}`}
                >
                  退出码 {resolvedExit}
                </span>
              )}
              {model.body !== null && (
                <ToolCopyButton text={model.body} label="复制输出" />
              )}
            </div>
          }
        />
        {failure && (
          <pre className="tool-section-content tool-section-error">
            {failure}
          </pre>
        )}
        {model.stderr !== null && model.stderr !== "" && (
          <>
            <span className="tool-section-title tool-stream-title">
              标准错误
            </span>
            <pre className="tool-section-content tool-console-stderr">
              {model.stderr}
            </pre>
          </>
        )}
        {model.body === null ? (
          failure ? null : (
            <span className="tool-section-empty">{emptyText}</span>
          )
        ) : (
          <pre className="tool-section-content tool-terminal-pre">
            {model.body}
          </pre>
        )}
        {model.notices.map((notice) => (
          <p className="tool-notice" key={notice}>
            <WarningCircle size={13} weight="regular" aria-hidden="true" />
            {notice}
          </p>
        ))}
        {model.facts.length > 0 && (
          <div className="tool-console-facts">
            {model.facts.map((fact) => (
              <span className="tool-fact" key={fact.label}>
                <span className="tool-fact-label">{fact.label}</span>
                <span className="tool-fact-value">{fact.value}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
