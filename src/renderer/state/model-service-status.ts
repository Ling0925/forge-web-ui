import type { PublicSettings } from "@forge/core/shared/schemas";

/** Service setup is not default-model readiness or a network health check.
 * A source can intentionally have no default model: sessions bind their own. */
export function modelServiceStatus(
  settings: PublicSettings | null | undefined,
) {
  if (!settings) {
    return {
      state: "loading" as const,
      label: "正在加载配置",
      hint: "正在读取模型服务配置，尚未判断连接状态。",
    };
  }
  const added =
    settings.isConfigured ||
    Boolean(settings.baseUrl?.trim()) ||
    settings.providerSources?.some((source) => Boolean(source.baseUrl.trim()));
  return added
    ? {
        state: "configured" as const,
        label: "模型服务已添加",
        hint: "已保存模型服务；在输入框中选择模型。此处不是网络连接状态，连接情况以实际请求为准。",
      }
    : {
        state: "missing" as const,
        label: "添加模型服务",
        hint: "尚未添加模型服务，打开设置添加 API 端点与模型。",
      };
}
