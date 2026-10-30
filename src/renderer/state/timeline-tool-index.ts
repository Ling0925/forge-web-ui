import type { ExecutionTurn } from "@forge/core/shared/execution";
import type { AgentEvent, Message } from "@forge/core/shared/schemas";
import type { SessionSnapshot } from "../shared-types";

type ToolStart = Extract<AgentEvent, { type: "tool_started" }>;
type ToolFinish = Extract<AgentEvent, { type: "tool_finished" }>;

interface ToolEvents {
  readonly starts: readonly ToolStart[];
  readonly finishes: readonly ToolFinish[];
}

interface ToolMatch {
  readonly start: ToolStart | undefined;
  readonly finish: ToolFinish | undefined;
}

function append<T>(index: Map<string, T[]>, key: string, value: T): void {
  const entries = index.get(key);
  if (entries) entries.push(value);
  else index.set(key, [value]);
}

function eventIndex(events: readonly AgentEvent[]) {
  const starts = new Map<string, ToolStart[]>();
  const finishes = new Map<string, ToolFinish[]>();
  const identity = (id: string, generationId?: string, callIndex?: number) =>
    JSON.stringify([id, generationId, callIndex]);
  for (const event of events) {
    if (event.type === "tool_started") {
      append(starts, identity(event.call.id), event);
      if (event.generationId)
        append(
          starts,
          identity(event.call.id, event.generationId, event.callIndex),
          event,
        );
    } else if (event.type === "tool_finished") {
      append(finishes, identity(event.toolCallId), event);
      if (event.generationId)
        append(
          finishes,
          identity(event.toolCallId, event.generationId, event.callIndex),
          event,
        );
    }
  }
  return (
    id: string,
    generationId?: string,
    callIndex?: number,
  ): ToolEvents => {
    const key = identity(
      id,
      generationId,
      generationId ? callIndex : undefined,
    );
    return { starts: starts.get(key) ?? [], finishes: finishes.get(key) ?? [] };
  };
}

function countCalls(messages: readonly Message[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const message of messages)
    if (message.role === "assistant")
      for (const call of message.tool_calls ?? [])
        counts.set(call.id, (counts.get(call.id) ?? 0) + 1);
  return counts;
}

/** Index once per snapshot; legacy occurrences remain scoped to their execution turn. */
export function indexTimelineTools(
  snapshot: SessionSnapshot,
  turns: readonly ExecutionTurn[],
): ReadonlyMap<number, readonly ToolMatch[]> {
  const globalEvents = eventIndex(snapshot.events);
  const globalTotals = countCalls(snapshot.messages);
  const scopes = turns.map((turn) =>
    turn.events.length
      ? {
          events: eventIndex(turn.events),
          totals: countCalls(
            snapshot.messages.slice(turn.messageStart, turn.messageEnd),
          ),
          seen: new Map<string, number>(),
        }
      : undefined,
  );
  const lastResults = new Map<string, number>();
  for (const [index, message] of snapshot.messages.entries())
    if (message.role === "tool") lastResults.set(message.tool_call_id, index);

  const occurrences = new Map<string, number>();
  const matches = new Map<number, readonly ToolMatch[]>();
  let turn = -1;
  for (const [index, message] of snapshot.messages.entries()) {
    if (turns[turn + 1]?.messageStart === index) turn++;
    if (message.role !== "assistant") continue;
    const scope = scopes[turn];
    const calls = message.tool_calls ?? [];
    matches.set(
      index,
      calls.map((call, callIndex): ToolMatch => {
        const occurrence = occurrences.get(call.id) ?? 0;
        occurrences.set(call.id, occurrence + 1);
        const { starts, finishes } = (scope?.events ?? globalEvents)(
          call.id,
          message.generationId,
          callIndex,
        );
        const total = (scope?.totals ?? globalTotals).get(call.id) ?? 1;
        const localOccurrence = scope
          ? (scope.seen.get(call.id) ?? 0)
          : occurrence;
        const finalUnresolved =
          localOccurrence === total - 1 &&
          (lastResults.get(call.id) ?? -1) <= index;
        return {
          start: message.generationId
            ? starts.length === 1
              ? starts[0]
              : undefined
            : starts.length === total
              ? starts[localOccurrence]
              : finalUnresolved && starts.length > finishes.length
                ? starts.at(-1)
                : undefined,
          finish: message.generationId
            ? finishes.length === 1
              ? finishes[0]
              : undefined
            : finishes.length === total
              ? finishes[localOccurrence]
              : undefined,
        };
      }),
    );
    // Legacy local occurrence counts prior messages, not sibling calls in this message.
    if (scope)
      for (const call of calls)
        scope.seen.set(call.id, (scope.seen.get(call.id) ?? 0) + 1);
  }
  return matches;
}
