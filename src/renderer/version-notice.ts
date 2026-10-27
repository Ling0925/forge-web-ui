/** Build differences are diagnostics, not proof of an incompatible protocol.
 * Never stop a connection or replay an RPC because versions differ. */
export function versionNotice(headers: Pick<Headers, "get">, clientBuildId?: string | null): string {
  const running = headers.get("X-Forge-Core-Build");
  const disk = headers.get("X-Forge-Core-Disk-Build");
  const known = (id: string | null | undefined): id is string => !!id && id !== "unknown" && /^[A-Za-z0-9._-]{1,64}$/.test(id);
  if (known(running) && known(disk) && running !== disk && headers.get("X-Forge-Core-Restart-Required") === "true")
    return "Core 新构建尚未生效。请等待运行任务结束后重启 Core，再刷新页面；不会自动重启或重放任务。";
  if (known(running) && known(clientBuildId) && running !== clientBuildId)
    return "Web 与 Core 构建不同（不一定不兼容）。若功能异常，请在任务结束后确认 Core 已更新，再刷新或重新构建 Web。";
  return ""; // Old/source-mode hosts may have no comparable build evidence.
}
