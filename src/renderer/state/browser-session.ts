import {
  type BrowserCommand,
  type BrowserCommandResult,
  type BrowserRequest,
  type BrowserResponse,
  browserImageSchema,
  browserRequestSchema,
  browserResponseSchema,
} from "@forge/core/shared/plugins";

/** Human browser RPC is only present on hosts that expose the plugin bridge. */
export function browserPanelAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.forge?.browser === "function";
}

/**
 * Human browser control is only possible while a Core-owned session browser
 * exists. The UI never starts one: only the agent's first browser tool call
 * inside an active run makes `available` true, and the run closing the scope
 * makes it false again. Every read is therefore an explicit probe.
 */
export async function requestBrowser(
  input: BrowserRequest,
): Promise<BrowserResponse> {
  if (!browserPanelAvailable())
    throw new Error(
      "当前客户端连接的 Core 未提供浏览器 RPC；浏览器状态只存在于已连接的 Core。",
    );
  const parsed = browserRequestSchema.parse(input);
  return browserResponseSchema.parse(await window.forge.browser(parsed));
}

export function readBrowserStatus(sessionId: string): Promise<BrowserResponse> {
  return requestBrowser({
    sessionId: sessionId as BrowserRequest["sessionId"],
    action: "status",
  });
}

export function setBrowserTakeover(
  sessionId: string,
  enabled: boolean,
): Promise<BrowserResponse> {
  return requestBrowser({
    sessionId: sessionId as BrowserRequest["sessionId"],
    action: "takeover",
    enabled,
  });
}

export function executeBrowserCommand(
  sessionId: string,
  command: BrowserCommand,
): Promise<BrowserResponse> {
  return requestBrowser({
    sessionId: sessionId as BrowserRequest["sessionId"],
    action: "execute",
    command,
  });
}

/** Only screenshot is permitted before takeover; every other execute needs it. */
export function browserCommandNeedsTakeover(command: BrowserCommand): boolean {
  return command.action !== "screenshot";
}

/** True for commands that change page state and invalidate older @refs. */
export function browserCommandMutatesPage(command: BrowserCommand): boolean {
  return ["navigate", "click", "fill", "press", "scroll"].includes(
    command.action,
  );
}

/** Validate again before trusting bytes from the bridge with the DOM. */
export function browserImageDataUrl(
  image: BrowserCommandResult["image"] | undefined,
): string | undefined {
  if (!image) return undefined;
  const parsed = browserImageSchema.safeParse(image);
  if (!parsed.success) return undefined;
  return `data:${parsed.data.mimeType};base64,${parsed.data.data}`;
}

export interface BrowserResultView {
  readonly text: string;
  readonly isError: boolean;
  /** Transient view state only; never logged, persisted or placed in a URL. */
  readonly image: BrowserCommandResult["image"] | undefined;
}

export function browserResultView(
  response: BrowserResponse | undefined,
): BrowserResultView | undefined {
  const result = response?.result;
  if (!result) return undefined;
  return {
    text: result.text,
    isError: result.isError,
    image: result.image
      ? { mimeType: result.image.mimeType, data: result.image.data }
      : undefined,
  };
}

/** Accessibility refs a fresh snapshot exposes: `@e12` and `[ref=e12]`. */
export function browserSnapshotRefs(text: string): readonly string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/@(e\d+)|\[ref=(e\d+)\]/g)) {
    const value = match[1] ?? match[2];
    if (value) refs.add(`@${value}`);
  }
  return [...refs];
}

export function browserPermissionNotice(
  permission: "readonly" | "workspace" | "unrestricted" | undefined,
): string {
  switch (permission) {
    case "readonly":
      return "当前运行是只读模式：导航、快照、截图等浏览器动作都会被 Core 拒绝。仍可归还控制权，释放被阻塞的 Agent 队列。";
    case "workspace":
      return "人工接管不绕过审批：工作区模式下 Agent 的浏览器动作仍逐次审批；人工动作由你的点击授权，仍受当前权限与允许域名限制。";
    case "unrestricted":
      return "无限制模式仍受域名允许列表限制，并保留接管串行化；它不是 OS 沙箱，页面脚本可能有远程副作用。";
    default:
      return "浏览器动作遵循当前运行权限与审批；模式降为只读或运行取消后，动作会被拒绝。";
  }
}
