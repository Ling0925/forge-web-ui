import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
import { chooseOption, selectValue } from "./select-helpers";

describe("McpPanel mounted browser integration", () => {
  it("supports remote registration, preserves stdio compatibility, and never persists or echoes secrets", async () => {
    const bundle = await build({
      stdin: {
        resolveDir: resolve("."),
        loader: "tsx",
        contents: `
          import { createRoot } from 'react-dom/client';
          import { McpPanel } from './src/renderer/components/workbench/McpPanel';
          import './src/renderer/styles/global.css';

          window.registered = [];
          window.mockServers = [
            {
              id: 'local-stdio',
              label: 'Local Stdio Tool',
              command: 'python3',
              args: ['-m', 'server'],
              enabled: true,
              requestTimeoutMs: 15000,
              envNameCount: 0,
              hasPrivateEnv: false,
              transport: 'stdio',
            },
            {
              id: 'existing-remote',
              label: 'Cloud Search',
              command: '',
              args: [],
              enabled: false,
              requestTimeoutMs: 15000,
              envNameCount: 0,
              hasPrivateEnv: false,
              transport: 'http',
              url: 'https://cloud.mcp.example/search',
              hasPrivateHeaders: true,
              headerCount: 1,
            },
          ];

          window.forge = {
            listMcpServers: async () => window.mockServers,
            registerMcpServer: async (dto) => {
              window.registered.push(dto);
              const newServer = {
                id: dto.id,
                label: dto.label,
                command: 'command' in dto ? dto.command : '',
                args: 'args' in dto ? dto.args : [],
                enabled: false,
                requestTimeoutMs: 15000,
                envNameCount: 0,
                hasPrivateEnv: 'env' in dto && Boolean(dto.env && Object.keys(dto.env).length),
                transport: 'transport' in dto ? dto.transport : 'stdio',
                url: 'url' in dto ? dto.url : undefined,
                hasPrivateHeaders: 'headers' in dto && Boolean(dto.headers),
                headerCount: 'headers' in dto && dto.headers ? Object.keys(dto.headers).length : 0,
              };
              window.mockServers = [...window.mockServers, newServer];
              return newServer;
            },
            setMcpEnabled: async (id, enabled) => {
              window.mockServers = window.mockServers.map(s => s.id === id ? { ...s, enabled } : s);
            },
            getMcpHealth: async (id) => ({
              id,
              enabled: true,
              connected: true,
              negotiatedProtocolVersion: '2024-11-05',
              lastError: null,
            }),
            removeMcpServer: async (id) => {
              window.mockServers = window.mockServers.filter(s => s.id !== id);
            },
          };

          const root = createRoot(document.getElementById('root')!);
          root.render(<McpPanel showHeader={false} />);
        `,
      },
      bundle: true,
      write: false,
      format: "iife",
      outfile: "mcp.js",
      jsx: "automatic",
      loader: { ".woff2": "dataurl" },
      define: { "process.env.NODE_ENV": '"development"' },
    });

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(4000);
      const js = bundle.outputFiles.find((f) => f.path.endsWith(".js"))?.text;
      const css = bundle.outputFiles.find((f) => f.path.endsWith(".css"))?.text;
      if (!js || !css) throw new Error("Missing test bundle files");

      await page.route("http://mcp.test/**", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!DOCTYPE html><html><head><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`,
        }),
      );
      await page.goto("http://mcp.test/");

      // 1. Initial list verification:
      // Local stdio server displays its command array JSON
      await page.getByText("Local Stdio Tool · stdio · 已启用").waitFor();
      expect(
        await page.getByText('["python3","-m","server"]').isVisible(),
      ).toBe(true);

      // Existing remote server displays remote URL and header tag, NOT empty command JSON
      await page.getByText("Cloud Search · HTTP · 已禁用").waitFor();
      expect(
        await page.getByText("https://cloud.mcp.example/search").isVisible(),
      ).toBe(true);
      expect(
        await page.getByText("已配置私密认证凭据（共 1 项）").isVisible(),
      ).toBe(true);

      // Card layout verification: grid container, server cards with icon/name/description, and Add MCP card
      const cardLayout = await page.evaluate(() => {
        const grid = document.querySelector(".mcp-card-grid");
        const serverCards = Array.from(
          document.querySelectorAll(".mcp-card.agent-card"),
        );
        const addCard = document.querySelector(".mcp-card.mcp-add-card");
        return {
          gridDisplay: grid ? window.getComputedStyle(grid).display : null,
          serverCardCount: serverCards.length,
          allServerCardsHaveIconNameDesc: serverCards.every(
            (card) =>
              Boolean(card.querySelector(".mcp-card-icon svg")) &&
              Boolean(
                card.querySelector(".mcp-card-name")?.textContent?.trim(),
              ) &&
              Boolean(
                card.querySelector(".mcp-card-desc")?.textContent?.trim(),
              ),
          ),
          addCardHasIcon: Boolean(
            addCard?.querySelector(".mcp-add-card-icon svg"),
          ),
          addCardName:
            addCard?.querySelector(".mcp-card-name")?.textContent?.trim() ??
            null,
          addCardDesc:
            addCard?.querySelector(".mcp-card-desc")?.textContent?.trim() ??
            null,
        };
      });
      expect(cardLayout.gridDisplay).toBe("grid");
      expect(await page.locator(".mcp-panel-header").count()).toBe(0);
      expect(cardLayout.serverCardCount).toBe(2);
      expect(cardLayout.allServerCardsHaveIconNameDesc).toBe(true);
      expect(cardLayout.addCardHasIcon).toBe(true);
      expect(cardLayout.addCardName).toBe("添加 MCP");
      expect(Boolean(cardLayout.addCardDesc)).toBe(true);

      // 2. Open register dialog via the Add MCP card
      await page.getByRole("button", { name: "注册服务器" }).click();
      await page.getByRole("heading", { name: "注册 MCP 服务器" }).waitFor();

      // Default transport is stdio: command and args inputs are present, URL input is NOT
      expect(await selectValue(page.locator("#mcp-server-transport"))).toBe(
        "stdio",
      );
      expect(await page.locator("#mcp-server-command").isVisible()).toBe(true);
      expect(await page.locator("#mcp-server-args").isVisible()).toBe(true);
      expect(await page.locator("#mcp-server-url").count()).toBe(0);

      // 3. Switch to Streamable HTTP
      await chooseOption(page.locator("#mcp-server-transport"), "http");
      expect(await page.locator("#mcp-server-command").count()).toBe(0);
      expect(await page.locator("#mcp-server-args").count()).toBe(0);
      expect(await page.locator("#mcp-server-url").isVisible()).toBe(true);
      expect(await page.locator("#mcp-server-auth").isVisible()).toBe(true);

      // Fill out remote server form with private Authorization token
      await page.locator("#mcp-server-id").fill("weather-api");
      await page.locator("#mcp-server-name").fill("Weather Service");
      await page
        .locator("#mcp-server-url")
        .fill("https://weather.example.com/mcp");
      const secretToken = "Bearer ultra-secret-jwt-token-999";
      await chooseOption(
        page.locator("#mcp-server-auth-type"),
        "authorization",
      );
      await page.locator("#mcp-server-auth").fill(secretToken);

      // Submit registration
      await page.getByRole("button", { name: "注册（默认禁用）" }).click();

      // Wait for dialog to close and new server to appear in list
      await page.getByText("Weather Service · HTTP · 已禁用").waitFor();
      expect(
        await page.getByText("https://weather.example.com/mcp").isVisible(),
      ).toBe(true);

      // Verify the DTO sent to bridge.registerMcpServer
      const registered = await page.evaluate(() =>
        Reflect.get(window, "registered"),
      );
      expect(registered).toHaveLength(1);
      expect(registered[0]).toEqual({
        id: "weather-api",
        label: "Weather Service",
        transport: "http",
        url: "https://weather.example.com/mcp",
        headers: { Authorization: secretToken },
        enabled: false,
      });

      // Verify secret is NOT leaked into the DOM text or attributes
      const bodyHtml = await page.content();
      expect(bodyHtml).not.toContain(secretToken);

      // Verify secret is NOT stored in localStorage
      const storageKeys = await page.evaluate(() => Object.keys(localStorage));
      for (const key of storageKeys) {
        const val = await page.evaluate((k) => localStorage.getItem(k), key);
        expect(val).not.toContain(secretToken);
      }

      // Re-open registration dialog and ensure secret draft is cleared
      await page.getByRole("button", { name: "注册服务器" }).click();
      await chooseOption(page.locator("#mcp-server-transport"), "http");
      expect(await page.locator("#mcp-server-auth").inputValue()).toBe("");
      expect(await page.locator("#mcp-server-url").inputValue()).toBe("");

      // 4. Test stdio registration preserves legacy shape without transport/url/headers
      await chooseOption(page.locator("#mcp-server-transport"), "stdio");
      await page.locator("#mcp-server-id").fill("custom-stdio");
      await page.locator("#mcp-server-name").fill("Custom Stdio");
      await page.locator("#mcp-server-command").fill("deno");
      await page.locator("#mcp-server-args").fill('["run", "main.ts"]');
      await page.getByRole("button", { name: "注册（默认禁用）" }).click();

      await page.getByText("Custom Stdio · stdio · 已禁用").waitFor();
      expect(await page.getByText('["deno","run","main.ts"]').isVisible()).toBe(
        true,
      );

      const registeredStdio = await page.evaluate(() =>
        Reflect.get(window, "registered"),
      );
      expect(registeredStdio).toHaveLength(2);
      expect(registeredStdio[1]).toEqual({
        id: "custom-stdio",
        label: "Custom Stdio",
        command: "deno",
        args: ["run", "main.ts"],
        enabled: false,
      });
      expect("transport" in registeredStdio[1]).toBe(false);
      expect("url" in registeredStdio[1]).toBe(false);
      expect("headers" in registeredStdio[1]).toBe(false);

      // 5. Responsive card grid geometry check across desktop (1280px) and mobile (390px)
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const geom = await page.evaluate(() => {
          const doc = document.documentElement;
          const cards = Array.from(document.querySelectorAll(".mcp-card"));
          const tops = new Set(
            cards.map((c) => Math.round(c.getBoundingClientRect().top)),
          );
          return {
            overflow: doc.scrollWidth > doc.clientWidth,
            cardCount: cards.length,
            rowCount: tops.size,
          };
        });
        expect(geom.overflow).toBe(false);
        expect(geom.cardCount).toBe(5); // 4 servers + 1 Add MCP card
        if (width === 1280) {
          expect(geom.rowCount).toBeLessThan(geom.cardCount);
        } else {
          expect(geom.rowCount).toBe(geom.cardCount);
        }
      }

      await page.getByRole("button", { name: "注册服务器" }).click();
      await chooseOption(page.locator("#mcp-server-transport"), "http");
      await page.locator("#mcp-server-id").fill("exa-remote");
      await page.locator("#mcp-server-name").fill("Exa Search");
      await page.locator("#mcp-server-url").fill("https://mcp.exa.ai/mcp");
      expect(await page.locator("#mcp-server-header-name").inputValue()).toBe(
        "x-api-key",
      );
      expect(await page.locator("#mcp-server-auth").getAttribute("type")).toBe(
        "password",
      );
      const exaKey = "exa-fixture-key-123";
      await page.locator("#mcp-server-auth").fill(exaKey);
      await page.locator("#mcp-server-header-name").fill("Host");
      await page.getByRole("button", { name: "注册（默认禁用）" }).click();
      await page.locator("#mcp-server-auth-error").waitFor();
      expect(
        await page.evaluate(() => Reflect.get(window, "registered").length),
      ).toBe(2);
      await page.locator("#mcp-server-header-name").fill("x-api-key");
      await chooseOption(
        page.locator("#mcp-server-auth-type"),
        "authorization",
      );
      expect(await page.locator("#mcp-server-auth").inputValue()).toBe("");
      await chooseOption(page.locator("#mcp-server-auth-type"), "api-key");
      await page.locator("#mcp-server-auth").fill(exaKey);

      await page.getByRole("button", { name: "注册（默认禁用）" }).click();
      await page.getByText("Exa Search · HTTP · 已禁用").waitFor();
      expect(
        await page.evaluate(() => Reflect.get(window, "registered")[2]),
      ).toEqual({
        id: "exa-remote",
        label: "Exa Search",
        transport: "http",
        url: "https://mcp.exa.ai/mcp",
        headers: { "x-api-key": exaKey },
        enabled: false,
      });
      expect(await page.content()).not.toContain(exaKey);

      await page.getByRole("button", { name: "注册服务器" }).click();
      await page.locator("#mcp-server-id").fill("exa-local");
      await page.locator("#mcp-server-name").fill("Local Exa");
      await page.locator("#mcp-server-command").fill("npx");
      await page.locator("#mcp-server-args").fill('["-y", "exa-mcp-server"]');
      await page.locator("#mcp-server-env-value").fill(exaKey);
      expect(
        await page.locator("#mcp-server-env-value").getAttribute("type"),
      ).toBe("password");
      await page.getByRole("button", { name: "注册（默认禁用）" }).click();
      await page
        .getByText("请同时填写环境变量名称和 API key，或同时留空。")
        .waitFor();
      expect(
        await page.evaluate(() => Reflect.get(window, "registered").length),
      ).toBe(3);
      await page.locator("#mcp-server-env-name").fill("EXA_API_KEY");
      await page.getByRole("button", { name: "注册（默认禁用）" }).click();
      const localCard = page
        .locator(".mcp-card.agent-card")
        .filter({ hasText: "Local Exa" });
      await localCard
        .getByText("已配置私密认证凭据", { exact: true })
        .waitFor();
      expect(
        await page.evaluate(() => Reflect.get(window, "registered")[3]),
      ).toEqual({
        id: "exa-local",
        label: "Local Exa",
        command: "npx",
        args: ["-y", "exa-mcp-server"],
        env: { EXA_API_KEY: exaKey },
        enabled: false,
      });
      expect(await page.content()).not.toContain(exaKey);
      expect(
        await page.evaluate(() => JSON.stringify(localStorage)),
      ).not.toContain(exaKey);
      expect(
        await page.evaluate(() => JSON.stringify(sessionStorage)),
      ).not.toContain(exaKey);

      await page.getByRole("button", { name: "注册服务器" }).click();
      expect(await page.locator("#mcp-server-env-value").inputValue()).toBe("");
      await page.locator("#mcp-server-env-value").fill(exaKey);
      await page.getByRole("button", { name: "关闭面板" }).click();
      await page.getByRole("button", { name: "注册服务器" }).click();
      expect(await page.locator("#mcp-server-env-value").inputValue()).toBe("");
      await chooseOption(page.locator("#mcp-server-transport"), "http");
      expect(await page.locator("#mcp-server-auth").inputValue()).toBe("");
      await page.locator("#mcp-server-auth").fill(exaKey);
      await chooseOption(page.locator("#mcp-server-transport"), "stdio");
      await chooseOption(page.locator("#mcp-server-transport"), "http");
      expect(await page.locator("#mcp-server-auth").inputValue()).toBe("");
    } finally {
      await browser.close();
    }
  });
});
