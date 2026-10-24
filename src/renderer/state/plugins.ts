import {
  type BrowserPluginConfig,
  type PluginConfigureInput,
  type PluginHealth,
  type PluginRecord,
  browserPluginConfigSchema,
  pluginConfigureInputSchema,
  pluginHealthSchema,
  pluginRecordSchema,
} from "@forge/core/shared/plugins";

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
        description: "访问网络；按 allowedDomains 限制主机，显式填写 * 则允许全部网站。",
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
