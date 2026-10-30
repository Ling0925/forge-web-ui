import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";

// Requires a built UI and Core. Real RPC errors and coordination identities must
// not be replaced by optimistic client mocks. No real user settings or providers.
it("persists role edits and renders real advisor requests, replies and reloads", async () => {
  const base = resolve("../../.forge/tmp/agent-collaboration-browser");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "case-"));
  let core: ReturnType<typeof launch> | undefined;
  let browser: Browser | undefined;
  try {
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    core = launch([resolve("tests/fixtures/agent-collaboration-process.mjs"), directory, String(port)], directory, origin, "state");
    let childTurns = 0;
    core.child.on("message", (message: { childTurns?: number }) => { childTurns = message.childTurns ?? childTurns; });
    await core.ready();
    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    await page.keyboard.press("Control+,");
    await page.getByRole("button", { name: "智能体", exact: true }).click();
    const templateTrigger = page.getByRole("button", { name: "从模板添加", exact: true });
    await templateTrigger.click();
    await page.getByRole("menu").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("menu").waitFor({ state: "hidden" });
    expect(await templateTrigger.evaluate(element => element === document.activeElement)).toBe(true);
    await page.getByRole("region", { name: "智能体角色配置", exact: true }).waitFor();
    await page.getByRole("button", { name: "新建智能体", exact: true }).click();
    const permissionPicker = page.getByRole("combobox", { name: "权限上限选择", exact: true });
    expect(await permissionPicker.textContent()).toContain("继承主会话权限");
    await page.getByLabel("智能体 ID", { exact: true }).fill("ui-integration");
    await page.getByLabel("智能体名称", { exact: true }).fill("  界面创建角色  ");
    for (const navigate of [
      () => page.getByRole("button", { name: "外观", exact: true }).click(),
      () => page.getByLabel("搜索设置", { exact: true }).fill("外观"),
      () => page.getByRole("button", { name: "返回工作台", exact: true }).click(),
    ]) {
      let prompted = false;
      page.once("dialog", async dialog => { prompted = true; await dialog.dismiss(); });
      await navigate();
      expect(prompted).toBe(true);
      expect(await page.getByLabel("智能体名称", { exact: true }).inputValue()).toBe("  界面创建角色  ");
    }
    // Choose a saved model without entering its ID; persist the source/model pair via real Core.
    await page.getByRole("combobox", { name: "模型模式选择", exact: true }).click();
    await page.getByRole("option", { name: /固定绑定模型/ }).click();
    const modelPicker = page.getByRole("combobox", { name: "智能体模型", exact: true });
    await modelPicker.click();
    await page.getByRole("option", { name: "fixture/alternate", exact: true }).click();
    expect(await page.getByLabel("精确模型 ID", { exact: true }).count()).toBe(0);
    const sourceBeforeSave = await page.evaluate(async () => {
      const settings = await window.forge.getSettings();
      return { sourceId: settings.activeSourceId, sourceModel: settings.model };
    });
    const save = () => page.getByRole("button", { name: "保存智能体角色", exact: true }).click();
    await save();
    await page.getByText("智能体保存成功。配置仅影响后续派发的子任务。", { exact: true }).waitFor();
    expect(await page.getByLabel("智能体名称", { exact: true }).inputValue()).toBe("界面创建角色");
    expect(await page.locator(".agent-draft-badge").count()).toBe(0);
    const settingsAfterSave = await page.evaluate(() => window.forge.getSettings());
    expect(settingsAfterSave.agentProfiles!.find(p => p.id === "ui-integration")?.model).toEqual({
      mode: "fixed", providerSourceId: sourceBeforeSave.sourceId, model: "fixture/alternate",
    });
    expect(settingsAfterSave.agentProfiles!.find(p => p.id === "ui-integration")?.permission).toBe("unrestricted");
    expect(settingsAfterSave.model).toBe(sourceBeforeSave.sourceModel);
    expect(settingsAfterSave.activeSourceId).toBe(sourceBeforeSave.sourceId);
    await page.reload();
    await page.locator(".composer-textarea").waitFor();
    await page.keyboard.press("Control+,");
    await page.getByRole("button", { name: "智能体", exact: true }).click();
    const card = page.getByRole("article", { name: "智能体：界面创建角色", exact: true });
    await card.getByRole("button", { name: "编辑", exact: true }).click();
    expect(await modelPicker.textContent()).toContain("fixture/alternate");
    expect(await permissionPicker.textContent()).toContain("继承主会话权限");
    expect(await page.getByLabel("精确模型 ID", { exact: true }).count()).toBe(0);
    await page.getByLabel("智能体名称", { exact: true }).fill("保留本地草稿");
    // A second RPC caller updates storage without replacing the editor's state.
    await page.evaluate(async () => {
      const current = (await window.forge.getSettings()).agentProfiles!.find(p => p.id === "ui-integration")!;
      const { revision, ...profile } = current;
      await window.forge.updateSettings({ agent: { type: "save", expectedRevision: revision, profile: { ...profile, name: "另一窗口的新版本" } } });
    });
    await save();
    await page.getByRole("alert").filter({ hasText: "版本冲突" }).waitFor();
    expect(await page.getByLabel("智能体名称", { exact: true }).inputValue()).toBe("保留本地草稿");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "刷新为最新配置", exact: true }).click();
    await expect.poll(() => page.getByLabel("智能体名称", { exact: true }).inputValue()).toBe("另一窗口的新版本");
    await page.getByRole("button", { name: "返回列表", exact: true }).click();
    const latestCard = page.getByRole("article", { name: "智能体：另一窗口的新版本", exact: true });
    await latestCard.waitFor();

    // List actions also need revision recovery. Refresh must never replay a mutation.
    const bumpProfile = () => page.evaluate(async () => {
      const current = (await window.forge.getSettings()).agentProfiles!.find(p => p.id === "ui-integration")!;
      const { revision, ...profile } = current;
      return window.forge.updateSettings({ agent: { type: "save", expectedRevision: revision, profile } });
    });
    const readProfile = () => page.evaluate(async () =>
      (await window.forge.getSettings()).agentProfiles!.find(p => p.id === "ui-integration"));
    await bumpProfile();
    const beforeToggle = await readProfile();
    await latestCard.getByRole("button", { name: "停用", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "刷新为最新配置", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    expect(await readProfile()).toEqual(beforeToggle);
    await latestCard.getByRole("button", { name: "停用", exact: true }).click();
    await latestCard.getByText("已停用", { exact: true }).waitFor();
    expect((await readProfile())?.enabled).toBe(false);

    await bumpProfile();
    const beforeDelete = await readProfile();
    await latestCard.getByRole("button", { name: /删除智能体/ }).click();
    await latestCard.getByRole("button", { name: "确定删除", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "刷新为最新配置", exact: true }).click();
    await page.getByRole("alert").waitFor({ state: "hidden" });
    expect(await latestCard.getByRole("button", { name: "确定删除", exact: true }).count()).toBe(0);
    expect(await readProfile()).toEqual(beforeDelete);
    await latestCard.getByRole("button", { name: /删除智能体/ }).click();
    await latestCard.getByRole("button", { name: "确定删除", exact: true }).click();
    await latestCard.waitFor({ state: "hidden" });
    expect(await readProfile()).toBeUndefined();
    await page.getByRole("button", { name: "返回工作台", exact: true }).click();

    const run = await page.evaluate(async () => {
      const parent = (await window.forge.listSessions()).find(s => s.title === "协作集成检查")!;
      return window.forge.startRun({ sessionId: parent.id, prompt: "运行离线协作验证", permission: "unrestricted" });
    });
    const openParent = async () => {
      await page.locator(".welcome-task").filter({ hasText: "协作集成检查" }).click();
      const expand = page.getByRole("button", { name: "展开详情", exact: true });
      if (await expand.isVisible()) await expand.click();
    };
    await openParent();
    const advisor = page.locator(".inspector-advisor-card");
    await advisor.getByText("等待主代理答复", { exact: true }).waitFor();
    await page.locator(".child-role-badge").filter({ hasText: "离线集成探索" }).waitFor();
    const pending = await page.evaluate(async id => (await window.forge.getSession(id)).advisorRequests![0]!, run.sessionId);
    expect(pending.parentRunId).not.toBe(run.runId); // Core identity != transport identity.
    expect(await advisor.count()).toBe(1);
    // Reconnect replays run_started with the Core budget identity, not just a host ID.
    await page.reload();
    await openParent();
    await advisor.getByText("等待主代理答复", { exact: true }).waitFor();
    core.child.send("answer");
    await advisor.getByText("已答复并投递", { exact: true }).waitFor();
    await advisor.getByText("保留旧接口兼容性。", { exact: true }).waitFor();
    await advisor.getByText("运行两个调用方的聚焦测试。", { exact: true }).waitFor();
    await expect.poll(() => page.evaluate(async id => (await window.forge.getSession(id)).status, run.sessionId)).toBe("completed");
    const completed = await page.evaluate(id => window.forge.getSession(id), run.sessionId);
    expect(completed.advisorRequests).toHaveLength(1);
    expect(completed.advisorRequests![0]).toMatchObject({ status: "answered", deliveredAt: expect.any(String) });
    const child = await page.evaluate(async parentId => {
      const summary = (await window.forge.listSessions()).find(s => s.parentSessionId === parentId)!;
      return window.forge.getSession(summary.id);
    }, run.sessionId);
    expect(child.agentProfile?.name).toBe("离线集成探索");
    expect(child.status).toBe("completed");
    expect(childTurns).toBe(2);
    await page.reload();
    await openParent();
    await advisor.getByText("已答复并投递", { exact: true }).waitFor();
    expect(await advisor.count()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    try { await browser?.close(); } finally {
      await core?.stop();
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 60000);
