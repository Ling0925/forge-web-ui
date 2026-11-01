import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";

it("groups a worktree session under its origin workspace, never its worktree path", async () => {
  const bundle = await build({
    stdin: {
      resolveDir: resolve("."),
      loader: "tsx",
      contents: `
        import { createRoot } from "react-dom/client";
        import { Sidebar } from "./src/renderer/components/workbench/Sidebar";
        import "./src/renderer/styles/global.css";
        import "./src/renderer/components/workbench/workbench.css";
        import "./src/renderer/components/workbench/app.css";
        import "./src/renderer/styles/workspace-theme.css";
        import "./src/renderer/styles/sidebar-compact.css";

        const root = createRoot(document.getElementById("root"));
        window.render = () => root.render(
          <div className="wb-app">
            <Sidebar />
          </div>
        );
        window.render();
      `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    outfile: "sidebar-origin-workspace.js",
    loader: { ".woff2": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "session-state",
        setup(api) {
          api.onLoad({ filter: /workbench-context\.tsx$/ }, () => ({
            loader: "js",
            contents: `
              export const useWorkbench = () => ({
                state: {
                  sessions: window.sessions,
                  isSessionsLoading: false,
                  activeRuns: {},
                  settings: { isConfigured: true },
                  activeSessionId: window.activeSessionId,
                  isMobileSidebarOpen: false,
                  isNewSessionOpen: false,
                },
                openNewSession: () => {},
                openSettings: () => {},
                setMobileSidebar: () => {},
                selectSession: (id) => { window.activeSessionId = id; window.render(); },
                refreshActiveSession: () => {},
                createSession: (input) => Promise.resolve({ id: "mock-new-id", ...input }),
              });
            `,
          }));
        },
      },
    ],
  });

  const js = bundle.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
  const css = bundle.outputFiles.find((file) =>
    file.path.endsWith(".css"),
  )?.text;
  if (!js || !css) throw new Error("Missing test bundle");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
    });
    page.setDefaultTimeout(4000);
    await page.setContent('<div id="root"></div>');

    const base = {
      version: 1,
      model: "provider/test-model",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      status: "completed",
    };
    await page.evaluate((baseSession) => {
      Object.assign(window, {
        sessions: [
          {
            ...baseSession,
            id: "worktree-session",
            title: "Worktree task",
            workspace: "/repo/.worktrees/x",
            originWorkspace: "/repo",
          },
          {
            ...baseSession,
            id: "plain-session",
            title: "Plain task",
            workspace: "/repo",
          },
        ],
        activeSessionId: "worktree-session",
      });
    }, base);

    await page.addStyleTag({ content: css });
    await page.addScriptTag({ content: js });

    const sidebar = page.getByRole("complementary", { name: "会话与导航" });
    await sidebar.waitFor();

    // Both sessions belong to the origin workspace, which is the only folder.
    const folders = await sidebar
      .locator(".session-folder")
      .evaluateAll((nodes) =>
        nodes.map((folder) => ({
          workspace: folder
            .querySelector(".session-folder-header")
            ?.getAttribute("title"),
          titles: Array.from(
            folder.querySelectorAll(".session-item-title"),
            (item) => item.textContent,
          ),
        })),
      );
    expect(folders).toEqual([
      { workspace: "/repo", titles: ["Plain task", "Worktree task"] },
    ]);
    expect(
      folders.some((folder) => folder.workspace === "/repo/.worktrees/x"),
    ).toBe(false);

    // Searching by the origin workspace finds both, not the worktree path.
    const search = sidebar.getByRole("textbox", { name: "搜索会话" });
    await search.fill("/repo");
    expect(await sidebar.locator(".session-item").count()).toBe(2);
    await search.fill("/repo/.worktrees/x");
    expect(await sidebar.locator(".session-item").count()).toBe(0);
  } finally {
    await browser.close();
  }
});
