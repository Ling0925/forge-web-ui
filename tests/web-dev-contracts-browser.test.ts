import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHarness } from "@forge/core/core/harness";
import { paginateSession } from "@forge/core/shared/session-page";
import { createWebHost } from "@forge/core/web/server";
import { type Browser, chromium } from "playwright";
import { expect, it } from "vitest";
import { freePort, launch } from "./fixtures/web-process";

// Core's file: dependency can change without a lockfile/version change. Its
// strict RPC schemas must not survive as immutable Vite optimized dependencies.
it("loads current Core contracts and opens paged sessions without an optimized protocol cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "forge-dev-contracts-"));
  let service: Awaited<ReturnType<typeof createHarness>> | undefined;
  let core: Awaited<ReturnType<typeof createWebHost>> | undefined;
  let web: ReturnType<typeof launch> | undefined;
  let browser: Browser | undefined;
  try {
    service = await createHarness({
      stateDir: join(directory, "state"),
      providerFactory: () => ({
        listModels: async () => ["fixture"],
        complete: async (messages) => ({
          message: {
            role: "assistant",
            content: `Reply to ${messages.findLast((message) => message.role === "user")?.content}`,
          },
          usage: {
            promptTokens: 100,
            cachedPromptTokens: 40,
            completionTokens: 10,
            totalTokens: 110,
          },
        }),
      }),
    });
    await service.updateSettings({
      settings: { baseUrl: "http://127.0.0.1:1/v1", model: "fixture" },
    });
    const sessions = [];
    for (const name of ["A", "B"]) {
      const session = await service.createSession({
        workspace: directory,
        title: `Protocol fixture ${name}`,
      });
      for (const turn of [1, 2]) {
        await service.run(
          {
            sessionId: session.id,
            prompt: `${name} turn ${turn}`,
            permission: "readonly",
          },
          () => {},
          async () => false,
          new AbortController().signal,
        );
      }
      const snapshot = await service.getSession(session.id);
      expect(snapshot.status).toBe("completed");
      // This additive prefix field was rejected by the stale strict schema,
      // making every multi-turn session report "Invalid host response".
      expect(
        paginateSession(snapshot).page.usageBefore?.cacheState,
      ).toBeDefined();
      sessions.push(session);
    }
    const corePort = await freePort();
    core = await createWebHost({
      service,
      workspace: directory,
      stateDir: join(directory, "state"),
      host: "127.0.0.1",
      port: corePort,
      restrictWorkspace: false,
    });
    const host = core;
    host.server.on("request", (request, response) => {
      void host.handle(request, response, () => {
        response.writeHead(404);
        response.end();
      });
    });
    await new Promise<void>((done) =>
      host.server.listen(corePort, "127.0.0.1", done),
    );
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const args = [
      resolve("scripts/dev.mjs"),
      "--port",
      String(port),
      "--core-url",
      host.origin,
    ];
    web = launch(args, directory, origin, "web-must-not-create-state");
    await web.ready();

    const executablePath = process.env.FORGE_BROWSER_EXECUTABLE;
    browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    const optimizedContracts: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/\/\.vite\/deps\/@forge_core_/.test(new URL(request.url()).pathname))
        optimizedContracts.push(request.url());
    });
    await page.goto(origin);
    await page.locator(".composer-textarea").waitFor();
    const hostId = await page.evaluate(
      async () => (await window.forge.getHostState()).hostId,
    );
    for (const [index, name] of ["A", "B", "A"].entries()) {
      const session = sessions[name === "A" ? 0 : 1]!;
      await page
        .locator(".session-item-main")
        .filter({ hasText: session.title })
        .click();
      await page
        .getByText(`Reply to ${name} turn 2`, { exact: true })
        .waitFor();
      const result = await page.evaluate(
        (id) => window.forge.getSessionPage!(id),
        session.id,
      );
      expect(result.page).toMatchObject({
        firstTurn: 2,
        hasMore: true,
        usageBefore: { cacheState: { inputTokens: 100, readTokens: 40 } },
      });
      expect(
        result.snapshot.messages.some(
          (message) => message.content === `${name} turn 1`,
        ),
      ).toBe(false);
      await page
        .getByRole("button", { name: "加载更早的对话记录", exact: true })
        .click();
      await page
        .getByText(`Reply to ${name} turn 1`, { exact: true })
        .waitFor();
      expect(await page.getByRole("alert").count()).toBe(0);
      if (index === 1) {
        await page.reload();
        await page.locator(".composer-textarea").waitFor();
      }
    }
    expect(
      await page.evaluate(
        async () => (await window.forge.getHostState()).hostId,
      ),
    ).toBe(hostId);
    expect(errors).toEqual([]);
    expect(optimizedContracts).toEqual([]);
    expect(await web.stop()).toBe(0);
  } finally {
    try {
      await browser?.close();
    } finally {
      await web?.stop();
      if (core) await core.dispose();
      else await service?.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }
}, 60_000);
