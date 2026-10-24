import { CheckCircle, Circle, CircleDashed } from "@phosphor-icons/react";

export interface PlanStepItem {
  readonly step: string;
  readonly status: "pending" | "in_progress" | "completed";
}

export interface PlanItemData {
  /** Optional in tool arguments written before independent plans existed. */
  readonly id?: string | undefined;
  readonly title?: string | undefined;
  readonly explanation?: string | undefined;
  readonly steps: readonly PlanStepItem[];
}

export function isPlanSteps(data: unknown): data is readonly PlanStepItem[] {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item.step === "string" &&
      (item.status === "pending" ||
        item.status === "in_progress" ||
        item.status === "completed"),
  );
}

export function extractPlanData(data: unknown): PlanItemData | null {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  const steps = record.steps;
  if (!isPlanSteps(steps)) return null;
  const explanation =
    typeof record.explanation === "string" ? record.explanation : undefined;
  const id = typeof record.id === "string" ? record.id : undefined;
  const title = typeof record.title === "string" ? record.title : undefined;
  return { id, title, explanation, steps };
}

export function PlanStepsList({
  steps,
}: { readonly steps: readonly PlanStepItem[] }) {
  return (
    <ol className="tool-plan-steps">
      {steps.map((item, idx) => {
        const isCompleted = item.status === "completed";
        const isInProgress = item.status === "in_progress";
        return (
          <li
            key={idx}
            className={`tool-plan-step tool-plan-step-${item.status}`}
          >
            <span className="tool-plan-step-icon" aria-hidden="true">
              {isCompleted ? (
                <CheckCircle
                  size={15}
                  weight="fill"
                  className="step-icon-completed"
                />
              ) : isInProgress ? (
                <CircleDashed
                  size={15}
                  weight="bold"
                  className="step-icon-in-progress"
                />
              ) : (
                <Circle
                  size={15}
                  weight="regular"
                  className="step-icon-pending"
                />
              )}
            </span>
            <span className="tool-plan-step-num">{idx + 1}.</span>
            <span className="tool-plan-step-text">{item.step}</span>
            <span className={`tool-plan-step-status status-${item.status}`}>
              {isCompleted ? "已完成" : isInProgress ? "进行中" : "待处理"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PlanView({ plan }: { readonly plan: PlanItemData }) {
  const completed = plan.steps.filter((s) => s.status === "completed").length;
  const total = plan.steps.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="tool-plan-view">
      <div className="tool-plan-header">
        {plan.title && <strong title={plan.id}>{plan.title}</strong>}
        <div className="tool-plan-progress-info">
          <span className="tool-plan-progress-tag">
            计划进度 {completed} / {total} 项完成
          </span>
          <span className="tool-plan-progress-percent">{percent}%</span>
        </div>
        <div className="tool-plan-progress-track">
          <div
            className="tool-plan-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        {plan.explanation && (
          <div className="tool-plan-explanation">
            <span className="tool-plan-explanation-label">说明：</span>
            <span>{plan.explanation}</span>
          </div>
        )}
      </div>
      <PlanStepsList steps={plan.steps} />
    </div>
  );
}
