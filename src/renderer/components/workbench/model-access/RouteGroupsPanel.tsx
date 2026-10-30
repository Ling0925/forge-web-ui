import type { RouteGroup, RouteMember } from "@forge/core/shared/model-access";
import type { ModelCatalog } from "@forge/core/shared/model-catalog";
import { FloppyDisk, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import {
  shallowEqual,
  useWorkbenchActions,
  useWorkbenchSelector,
} from "../../../state/workbench-store";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { EmptyState } from "../../primitives/EmptyState";
import { Field } from "../../primitives/Field";
import { IconButton } from "../../primitives/IconButton";
import { Input } from "../../primitives/Input";
import { Select } from "../../primitives/Select";
import { Tag } from "../../primitives/Tag";
import { Dialog } from "../Dialog";
import { describedFailure, randomId } from "./drafts";

const ROUTE_STRATEGY_META: Readonly<
  Record<
    RouteGroup["strategy"],
    { readonly label: string; readonly badge: string; readonly desc: string }
  >
> = {
  order: {
    label: "顺序优先 (order)",
    badge: "顺序调度",
    desc: "按成员排列顺序依次调用，前序节点不可用时自动故障转移至下一节点。",
  },
  rotate: {
    label: "轮换均衡 (rotate)",
    badge: "轮换均衡",
    desc: "在已启用成员间依次轮询分发请求，均衡多来源并发与配额消耗。",
  },
  usage: {
    label: "用量优先 (usage)",
    badge: "用量优先",
    desc: "优先路由至剩余额度更充裕或近期消耗较低的成员节点。",
  },
  smart: {
    label: "智能择优 (smart)",
    badge: "智能择优",
    desc: "综合近期响应延迟、成功率与可用状态动态选择最优节点。",
  },
  pace: {
    label: "节流控制 (pace)",
    badge: "节流控制",
    desc: "平滑控制各节点请求节奏，避免单来源突发流量触发限流。",
  },
};

const emptyRoute = (): RouteGroup => ({
  id: randomId("route"),
  label: "",
  strategy: "order",
  sticky: false,
  members: [{ sourceId: "", model: "", enabled: true }],
});

export function RouteGroupsPanel({
  catalogs,
}: {
  readonly catalogs: Readonly<Record<string, ModelCatalog>>;
}) {
  const { updateSettings } = useWorkbenchActions();
  const state = useWorkbenchSelector(
    ({ state }) => ({
      settings: state.settings,
    }),
    shallowEqual,
  );
  const sources = state.settings?.providerSources ?? [];
  const groups = state.settings?.routeGroups ?? [];
  const [draft, setDraft] = useState<RouteGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState("");
  const add = () => {
    setError("");
    setDraft(emptyRoute());
  };
  const edit = (group: RouteGroup) => {
    setError("");
    setDraft({
      ...group,
      members: group.members.map((member) => ({ ...member })),
    });
  };
  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) {
      setError("请填写路由组名称。");
      return;
    }
    const members = draft.members.filter(
      (member) => member.sourceId.trim() && member.model.trim(),
    );
    if (!members.length) {
      setError("至少需要一个成员。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await updateSettings({
        route: {
          type: "save",
          group: { ...draft, label: draft.label.trim(), members },
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(null);
    } catch (saveError) {
      setError(describedFailure(saveError));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await updateSettings({ route: { type: "remove", id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirming("");
    } catch (removeError) {
      setError(describedFailure(removeError));
    } finally {
      setBusy(false);
    }
  };
  const patchMember = (index: number, patch: Partial<RouteMember>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      members: draft.members.map((member, at) =>
        at === index ? { ...member, ...patch } : member,
      ),
    });
  };
  const moveMember = (from: number, to: number) => {
    if (!draft || to < 0 || to >= draft.members.length) return;
    const next = [...draft.members];
    const [picked] = next.splice(from, 1);
    if (!picked) return;
    next.splice(to, 0, picked);
    setDraft({ ...draft, members: next });
  };
  return (
    <section className="model-access-routes" aria-label="路由组">
      <div className="model-access-heading">
        <div className="model-access-heading-info">
          <div className="model-access-heading-title-row">
            <h4>路由组</h4>
            <span className="provider-configured-count">{groups.length}</span>
          </div>
          <p className="model-access-heading-sub">
            将多个来源与模型组合为虚拟路由池，按顺序容灾、轮询均衡或智能策略自动调度。
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus size={14} />}
          disabled={!sources.length}
          title={sources.length ? undefined : "请先添加至少一个模型来源"}
          onClick={add}
        >
          添加路由组
        </Button>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          variant="inline"
          title="尚无路由组"
          description={
            sources.length
              ? "添加路由组后，可在工作台模型选择器中直接选用虚拟路由池，实现跨来源自动故障转移与分流。"
              : "路由组由多个模型来源组成，请先添加至少一个模型来源。"
          }
        />
      ) : (
        <ul className="model-access-route-list">
          {groups.map((group) => {
            const strategyMeta =
              ROUTE_STRATEGY_META[group.strategy] ?? ROUTE_STRATEGY_META.order;
            return (
              <li className="model-access-route-card" key={group.id}>
                <div className="model-access-route-head">
                  <div className="model-access-route-main">
                    <span
                      className="provider-model-dot is-custom"
                      aria-hidden="true"
                    />
                    <strong>{group.label}</strong>
                    <Tag tone="accent" title={strategyMeta.desc}>
                      {strategyMeta.badge} · {group.strategy}
                    </Tag>
                    {group.sticky && <Tag tone="success">黏性</Tag>}
                    <span className="model-access-status">
                      {group.members.length} 个成员
                    </span>
                  </div>
                  <div className="model-access-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => edit(group)}
                    >
                      编辑路由组
                    </Button>
                    {confirming === group.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="danger"
                          loading={busy}
                          onClick={() => void remove(group.id)}
                        >
                          确认删除路由组
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirming("")}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirming(group.id)}
                      >
                        删除路由组
                      </Button>
                    )}
                  </div>
                </div>
                <div className="model-access-route-members">
                  {group.members.map((member, index) => {
                    const source = sources.find(
                      (item) => item.id === member.sourceId,
                    );
                    const credential =
                      source?.credentials?.find(
                        (item) => item.id === member.credentialId,
                      ) ?? source?.credentials?.[0];
                    const isDisabled = member.enabled === false;
                    return (
                      <span
                        className={`model-access-route-hop${isDisabled ? " is-disabled" : ""}`}
                        key={`${member.sourceId}:${member.model}:${index}`}
                      >
                        <em className="model-access-route-hop-index">
                          #{index + 1}
                        </em>
                        <span className="model-access-route-hop-target">
                          {source?.label ?? member.sourceId} / {member.model}
                          {credential ? ` / ${credential.label}` : ""}
                        </span>
                        {isDisabled && (
                          <small className="model-access-route-hop-badge">
                            已停用
                          </small>
                        )}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && !draft && (
        <span className="model-access-status is-error" role="alert">
          {error}
        </span>
      )}
      {draft && (
        <Dialog
          title={
            groups.some((group) => group.id === draft.id)
              ? "编辑路由组"
              : "添加路由组"
          }
          onClose={() => !busy && setDraft(null)}
          dismissible={!busy}
        >
          <div className="provider-editor modal-content model-access-route-editor">
            <div className="model-access-route-basic-grid">
              <Field id="model-access-route-label" label="名称">
                <Input
                  id="model-access-route-label"
                  value={draft.label}
                  placeholder="例如：主力编程路由 / 高可用容灾池"
                  onChange={(event) =>
                    setDraft({ ...draft, label: event.target.value })
                  }
                />
              </Field>
              <Field id="model-access-route-strategy" label="策略">
                <Select
                  id="model-access-route-strategy"
                  value={draft.strategy}
                  options={[
                    { value: "order", label: "顺序优先 (order)" },
                    { value: "rotate", label: "轮换均衡 (rotate)" },
                    { value: "usage", label: "用量优先 (usage)" },
                    { value: "smart", label: "智能择优 (smart)" },
                    { value: "pace", label: "节流控制 (pace)" },
                  ]}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      strategy: value as RouteGroup["strategy"],
                    })
                  }
                />
              </Field>
            </div>
            <div className="model-access-route-strategy-bar">
              <span className="model-access-route-strategy-desc">
                {
                  (
                    ROUTE_STRATEGY_META[draft.strategy] ??
                    ROUTE_STRATEGY_META.order
                  ).desc
                }
              </span>
              <label className="model-access-check model-access-route-sticky">
                <Checkbox
                  checked={draft.sticky === true}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, sticky: checked })
                  }
                />
                <span>黏性会话（优先沿用上次成功节点）</span>
              </label>
            </div>
            <div className="model-access-rows model-access-route-members-editor">
              <div className="model-access-route-members-head">
                <span className="model-access-route-members-title">
                  路由成员节点（共 {draft.members.length} 个）
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      members: [
                        ...draft.members,
                        { sourceId: "", model: "", enabled: true },
                      ],
                    })
                  }
                >
                  添加成员
                </Button>
              </div>
              {draft.members.map((member, index) => {
                const source = sources.find(
                  (item) => item.id === member.sourceId,
                );
                const models = catalogs[member.sourceId] ?? [];
                const listId = `route-models-${draft.id}-${index}`;
                return (
                  <div
                    className={`model-access-route-member${member.enabled === false ? " is-disabled" : ""}`}
                    key={`${member.sourceId}-${index}`}
                  >
                    <div className="model-access-route-member-head">
                      <span className="model-access-route-member-index">
                        节点 #{index + 1}
                      </span>
                      <div className="model-access-route-member-tools">
                        {draft.members.length > 1 && (
                          <div className="model-param-quick-links">
                            <button
                              type="button"
                              className="model-param-link-btn"
                              disabled={index === 0}
                              onClick={() => moveMember(index, index - 1)}
                            >
                              上移
                            </button>
                            <button
                              type="button"
                              className="model-param-link-btn"
                              disabled={index === draft.members.length - 1}
                              onClick={() => moveMember(index, index + 1)}
                            >
                              下移
                            </button>
                          </div>
                        )}
                        <label className="model-access-check">
                          <Checkbox
                            checked={member.enabled !== false}
                            aria-label="启用路由成员"
                            onCheckedChange={(checked) =>
                              patchMember(index, {
                                enabled: checked,
                              })
                            }
                          />
                          启用
                        </label>
                        <IconButton
                          label="删除路由成员"
                          icon={<Trash size={14} aria-hidden="true" />}
                          disabled={draft.members.length <= 1}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              members: draft.members.filter(
                                (_, at) => at !== index,
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="model-access-route-member-fields">
                      <Field id={`route-source-${index}`} label="来源">
                        <Select
                          id={`route-source-${index}`}
                          aria-label="路由成员来源"
                          value={member.sourceId}
                          options={[
                            { value: "", label: "选择来源" },
                            ...sources.map((item) => ({
                              value: item.id,
                              label: item.label,
                            })),
                          ]}
                          onValueChange={(value) =>
                            patchMember(index, {
                              sourceId: value,
                              model: "",
                              credentialId: undefined,
                            })
                          }
                        />
                      </Field>
                      <Field id={`route-model-${index}`} label="模型">
                        <Input
                          id={`route-model-${index}`}
                          aria-label="路由成员模型"
                          list={listId}
                          value={member.model}
                          placeholder="模型 ID"
                          onChange={(event) =>
                            patchMember(index, { model: event.target.value })
                          }
                        />
                        <datalist id={listId}>
                          {models.map((entry) => (
                            <option key={entry.id} value={entry.id} />
                          ))}
                          {source?.model && <option value={source.model} />}
                        </datalist>
                      </Field>
                      <Field id={`route-credential-${index}`} label="凭据">
                        <Select
                          id={`route-credential-${index}`}
                          aria-label="路由成员凭据"
                          value={member.credentialId ?? ""}
                          options={[
                            { value: "", label: "默认凭据" },
                            ...(source?.credentials ?? []).map(
                              (credential) => ({
                                value: credential.id,
                                label: credential.label,
                              }),
                            ),
                          ]}
                          onValueChange={(value) =>
                            patchMember(index, {
                              credentialId: value || undefined,
                            })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
            {error && (
              <span className="model-access-status is-error" role="alert">
                {error}
              </span>
            )}
            <div className="provider-actions">
              <Button
                size="sm"
                icon={<FloppyDisk size={15} />}
                loading={busy}
                onClick={() => void save()}
              >
                保存路由组
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                取消
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
