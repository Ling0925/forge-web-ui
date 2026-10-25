import {
  type BrowserPluginConfig,
  type OfficeCliPluginConfig,
  type PluginConfigureInput,
  type PluginHealth,
  type PluginRecord,
  browserPluginConfigSchema,
  officecliPluginConfigSchema,
  pluginConfigureInputSchema,
  pluginHealthSchema,
  pluginRecordSchema,
} from "@forge/core/shared/plugins";

/** Core manifest ids for the two officially supported visual editors. */
export const BROWSER_PLUGIN_ID = "browser";
export const OFFICECLI_PLUGIN_ID = "officecli";

/** The bridge contract is required, but older hosts may still lack it at runtime. */
export function pluginBridge() {
  if (typeof window === "undefined") return undefined;
  const forge = window.forge;
  if (
    typeof forge?.listPlugins !== "function" ||
    typeof forge.configurePlugin !== "function" ||
    typeof forge.checkPlugin !== "function"
  )
    return undefined;
  return forge;
}

export function pluginManagementAvailable(): boolean {
  return pluginBridge() !== undefined;
}

export async function listPlugins(): Promise<readonly PluginRecord[]> {
  const bridge = pluginBridge();
  if (!bridge)
    throw new Error("当前宿主不支持插件管理，请更新并重启 Forge Core。");
  return pluginRecordSchema.array().parse(await bridge.listPlugins());
}

export async function configurePlugin(
  input: PluginConfigureInput,
): Promise<PluginRecord> {
  const bridge = pluginBridge();
  if (!bridge)
    throw new Error("当前宿主不支持插件管理，请更新并重启 Forge Core。");
  return pluginRecordSchema.parse(
    await bridge.configurePlugin(pluginConfigureInputSchema.parse(input)),
  );
}

export async function checkPlugin(pluginId: string): Promise<PluginHealth> {
  const bridge = pluginBridge();
  if (!bridge)
    throw new Error("当前宿主不支持插件管理，请更新并重启 Forge Core。");
  return pluginHealthSchema.parse(await bridge.checkPlugin(pluginId));
}

export interface PluginConfigDraft {
  readonly executablePath: string;
  readonly browserExecutablePath: string;
  /** Newline/comma separated hostnames, one allowlist entry per token. */
  readonly allowedDomains: string;
}

export function browserConfigDraft(config: unknown): {
  readonly draft: PluginConfigDraft;
  readonly error: string;
} {
  const parsed = browserPluginConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      draft: {
        executablePath: "agent-browser",
        browserExecutablePath: "",
        allowedDomains: "",
      },
      error:
        "Core 返回的浏览器配置无法解析；保存前请按 schema 重新填写，当前值不会被静默覆盖。",
    };
  }
  return {
    draft: {
      executablePath: parsed.data.executablePath,
      browserExecutablePath: parsed.data.browserExecutablePath,
      allowedDomains: parsed.data.allowedDomains.join("\n"),
    },
    error: "",
  };
}

export function parseAllowedDomains(text: string): readonly string[] {
  return [
    ...new Set(
      text
        .split(/[\s,，]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function browserConfigFromDraft(draft: PluginConfigDraft): {
  readonly config: BrowserPluginConfig;
  readonly error: string;
} {
  const parsed = browserPluginConfigSchema.safeParse({
    executablePath: draft.executablePath.trim(),
    browserExecutablePath: draft.browserExecutablePath.trim(),
    allowedDomains: parseAllowedDomains(draft.allowedDomains),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".");
    return {
      config: {
        executablePath: "agent-browser",
        browserExecutablePath: "",
        allowedDomains: [],
      },
      error: field
        ? `配置未通过 Core schema 校验（${field}）：${parsed.error.issues[0]?.message ?? "格式无效"}`
        : `配置未通过 Core schema 校验：${parsed.error.issues[0]?.message ?? "格式无效"}`,
    };
  }
  return { config: parsed.data, error: "" };
}

export function configDraftDirty(
  draft: PluginConfigDraft,
  stored: unknown,
): boolean {
  const parsed = browserPluginConfigSchema.safeParse(stored);
  if (!parsed.success) return true;
  const current = browserConfigFromDraft(draft);
  if (current.error) return true;
  return (
    current.config.executablePath !== parsed.data.executablePath ||
    current.config.browserExecutablePath !==
      parsed.data.browserExecutablePath ||
    current.config.allowedDomains.join("\n") !==
      parsed.data.allowedDomains.join("\n")
  );
}

/**
 * Bounds are mirrored from `officecliPluginConfigSchema` so the number input
 * offers a sane range; a test asserts the schema agrees with these values.
 * Seconds may carry up to three decimals, because Core stores integer
 * milliseconds: whole-second limits would silently rewrite e.g. 1501 ms.
 */
export const OFFICECLI_TIMEOUT_SECONDS = {
  min: 1,
  max: 300,
  step: 0.001,
  decimals: 3,
} as const;

const defaultOfficeCliConfig = officecliPluginConfigSchema.parse({});

/** Exact display: `120` for whole seconds, otherwise at most three decimals. */
function timeoutSeconds(ms: number): string {
  if (ms % 1000 === 0) return String(ms / 1000);
  return (ms / 1000)
    .toFixed(OFFICECLI_TIMEOUT_SECONDS.decimals)
    .replace(/0+$/, "");
}

/**
 * Parse seconds without floating-point rounding. Decimal precision beyond
 * milliseconds is rejected instead of silently changed, and an empty or
 * non-numeric field stays invalid rather than falling back to the default.
 */
export function parseOfficeCliTimeoutSeconds(text: string): {
  readonly timeoutMs?: number;
  readonly error: string;
} {
  const value = text.trim();
  if (value === "") return { error: "请填写超时秒数。" };
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) {
    return {
      error: `超时需为秒数，最多 ${OFFICECLI_TIMEOUT_SECONDS.decimals} 位小数（精确到毫秒）。`,
    };
  }
  const fraction = (match[2] ?? "").padEnd(
    OFFICECLI_TIMEOUT_SECONDS.decimals,
    "0",
  );
  const timeoutMs = Number(match[1]) * 1000 + Number(fraction);
  if (
    timeoutMs < OFFICECLI_TIMEOUT_SECONDS.min * 1000 ||
    timeoutMs > OFFICECLI_TIMEOUT_SECONDS.max * 1000
  )
    return {
      error: `超时需在 ${OFFICECLI_TIMEOUT_SECONDS.min}–${OFFICECLI_TIMEOUT_SECONDS.max} 秒之间。`,
    };
  return { timeoutMs, error: "" };
}

export interface OfficeCliConfigDraft {
  readonly executablePath: string;
  /** Seconds with up to three decimals; stored by Core as integer `timeoutMs`. */
  readonly timeoutSeconds: string;
}

export function officeCliConfigDraft(config: unknown): {
  readonly draft: OfficeCliConfigDraft;
  readonly error: string;
} {
  const parsed = officecliPluginConfigSchema.safeParse(config);
  if (!parsed.success) {
    return {
      draft: {
        executablePath: defaultOfficeCliConfig.executablePath,
        timeoutSeconds: timeoutSeconds(defaultOfficeCliConfig.timeoutMs),
      },
      error:
        "Core 返回的 OfficeCLI 配置无法解析；保存前请按 schema 重新填写，当前值不会被静默覆盖。",
    };
  }
  return {
    draft: {
      executablePath: parsed.data.executablePath,
      timeoutSeconds: timeoutSeconds(parsed.data.timeoutMs),
    },
    error: "",
  };
}

export function officeCliConfigFromDraft(draft: OfficeCliConfigDraft): {
  readonly config: OfficeCliPluginConfig;
  readonly error: string;
} {
  const timeout = parseOfficeCliTimeoutSeconds(draft.timeoutSeconds);
  if (timeout.error)
    return {
      config: defaultOfficeCliConfig,
      error: `配置未通过 Core schema 校验（timeoutMs）：${timeout.error}`,
    };
  const parsed = officecliPluginConfigSchema.safeParse({
    executablePath: draft.executablePath.trim(),
    timeoutMs: timeout.timeoutMs,
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".");
    return {
      config: defaultOfficeCliConfig,
      error: field
        ? `配置未通过 Core schema 校验（${field}）：${parsed.error.issues[0]?.message ?? "格式无效"}`
        : `配置未通过 Core schema 校验：${parsed.error.issues[0]?.message ?? "格式无效"}`,
    };
  }
  return { config: parsed.data, error: "" };
}

export function officeCliConfigDraftDirty(
  draft: OfficeCliConfigDraft,
  stored: unknown,
): boolean {
  const parsed = officecliPluginConfigSchema.safeParse(stored);
  if (!parsed.success) return true;
  const current = officeCliConfigFromDraft(draft);
  if (current.error) return true;
  return (
    current.config.executablePath !== parsed.data.executablePath ||
    current.config.timeoutMs !== parsed.data.timeoutMs
  );
}

/**
 * Drafts exist only for plugins with a dedicated editor. Unknown plugins keep
 * their Core config untouched and never show a false "unsaved" badge.
 */
export function pluginDraftFor(
  id: string,
  config: unknown,
): OfficeCliConfigDraft | PluginConfigDraft | undefined {
  if (id === BROWSER_PLUGIN_ID) return browserConfigDraft(config).draft;
  if (id === OFFICECLI_PLUGIN_ID) return officeCliConfigDraft(config).draft;
  return undefined;
}

export function pluginDraftDirty(
  id: string,
  draft: OfficeCliConfigDraft | PluginConfigDraft,
  stored: unknown,
): boolean {
  if (id === OFFICECLI_PLUGIN_ID) {
    if (!("timeoutSeconds" in draft)) return true;
    return officeCliConfigDraftDirty(draft, stored);
  }
  if (id === BROWSER_PLUGIN_ID) {
    if (!("allowedDomains" in draft)) return true;
    return configDraftDirty(draft, stored);
  }
  return false;
}

export function pluginStatusLabel(record: PluginRecord): string {
  if (!record.enabled) return "已禁用";
  if (record.status === "running")
    return `运行中 · ${record.activeSessions} 个活动会话`;
  // `configured` only means a valid stored entry; the host has not checked
  // agent-browser or Chrome. Never present it as ready.
  return "已配置 · 未检查";
}

export function pluginCapabilityLabel(capability: string): {
  readonly label: string;
  readonly description: string;
} {
  switch (capability) {
    case "tools":
      return { label: "工具", description: "向运行注册新的工具调用。" };
    case "instructions":
      return { label: "运行指令", description: "向运行注入插件提供的指令。" };
    case "browser":
      return { label: "浏览器", description: "使用隔离的浏览器会话。" };
    case "network":
      return {
        label: "网络",
        description:
          "访问网络；按 allowedDomains 限制主机，显式填写 * 则允许全部网站。",
      };
    case "process":
      return {
        label: "本机进程",
        description: "启动本机进程；不是 OS 沙箱。",
      };
    default:
      return { label: capability, description: "主机声明的能力。" };
  }
}

export interface ConfigSchemaProperty {
  readonly name: string;
  readonly type?: string;
  readonly description?: string;
}

/** Read-only projection of the Core-returned JSON schema for display. */
export function configSchemaProperties(
  schema: Readonly<Record<string, unknown>>,
): readonly ConfigSchemaProperty[] {
  const properties = schema.properties;
  if (
    !properties ||
    typeof properties !== "object" ||
    Array.isArray(properties)
  )
    return [];
  return Object.entries(properties as Record<string, unknown>).map(
    ([name, value]) => {
      const descriptor =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const type =
        typeof descriptor.type === "string" ? descriptor.type : undefined;
      const description =
        typeof descriptor.description === "string"
          ? descriptor.description
          : undefined;
      return {
        name,
        ...(type ? { type } : {}),
        ...(description ? { description } : {}),
      };
    },
  );
}
