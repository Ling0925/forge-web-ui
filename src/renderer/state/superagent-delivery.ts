import {
  type Thread,
  type Trigger,
  type WorkItem,
  threadSchema,
  triggerSchema,
  workItemSchema,
} from "@forge/core/shared";
import { z } from "zod";

/**
 * Super-agent delivers triggers and hand-offs as ordinary user messages; core
 * does not mark their origin (see PR caveat). This recognizes only the exact
 * prompt shapes built by forge-core `src/superagent/engine.ts` (8c07c87):
 *
 *   Route this batch:\n<untrusted_data>…
 *   Work item: <id>\nBrief:\n<brief>\n\n<untrusted_data>…
 *   Updates for <id>:\n<untrusted_data>…
 *   Work item changed:\n<untrusted_data>…
 *   Worker report:\n<untrusted_data>…
 *
 * and only when the JSON block parses against core's schemas. Anything else,
 * including a human typing a look-alike, returns null and renders unchanged.
 */
export type SuperAgentDelivery =
  | {
      readonly kind: "batch" | "updates";
      readonly workId?: string;
      readonly triggers: readonly Trigger[];
      readonly threads: readonly Thread[];
    }
  | {
      readonly kind: "assignment";
      readonly workId: string;
      readonly brief: string;
      readonly triggers: readonly Trigger[];
      readonly threads: readonly Thread[];
    }
  | { readonly kind: "work_changed" | "report"; readonly work: WorkItem };

const BLOCK = /<untrusted_data>\n([\s\S]*)\n<\/untrusted_data>$/;
const triggerData = z
  .object({
    triggers: z.array(triggerSchema),
    threads: z.array(threadSchema),
  })
  .strict();

function block(content: string, prefixLength: number): unknown {
  const match = BLOCK.exec(content.slice(prefixLength));
  if (!match || match.index !== 0) return undefined;
  try {
    return JSON.parse(match[1] ?? "");
  } catch {
    return undefined;
  }
}

export function parseSuperAgentDelivery(
  content: string | null | undefined,
): SuperAgentDelivery | null {
  if (!content || !content.endsWith("</untrusted_data>")) return null;
  const head =
    /^(Route this batch|Work item changed|Worker report|Updates for (\S+)):\n/.exec(
      content,
    );
  if (head) {
    const data = block(content, head[0].length);
    if (head[1] === "Work item changed" || head[1] === "Worker report") {
      const work = workItemSchema.safeParse(data);
      if (!work.success) return null;
      return {
        kind: head[1] === "Worker report" ? "report" : "work_changed",
        work: work.data,
      };
    }
    const parsed = triggerData.safeParse(data);
    if (!parsed.success) return null;
    return head[2]
      ? { kind: "updates", workId: head[2], ...parsed.data }
      : { kind: "batch", ...parsed.data };
  }
  const assignment =
    /^Work item: (\S+)\nBrief:\n([\s\S]*?)\n\n(?=<untrusted_data>\n)/.exec(
      content,
    );
  if (!assignment) return null;
  const parsed = triggerData.safeParse(block(content, assignment[0].length));
  if (!parsed.success) return null;
  return {
    kind: "assignment",
    workId: assignment[1] ?? "",
    brief: assignment[2] ?? "",
    ...parsed.data,
  };
}
