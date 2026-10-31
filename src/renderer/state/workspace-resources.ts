/**
 * 工作区文件与项目资源已从会话详情移出，改为独立的「工作区」对话框。
 * 侧栏的工作区行和会话详情底部的入口通过这个轻量事件打开它，
 * 避免在 App / Sidebar / Inspector 之间层层传递回调。
 */
export type WorkspaceResourcesTab = "files" | "resources";

const OPEN_EVENT = "forge:open-workspace-resources";

export function openWorkspaceResources(tab: WorkspaceResourcesTab): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkspaceResourcesTab>(OPEN_EVENT, { detail: tab }),
  );
}

export function subscribeWorkspaceResources(
  listener: (tab: WorkspaceResourcesTab) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => {
    const tab = (event as CustomEvent<WorkspaceResourcesTab>).detail;
    listener(tab === "resources" ? "resources" : "files");
  };
  window.addEventListener(OPEN_EVENT, handle);
  return () => window.removeEventListener(OPEN_EVENT, handle);
}
