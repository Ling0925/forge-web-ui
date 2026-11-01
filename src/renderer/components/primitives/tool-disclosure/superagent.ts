/**
 * Labels and one-line summaries for forge-core's super-agent tools
 * (`src/superagent/tools.ts`). Arguments are model-written: every field is
 * checked before use and anything unexpected simply yields no summary.
 */
export const SUPER_AGENT_TOOL_LABELS: Readonly<Record<string, string>> = {
  superagent_read: "读取触发与线程",
  superagent_list: "查看待分派工作",
  superagent_route: "分派工作",
  superagent_report: "汇报进度",
  superagent_follow: "订阅线程",
  superagent_unfollow: "取消订阅线程",
  superagent_handback: "交还给 Router",
  superagent_send: "提交外部写操作",
};

export const isSuperAgentTool = (name: string) =>
  Object.hasOwn(SUPER_AGENT_TOOL_LABELS, name);

const SEND_KIND_LABELS: Readonly<Record<string, string>> = {
  comment: "评论",
  label: "标签",
  push: "推送分支",
  pull_request: "创建拉取请求",
};
const REPORT_LABELS: Readonly<Record<string, string>> = {
  ready: "待审阅",
  blocked: "受阻",
  failed: "失败",
  done: "已完成",
};
const ROUTE_LABELS: Readonly<Record<string, string>> = {
  new: "新建",
  attach: "关联",
  ignore: "忽略",
  stop: "停止",
};
export const OUTBOX_PENDING_TEXT = "已进发送队列，待批准";

const text = (value: unknown, limit = 60): string | undefined => {
  if (typeof value !== "string") return undefined;
  const line = value.trim().split("\n")[0]?.trim() ?? "";
  if (!line) return undefined;
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
};
const list = (value: unknown): readonly unknown[] | undefined =>
  Array.isArray(value) ? value : undefined;
const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const join = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join(" · ") || undefined;

/** One-line kind/target of a `superagent_send` proposal, e.g. "评论 · gh:…". */
export function describeSend(input: unknown): string | undefined {
  const args = record(input);
  if (!args || typeof args.kind !== "string") return undefined;
  const kind = SEND_KIND_LABELS[args.kind] ?? args.kind;
  const body = record(args.body);
  const target = record(args.target);
  if (args.kind === "comment")
    return join(kind, text(target?.thread, 40), text(body?.text, 40));
  if (args.kind === "label") {
    const labels = list(body?.labels)?.filter(
      (label): label is string => typeof label === "string",
    );
    return join(kind, text(target?.thread, 40), labels?.join("、"));
  }
  if (args.kind === "push") return join(kind, text(body?.branch));
  if (args.kind === "pull_request")
    return join(
      kind,
      text(body?.title),
      typeof body?.head === "string" && typeof body?.base === "string"
        ? `${body.head} → ${body.base}`
        : undefined,
    );
  return kind;
}

export function superAgentToolSummary(
  toolName: string,
  parameters: unknown,
  status: string,
): string | undefined {
  if (!isSuperAgentTool(toolName)) return undefined;
  const args = record(parameters);
  switch (toolName) {
    case "superagent_read": {
      const ids = list(args?.ids);
      if (!ids?.length) return undefined;
      return ids.length === 1 ? text(ids[0]) : `${ids.length} 项`;
    }
    case "superagent_list":
      return "工作、建议与待分派触发";
    case "superagent_route": {
      const decisions = list(args?.decisions);
      if (!decisions?.length) return undefined;
      const counts = new Map<string, number>();
      for (const decision of decisions) {
        const type = record(decision)?.type;
        if (typeof type !== "string") continue;
        const label = ROUTE_LABELS[type] ?? type;
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return (
        [...counts].map(([label, count]) => `${label} ${count}`).join(" · ") ||
        undefined
      );
    }
    case "superagent_report":
      return join(
        typeof args?.status === "string"
          ? (REPORT_LABELS[args.status] ?? args.status)
          : undefined,
        text(args?.progress),
      );
    case "superagent_follow":
    case "superagent_unfollow":
      return text(args?.thread);
    case "superagent_handback": {
      const triggers = list(args?.triggers);
      return join(
        triggers?.length ? `${triggers.length} 个触发` : undefined,
        text(args?.reason, 40),
      );
    }
    case "superagent_send": {
      const described = describeSend(parameters);
      // The tool only queues the write; nothing leaves before approval.
      return status === "completed"
        ? join(OUTBOX_PENDING_TEXT, described)
        : described;
    }
    default:
      return undefined;
  }
}
