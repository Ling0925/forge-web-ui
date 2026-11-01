import {
  type SuperAgentMessageRef,
  type Thread,
  type Trigger,
  type WorkItem,
  superAgentMessageRefSchema,
  threadSchema,
  triggerSchema,
  workItemSchema,
} from "@forge/core/shared";
import { z } from "zod";

/**
 * Super-agent deliveries are ordinary user messages that core marks with a
 * trusted `origin: "superagent"` and a validated `superagent` ref (see core PR
 * #13). Recognition depends on that marker alone — never on guessing the prompt
 * text — so a human typing a look-alike renders as an ordinary raw message.
 *
 * Core still builds the content as:
 *
 *   Route this batch:\n<untrusted_data>…
 *   Work item: <id>\nBrief:\n<brief>\n\n<untrusted_data>…
 *   Updates for <id>:\n<untrusted_data>…
 *   Work item changed:\n<untrusted_data>…
 *   Worker report:\n<untrusted_data>…
 *
 * The `<untrusted_data>` JSON is parsed best-effort to fill card details; a
 * missing or invalid block still yields a delivery of that kind (no details).
 */
export type SuperAgentDelivery =
  | {
      readonly kind: "batch" | "updates";
      readonly workId?: string;
      readonly triggers?: readonly Trigger[];
      readonly threads?: readonly Thread[];
    }
  | {
      readonly kind: "assignment";
      readonly workId?: string;
      readonly brief?: string;
      readonly triggers?: readonly Trigger[];
      readonly threads?: readonly Thread[];
    }
  | {
      readonly kind: "work_changed" | "report";
      readonly workId?: string;
      readonly work?: WorkItem;
    };

const KIND: Readonly<
  Record<SuperAgentMessageRef["kind"], SuperAgentDelivery["kind"]>
> = {
  route_batch: "batch",
  work_brief: "assignment",
  work_updates: "updates",
  work_changed: "work_changed",
  worker_report: "report",
};

const BLOCK = /<untrusted_data>\n([\s\S]*)\n<\/untrusted_data>$/;
const triggerData = z
  .object({
    triggers: z.array(triggerSchema),
    threads: z.array(threadSchema),
  })
  .strict();

function block(content: string): unknown {
  const match = BLOCK.exec(content);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1] ?? "");
  } catch {
    return undefined;
  }
}

function brief(content: string): string | undefined {
  return /^Work item: \S+\nBrief:\n([\s\S]*?)\n\n(?=<untrusted_data>\n)/.exec(
    content,
  )?.[1];
}

/**
 * Recognizes a super-agent delivery strictly from its marker. `message` is a
 * user message (a persisted message, a pending steering entry, or a timeline
 * item carrying the validated ref): `origin` must be `"superagent"` and
 * `superagent` must parse against `superAgentMessageRefSchema`.
 */
export function parseSuperAgentDelivery(message: {
  readonly content?: string | null;
  readonly origin?: string | null | undefined;
  readonly superagent?: unknown;
}): SuperAgentDelivery | null {
  if (message.origin !== "superagent") return null;
  const ref = superAgentMessageRefSchema.safeParse(message.superagent);
  if (!ref.success) return null;
  const content = message.content ?? "";
  const { kind, workId } = ref.data;
  switch (kind) {
    case "route_batch":
    case "work_updates": {
      const parsed = triggerData.safeParse(block(content));
      return {
        kind: KIND[kind],
        ...(workId ? { workId } : {}),
        ...(parsed.success ? parsed.data : {}),
      };
    }
    case "work_brief": {
      const parsed = triggerData.safeParse(block(content));
      const summary = brief(content);
      return {
        kind: "assignment",
        ...(workId ? { workId } : {}),
        ...(summary !== undefined ? { brief: summary } : {}),
        ...(parsed.success ? parsed.data : {}),
      };
    }
    case "work_changed":
    case "worker_report": {
      const work = workItemSchema.safeParse(block(content));
      return {
        kind: KIND[kind],
        ...(workId ? { workId } : {}),
        ...(work.success ? { work: work.data } : {}),
      };
    }
  }
}
