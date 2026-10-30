import { CaretRight, WarningCircle } from "@phosphor-icons/react";
import { chartFenceBody, parseChartFence } from "@forge/core/shared/chart-spec";
import { DiffViewer } from "../DiffViewer";
import { ChartCard } from "../../charts/ChartCard";
import { type ToolDisclosureProps } from "./types";
import { ToolCopyButton, SectionHead } from "./common";
import { PlanView } from "./plans";
import {
  type SpawnAgentParams,
  SpawnAgentView,
  parseWaitAgentsResult,
  WaitAgentsView,
  SendAgentMessageView,
  ResolveAgentView,
  AnswerAdvisorView,
  AdvisorCallView,
  ListAgentProfilesView,
} from "./agents";
import {
  type CommandTaskItem,
  CommandTaskListView,
  CommandConsole,
} from "./commands";
import { ValueRows, parseParams, ParameterFields } from "./values";
import { ReadFileResultView, ListFilesResultView } from "./files";
import { WebSearchResultView } from "./web-search";
import type { ToolDisclosureModel } from "./model";

export function ToolDisclosureContent({
  props,
  model,
}: {
  readonly props: ToolDisclosureProps;
  readonly model: ToolDisclosureModel;
}) {
  const {
    toolName,
    command,
    cwd,
    status,
    output,
    exitCode,
    error,
    changes,
    truncated,
  } = props;
  const {
    parsedOutputRecord,
    isCommandTaskList,
    isConsole,
    isWaiting,
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
    agentParamsRecord,
    isWebSearch,
    showParameters,
    showDebug,
    failureReason,
    reasonShownAsFailure,
    hasResult,
    resolvedExit,
    canShowReadFile,
    canShowListFiles,
  } = model;
  // render_chart echoes a canonical ```chart fence; show the chart itself in
  // the card so the model's self-check matches what the body will render.
  const chartPreview =
    toolName === "render_chart" && !failureReason
      ? parseChartFence(
          typeof parsedOutputRecord?.["fence"] === "string"
            ? chartFenceBody(parsedOutputRecord["fence"] as string)
            : "",
        )
      : undefined;
  return (
    <div className="tool-disclosure-body">
      {truncated && (
        <p className="tool-notice">
          <WarningCircle size={13} weight="regular" aria-hidden="true" />
          展示内容已截断（超出界面展示上限）。
        </p>
      )}
      {consoleModel ? (
        /* A command card stays minimal: the executed command and its raw
               result combined in one console viewport. */
        <CommandConsole
          command={command}
          cwd={cwd}
          model={consoleModel}
          status={status}
          {...(error === undefined || error === null ? {} : { error })}
          {...(exitCode === undefined || exitCode === null ? {} : { exitCode })}
        />
      ) : (
        <>
          {readPath &&
            (result?.kind !== "object" || result.record.path !== readPath) && (
              <div className="tool-section tool-path-section">
                <SectionHead title="文件路径" />
                <pre className="tool-section-content tool-read-path">
                  {readPath}
                </pre>
              </div>
            )}
          {failureReason && (
            <div className="tool-section">
              <SectionHead title="失败原因" />
              <pre className="tool-section-content tool-section-error">
                {failureReason}
              </pre>
            </div>
          )}
          {command && (
            <div className="tool-section tool-command-section">
              <SectionHead
                title="命令"
                action={<ToolCopyButton text={command} label="复制命令" />}
              />
              <pre className="tool-section-content tool-command">{command}</pre>
              {cwd && (
                <span className="tool-command-cwd" title={`工作目录：${cwd}`}>
                  工作目录 {cwd}
                </span>
              )}
            </div>
          )}
          {changes && changes.length > 0 && (
            <div className="tool-section">
              <span className="tool-section-title">
                文件改动{" "}
                <span className="tool-diff-count">（{changes.length}）</span>
              </span>
              <div className="tool-diffs">
                {changes.map((change, i) => (
                  <DiffViewer
                    change={change}
                    isSuggested={false}
                    key={`${change.path}-${i}`}
                  />
                ))}
              </div>
            </div>
          )}
          {error && error !== failureReason && (
            <div className="tool-section">
              <SectionHead title="执行错误" />
              <pre className="tool-section-content tool-section-error">
                {error}
              </pre>
            </div>
          )}
          {resolvedExit !== undefined && resolvedExit !== null && (
            <div className="tool-section">
              <SectionHead title="退出码" />
              <span
                className={`tool-exit tool-exit-${resolvedExit === 0 ? "ok" : "bad"}`}
              >
                {resolvedExit}
              </span>
            </div>
          )}
          {planData ? (
            <div className="tool-section tool-plan-section">
              <SectionHead title="计划进度" />
              <PlanView plan={planData} />
            </div>
          ) : isCommandTaskList ? (
            <div className="tool-section tool-command-tasks-section">
              <SectionHead title="后台任务列表" />
              <CommandTaskListView
                tasks={
                  (parsedOutputRecord?.tasks as unknown as readonly CommandTaskItem[]) ??
                  []
                }
                pendingIds={
                  parsedOutputRecord?.pending_ids as
                    | readonly string[]
                    | undefined
                }
              />
            </div>
          ) : isSpawnAgent ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="子任务委派" />
              <SpawnAgentView
                params={agentParamsRecord as SpawnAgentParams}
                result={
                  result?.kind === "object"
                    ? result.record
                    : parseParams(output)
                }
              />
            </div>
          ) : isWaitAgents ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="子任务执行进展" />
              {(() => {
                const reports = parseWaitAgentsResult(
                  result?.kind === "object" ? result.record : output,
                );
                return reports ? (
                  <WaitAgentsView reports={reports} />
                ) : (
                  <span className="tool-section-empty">
                    {isWaiting ? "等待子任务返回…" : "无子任务状态记录"}
                  </span>
                );
              })()}
            </div>
          ) : isGetAgentResult ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="子任务报告详情" />
              {(() => {
                const parsed =
                  result?.kind === "object"
                    ? result.record
                    : parseParams(output);
                const reports = parseWaitAgentsResult(
                  Array.isArray(parsed) ? parsed : [parsed],
                );
                return reports ? (
                  <WaitAgentsView reports={reports} />
                ) : result?.kind === "text" ? (
                  <pre className="tool-section-content">{result.text}</pre>
                ) : (
                  <span className="tool-section-empty">
                    {isWaiting ? "等待子任务返回…" : "无子任务报告"}
                  </span>
                );
              })()}
            </div>
          ) : isSendMessage ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="子代理指令" />
              <SendAgentMessageView
                id={agentParamsRecord?.id as string}
                message={agentParamsRecord?.message as string}
              />
            </div>
          ) : isResolveAgent ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="子任务解决记录" />
              <ResolveAgentView
                id={agentParamsRecord?.id as string}
                resolution={agentParamsRecord?.resolution as string}
              />
            </div>
          ) : isAnswerAdvisor ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="答复智能体咨询" />
              <AnswerAdvisorView
                requestId={agentParamsRecord?.requestId as string}
                answer={agentParamsRecord?.answer as string}
                nextInstruction={agentParamsRecord?.nextInstruction as string}
              />
            </div>
          ) : isAdvisor ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="智能体咨询" />
              <AdvisorCallView
                question={agentParamsRecord?.question as string}
                context={agentParamsRecord?.context as string}
                options={agentParamsRecord?.options as readonly string[]}
                recommendation={agentParamsRecord?.recommendation as string}
              />
            </div>
          ) : isListAgentProfiles ? (
            <div className="tool-section tool-agent-section">
              <SectionHead title="可用智能体配置" />
              <ListAgentProfilesView
                result={
                  result?.kind === "object"
                    ? result.record
                    : parseParams(output)
                }
              />
            </div>
          ) : canShowReadFile && result?.kind === "object" ? (
            <ReadFileResultView record={result.record} isWaiting={isWaiting} />
          ) : canShowListFiles ? (
            <ListFilesResultView
              record={result?.kind === "object" ? result.record : {}}
              parameters={parsedParams}
              isWaiting={isWaiting}
            />
          ) : isWebSearch ? (
            <WebSearchResultView
              record={
                parsedOutputRecord ??
                (result?.kind === "object" ? result.record : {})
              }
              isWaiting={isWaiting}
            />
          ) : chartPreview?.ok ? (
            <div className="tool-section tool-chart-section">
              <SectionHead title="图表预览" />
              <ChartCard
                spec={chartPreview.spec}
                source={String(parsedOutputRecord?.["fence"] ?? "")}
              />
            </div>
          ) : (
            (hasResult || (!result && !failureReason && !changes?.length)) && (
              <div className="tool-section">
                <SectionHead
                  title="结果"
                  {...(result?.kind === "text" && hasResult
                    ? {
                        action: (
                          <ToolCopyButton text={result.text} label="复制结果" />
                        ),
                      }
                    : {})}
                />
                {!result ? (
                  <span className="tool-section-empty">
                    {isWaiting ? "等待工具返回结果…" : "工具未返回文本"}
                  </span>
                ) : result.kind === "text" ? (
                  <pre className="tool-section-content">{result.text}</pre>
                ) : (
                  <ValueRows
                    record={result.record}
                    {...(reasonShownAsFailure
                      ? { skip: new Set(["error"]) }
                      : {})}
                  />
                )}
              </div>
            )
          )}
        </>
      )}

      {(showParameters || showDebug) && (
        <div className="tool-disclosure-footer">
          {showParameters && !isConsole && (
            <details className="tool-details">
              <summary className="tool-debug-summary">
                <CaretRight size={11} weight="bold" aria-hidden="true" />
                调用参数
              </summary>
              <ParameterFields parameters={parsedParams} />
            </details>
          )}
          {/* Raw protocol fields stay collapsed by default, out of the main read. */}
          {showDebug && (
            <details className="tool-debug">
              <summary className="tool-debug-summary">
                <CaretRight size={11} weight="bold" aria-hidden="true" />
                调试信息
              </summary>
              <div className="tool-section">
                <span className="tool-section-title">原生名称</span>
                <pre className="tool-section-content">{toolName}</pre>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
