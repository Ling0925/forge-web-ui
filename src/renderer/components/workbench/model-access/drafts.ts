import type { ModelAccessResult } from "@forge/core/shared/model-access";
import type { ModelCatalog } from "@forge/core/shared/model-catalog";
import type { PublicProviderSource } from "@forge/core/shared/schemas";
import { cleanModelOverrides } from "./model-overrides";

export type ProviderProtocol = NonNullable<PublicProviderSource["apiMode"]>;
export type AccountQuota = Extract<
  ModelAccessResult,
  { type: "quota" }
>["quota"];
type ModelSelectionSource = NonNullable<PublicProviderSource["modelSelection"]>;

export type EditableCredential = Readonly<{
  id: string;
  label: string;
  enabled: boolean;
  type: "api-key" | "account";
  apiKey: string;
  clearKey: boolean;
  status: string;
  platform?: string | undefined;
  expiresAt?: number | undefined;
  protocol?: ProviderProtocol | undefined;
}>;

export type EditableHeader = Readonly<{
  id: string;
  name: string;
  value: string;
  stored: boolean;
}>;

export type ConnectionDraft = Readonly<{
  authEditing: boolean;
  authType: "auto" | "bearer" | "api-key" | "header" | "none";
  authHeader: string;
  authPrefix: string;
  headersEditing: boolean;
  headersDirty: boolean;
  headers: readonly EditableHeader[];
  extraBodyEditing: boolean;
  extraBodyText: string;
  hasExtraBody: boolean;
  vertexEditing: boolean;
  vertexText: string;
  hasVertex: boolean;
  proxyEditing: boolean;
  proxyUrl: string;
}>;

export type EditableModelSelection = Readonly<{
  mode: "all" | "selected" | "none";
  models: readonly string[];
  manual: ModelCatalog;
  overrides: ModelSelectionSource["overrides"];
}>;

export type EditableAlias = Readonly<{
  id: string;
  alias: string;
  model: string;
}>;

export type AccessDraft = Readonly<{
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiMode: ProviderProtocol;
  preset: string;
  region: string;
  endpoints: Readonly<Partial<Record<ProviderProtocol, string | undefined>>>;
  modelSelection: EditableModelSelection;
  aliases: readonly EditableAlias[];
  credentialRouting:
    | "order"
    | "rotate"
    | "usage"
    | "smart"
    | "pace"
    | undefined;
  sticky: boolean;
  activeCredentialId: string | undefined;
  credentials: readonly EditableCredential[];
  connection: ConnectionDraft;
  revision: number | undefined;
}>;

export type CatalogTestState = Readonly<{
  kind: "catalog" | "inference";
  status: "running" | "ok" | "error" | "cancelled";
  latencyMs?: number | undefined;
  model?: string | undefined;
  error?: string | undefined;
}>;

export const protocolOptions = [
  { value: "chat-completions", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
  { value: "anthropic", label: "Anthropic Messages" },
  { value: "gemini", label: "Gemini" },
] as const;

const credentialStatus: Readonly<Record<string, string>> = {
  ready: "可用",
  disabled: "已停用",
  "signed-out": "未登录",
  expired: "已过期",
};

export const protocolLabel = (protocol: string | undefined) =>
  protocolOptions.find(
    (entry) => entry.value === (protocol ?? "chat-completions"),
  )?.label ??
  protocol ??
  "Chat Completions";

export const statusLabel = (value: string) => credentialStatus[value] ?? value;
export const randomId = (prefix: string) =>
  `${prefix}-${Array.from(crypto.getRandomValues(new Uint32Array(3)), (n) => n.toString(36)).join("")}`;

export function credentialRows(
  source: PublicProviderSource | undefined,
): readonly EditableCredential[] {
  if (source?.credentials?.length)
    return source.credentials.map((item) => ({
      id: item.id,
      label: item.label,
      enabled: item.enabled,
      type: item.type,
      apiKey: "",
      clearKey: false,
      status: item.status,
      ...(item.platform ? { platform: item.platform } : {}),
      ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
      ...(item.protocol ? { protocol: item.protocol } : {}),
    }));
  return [
    {
      id: "default",
      label: "默认",
      enabled: true,
      type: "api-key",
      apiKey: "",
      clearKey: false,
      status: "ready",
    },
  ];
}

export function freshCredentials(): readonly EditableCredential[] {
  return [
    {
      id: "default",
      label: "默认",
      enabled: true,
      type: "api-key",
      apiKey: "",
      clearKey: false,
      status: "ready",
    },
  ];
}

export function connectionDraft(
  source?: PublicProviderSource,
): ConnectionDraft {
  return {
    authEditing: false,
    authType: source?.connection?.auth?.type ?? "auto",
    authHeader: source?.connection?.auth?.header ?? "",
    authPrefix: "",
    headersEditing: false,
    headersDirty: false,
    headers: (source?.connection?.headerNames ?? []).map((name) => ({
      id: randomId("header"),
      name,
      value: "",
      stored: true,
    })),
    extraBodyEditing: false,
    extraBodyText: "",
    hasExtraBody: source?.connection?.hasExtraBody === true,
    vertexEditing: false,
    vertexText: "",
    hasVertex: source?.connection?.hasVertex === true,
    proxyEditing: false,
    proxyUrl: "",
  };
}

export function selectionDraft(
  source?: PublicProviderSource,
): EditableModelSelection {
  return {
    mode: source?.modelSelection?.mode ?? "all",
    models: source?.modelSelection?.models ?? [],
    manual: source?.modelSelection?.manual ?? [],
    overrides: source?.modelSelection?.overrides,
  };
}

export function aliasDraft(
  source?: PublicProviderSource,
): readonly EditableAlias[] {
  return Object.entries(source?.modelAliases ?? {}).map(([alias, model]) => ({
    id: randomId("alias"),
    alias,
    model,
  }));
}

export function freshAccessDraft(id: string): AccessDraft {
  return {
    id,
    label: "",
    baseUrl: "",
    model: "",
    apiMode: "chat-completions",
    preset: "",
    region: "",
    endpoints: {},
    modelSelection: {
      mode: "all",
      models: [],
      manual: [],
      overrides: undefined,
    },
    aliases: [],
    credentialRouting: undefined,
    sticky: false,
    activeCredentialId: "default",
    credentials: freshCredentials(),
    connection: connectionDraft(),
    revision: undefined,
  };
}

export function accessDraft(source: PublicProviderSource): AccessDraft {
  return {
    id: source.id,
    label: source.label,
    baseUrl: source.baseUrl,
    model: source.model,
    apiMode: source.apiMode ?? "chat-completions",
    preset: source.preset ?? "",
    region: "",
    endpoints: source.endpoints ?? {},
    modelSelection: selectionDraft(source),
    aliases: aliasDraft(source),
    credentialRouting: source.credentialRouting,
    sticky: source.sticky === true,
    activeCredentialId:
      source.activeCredentialId ?? source.credentials?.[0]?.id ?? "default",
    credentials: credentialRows(source),
    connection: connectionDraft(source),
    revision: source.revision,
  };
}

export function modelSelectionObject(selection: EditableModelSelection) {
  const cleanedOverrides = cleanModelOverrides(selection.overrides);
  return {
    mode: selection.mode,
    // Keep explicit IDs when changing visibility; disabling a source is not
    // deleting its model configuration.
    ...(selection.mode === "selected" || selection.models.length
      ? { models: [...selection.models] }
      : {}),
    ...(selection.manual.length ? { manual: [...selection.manual] } : {}),
    ...(cleanedOverrides ? { overrides: cleanedOverrides } : {}),
  };
}

export function aliasesObject(
  rows: readonly EditableAlias[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const alias = row.alias.trim();
    const model = row.model.trim();
    if (alias && model) out[alias] = model;
  }
  return out;
}

export function endpointProblem(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "请填写 API 基础地址。";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "API 地址必须是完整的 http(s) URL。";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return "API 地址只支持 http 或 https。";
  if (url.username || url.password) return "API 地址不能包含用户名或密码。";
  if (url.search || url.hash) return "API 地址不能包含查询参数或锚点。";
  return "";
}

export function describedFailure(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "操作失败，未自动重试。";
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return "未知";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${Number((value / 1_000).toFixed(1))}K`;
  return String(value);
}
