import { diffStats } from "../DiffViewer";
import { decodeCommandConsole } from "./commands";
import { extractPlanData } from "./plans";
import { formatClock, formatStamp, friendlyLabel } from "./presentation";
import { type ToolDisclosureProps } from "./types";
import { parseParams, parseResult } from "./values";

function firstLine(text: string, limit: number): string {
  const newline = text.indexOf("\n");
  return text.slice(0, newline === -1 ? limit : Math.min(newline, limit));
}

export function createToolDisclosureModel({
  toolName,
  target,
  command,
  status,
  timestamp,
  parameters,
  output,
  exitCode,
  error,
  changes,
}: ToolDisclosureProps) {
  const writesFiles = ["edit_file", "write_file", "append_file"].includes(
    toolName,
  );
  // A plain command's arguments are its command line (shown in the console); a
  // background task's arguments are the only record of the requested action.
  const isRunCommand = toolName === "run_command";
  const isCommandTask = toolName === "command_task";
  const parsedOutputRecord = (() => {
    if (typeof output !== "string") return null;
    try {
      const parsed: unknown = JSON.parse(output);
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  })();
  const isCommandTaskList =
    isCommandTask && Array.isArray(parsedOutputRecord?.tasks);
  const isConsole = isRunCommand || (isCommandTask && !isCommandTaskList);
  const isWaiting = status === "running";
  const label = friendlyLabel(toolName);
  const parsedParams = parseParams(parameters);
  const parameterPath =
    typeof parsedParams === "object" &&
    parsedParams !== null &&
    "path" in parsedParams &&
    typeof parsedParams.path === "string"
      ? parsedParams.path
      : undefined;
  const isReadFile = toolName === "read_file";
  const isListFiles = toolName === "list_files";
  const readPath = isReadFile ? parameterPath || target : undefined;
  const consoleModel = isConsole
    ? decodeCommandConsole(output, toolName)
    : null;
  const result =
    !isConsole && output !== null && output !== undefined && output !== ""
      ? parseResult(output)
      : null;
  const planData =
    extractPlanData(result?.kind === "object" ? result.record : output) ??
    extractPlanData(parsedParams);
  const planSummaryTarget =
    !target && planData
      ? (() => {
          const completed = planData.steps.filter(
            (s) => s.status === "completed",
          ).length;
          const total = planData.steps.length;
          const inProgress = planData.steps.find(
            (s) => s.status === "in_progress",
          );
          if (inProgress) return `(${completed}/${total}) ${inProgress.step}`;
          if (planData.explanation)
            return `(${completed}/${total}) ${planData.explanation}`;
          return `${completed}/${total} 步已完成`;
        })()
      : undefined;

  const isSpawnAgent = toolName === "spawn_agent";
  const isWaitAgents = toolName === "wait_agents";
  const isGetAgentResult = toolName === "get_agent_result";
  const isSendMessage = toolName === "send_agent_message";
  const isResolveAgent = toolName === "resolve_agent";
  const isAnswerAdvisor = toolName === "answer_advisor";
  const isAdvisor = toolName === "advisor";
  const isListAgentProfiles = toolName === "list_agent_profiles";
  const isListAgents = toolName === "list_agents";
  const isCancelAgent = toolName === "cancel_agent";
  const isAgentTool =
    isSpawnAgent ||
    isWaitAgents ||
    isGetAgentResult ||
    isSendMessage ||
    isResolveAgent ||
    isAnswerAdvisor ||
    isAdvisor ||
    isListAgentProfiles ||
    isListAgents ||
    isCancelAgent;

  const agentParamsRecord =
    typeof parsedParams === "object" && parsedParams !== null
      ? (parsedParams as Record<string, unknown>)
      : null;

  const agentTarget =
    !target && isAgentTool && agentParamsRecord
      ? (() => {
          if (isSpawnAgent) {
            const profile =
              typeof agentParamsRecord.profileId === "string"
                ? agentParamsRecord.profileId
                : undefined;
            const task =
              typeof agentParamsRecord.task === "string"
                ? firstLine(agentParamsRecord.task, 50)
                : undefined;
            if (profile && task) return `${profile} · ${task}`;
            if (profile) return profile;
            if (typeof agentParamsRecord.ownership === "string") {
              return task
                ? `${agentParamsRecord.ownership} · ${task}`
                : agentParamsRecord.ownership;
            }
            if (task) return task;
            if (typeof agentParamsRecord.model === "string")
              return agentParamsRecord.model;
          }
          if (isWaitAgents) {
            const ids = agentParamsRecord.ids;
            if (Array.isArray(ids) && ids.length > 0)
              return `${ids.length} 个子任务`;
            return "全部当前子任务";
          }
          if (isGetAgentResult && typeof agentParamsRecord.id === "string") {
            return `子代理 #${agentParamsRecord.id.slice(0, 8)}`;
          }
          if (isSendMessage && typeof agentParamsRecord.message === "string") {
            return firstLine(agentParamsRecord.message, 60);
          }
          if (
            isResolveAgent &&
            typeof agentParamsRecord.resolution === "string"
          ) {
            return firstLine(agentParamsRecord.resolution, 60);
          }
          if (isAnswerAdvisor) {
            const req =
              typeof agentParamsRecord.requestId === "string"
                ? `#${agentParamsRecord.requestId.slice(0, 8)}`
                : "";
            const ans =
              typeof agentParamsRecord.answer === "string"
                ? firstLine(agentParamsRecord.answer, 40)
                : "";
            return (
              [req ? `答复 ${req}` : "答复咨询", ans]
                .filter(Boolean)
                .join(" · ") || undefined
            );
          }
          if (isAdvisor && typeof agentParamsRecord.question === "string") {
            return firstLine(agentParamsRecord.question, 60);
          }
          if (isListAgentProfiles) {
            if (
              typeof agentParamsRecord.query === "string" &&
              agentParamsRecord.query
            ) {
              return `过滤：${agentParamsRecord.query}`;
            }
            return "查看全部可用角色";
          }
          if (isCancelAgent && typeof agentParamsRecord.id === "string") {
            return `取消 #${agentParamsRecord.id.slice(0, 8)}`;
          }
          if (isListAgents) {
            return agentParamsRecord.currentRun
              ? "当前运行子任务"
              : "全部子任务";
          }
          return undefined;
        })()
      : undefined;

  const isWebSearch = toolName === "web_search";
  const webSearchTarget =
    !target && isWebSearch && parsedParams && typeof parsedParams === "object"
      ? (() => {
          const rec = parsedParams as Record<string, unknown>;
          if (typeof rec.query === "string" && rec.query) return rec.query;
          if (Array.isArray(rec.queries) && rec.queries.length)
            return rec.queries
              .filter((q): q is string => typeof q === "string")
              .join("; ");
          if (typeof rec.url === "string" && rec.url) return rec.url;
          if (typeof rec.pattern === "string" && rec.pattern)
            return rec.pattern;
          return undefined;
        })()
      : undefined;

  const commandTaskTarget =
    isCommandTask && parsedParams && typeof parsedParams === "object"
      ? (() => {
          const rec = parsedParams as Record<string, unknown>;
          const action = typeof rec.action === "string" ? rec.action : "";
          const id = typeof rec.id === "string" ? rec.id : "";
          const actionText =
            action === "wait"
              ? "等待完成"
              : action === "read"
                ? "读取输出"
                : action === "stop"
                  ? "终止任务"
                  : action === "list"
                    ? "任务列表"
                    : action;
          const shortId = id ? `#${id.slice(0, 8)}` : "";
          return [actionText, shortId].filter(Boolean).join(" · ") || undefined;
        })()
      : undefined;

  const normalizedTarget =
    isCommandTask &&
    target &&
    typeof parsedParams === "object" &&
    parsedParams !== null &&
    "id" in parsedParams &&
    parsedParams.id === target
      ? commandTaskTarget || `#${target.slice(0, 8)}`
      : target;

  const displayTarget = readPath
    ? readPath.split(/[\\/]/).pop() || readPath
    : normalizedTarget ||
      commandTaskTarget ||
      planSummaryTarget ||
      agentTarget ||
      webSearchTarget ||
      (isRunCommand ? command : undefined);
  const showParameters =
    !writesFiles &&
    !isRunCommand &&
    !isCommandTask &&
    !planData &&
    !isAgentTool &&
    !isReadFile;
  const showDebug = !isReadFile;

  // Total added/removed lines across this tool's file changes, for the header.
  // Counts come from the recorded patch (full originals); an unknown count is
  // skipped rather than reported as zero.
  const diffTotals = (changes ?? []).reduce(
    (total, change) => {
      const stats = diffStats(change);
      if (!stats) return total;
      return {
        added: total.added + stats.added,
        removed: total.removed + stats.removed,
      };
    },
    { added: 0, removed: 0 },
  );

  const statusLabel =
    status === "running" ? "执行中" : status === "completed" ? "完成" : "失败";

  const explicitReason =
    result?.kind === "object" && typeof result.record.error === "string"
      ? result.record.error
      : null;
  // A failed card leads with why it failed: the recorded reason, the plain-text
  // result, or an explicit statement that no reason was recorded. The reason is
  // shown once — a plain-text result becomes the reason instead of being
  // repeated under "结果".
  const textFailure = status === "failed" && result?.kind === "text";
  const failureReason =
    status === "failed"
      ? (error ??
        explicitReason ??
        (result?.kind === "text" ? result.text : null) ??
        (result ? null : "失败，但未记录具体原因。"))
      : null;
  // Only drop the `error` row when that exact text is already rendered above.
  const reasonShownAsFailure =
    failureReason !== null && explicitReason === failureReason;
  const hasResult =
    result !== null &&
    !(textFailure && result.kind === "text" && result.text === failureReason) &&
    !(
      result.kind === "object" &&
      reasonShownAsFailure &&
      Object.keys(result.record).length === 1
    );
  const clock = timestamp ? formatClock(timestamp) : null;
  const stamp = timestamp ? formatStamp(timestamp) : undefined;
  const resolvedExit = consoleModel
    ? (exitCode ?? consoleModel.exitCode)
    : (exitCode ?? null);
  const canShowReadFile =
    isReadFile &&
    result?.kind === "object" &&
    (status !== "failed" || !failureReason);
  const isListFilesResult =
    isListFiles &&
    result?.kind === "object" &&
    Array.isArray(result.record.entries);
  const canShowListFiles =
    (isListFilesResult || (isListFiles && isWaiting && !result)) &&
    (status !== "failed" || !failureReason);
  return {
    writesFiles,
    parsedOutputRecord,
    isCommandTaskList,
    isConsole,
    isWaiting,
    label,
    parsedParams,
    readPath,
    consoleModel,
    result,
    planData,
    isSpawnAgent,
    isWaitAgents,
    isGetAgentResult,
    isSendMessage,
    isResolveAgent,
    isAnswerAdvisor,
    isAdvisor,
    isListAgentProfiles,
    isListAgents,
    isCancelAgent,
    agentParamsRecord,
    isWebSearch,
    displayTarget,
    showParameters,
    showDebug,
    diffTotals,
    statusLabel,
    failureReason,
    reasonShownAsFailure,
    hasResult,
    clock,
    stamp,
    resolvedExit,
    canShowReadFile,
    canShowListFiles,
  };
}

export type ToolDisclosureModel = ReturnType<typeof createToolDisclosureModel>;
