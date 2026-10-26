// Offline persisted chart sessions. The test launcher supplies isolated HOME/FORGE_HOME.
import { join } from "node:path";
import { createHarness } from "@forge/core/core/harness";
import { createWebHost } from "@forge/core/web/server";

const [directory, port] = process.argv.slice(2);
const specs = [
  {
    title: "季度收入与成本 · 华东地区经营概览",
    note: "单位：万元。示例数据用于检查会话恢复与图表布局。",
    chart: {
      type: "bar",
      categories: ["一季度", "二季度", "三季度", "四季度"],
      series: [
        { name: "收入", values: [120, 184, 168, 236] },
        { name: "成本", values: [82, 110, 97, 142] },
      ],
    },
  },
  {
    title: "渠道贡献",
    chart: {
      type: "bar",
      horizontal: true,
      categories: ["直营渠道", "合作伙伴", "线上商城"],
      series: [{ name: "收入", values: [42, 31, 27] }],
    },
  },
  {
    title: "累计服务量",
    chart: {
      type: "line",
      stack: true,
      area: true,
      categories: ["周一", "周二", "周三", "周四", "周五"],
      series: [
        { name: "线上", values: [12, 18, 22, 28, 35] },
        { name: "线下", values: [8, 11, 14, 18, 20] },
      ],
    },
  },
  {
    title: "收入构成",
    chart: {
      type: "pie",
      donut: true,
      series: [
        {
          data: [
            { name: "直营", value: 42 },
            { name: "合作", value: 31 },
            { name: "线上", value: 27 },
          ],
        },
      ],
    },
  },
];
const bad = {
  title: "无效配置",
  raw: { option: { series: [{ type: "bar", data: [1, 2] }] } },
};
const fence = (spec) => ["```chart", JSON.stringify(spec), "```"].join("\n");
const options = {
  stateDir: join(directory, "state"),
  providerFactory: () => ({
    listModels: async () => ["fixture"],
    complete: async (messages) => {
      const prompt = String(
        messages.findLast((message) => message.role === "user")?.content,
      );
      if (prompt === "other")
        return {
          message: { role: "assistant", content: "另一会话，无图表。" },
        };
      const spec = prompt === "bad" ? bad : specs[0];
      const id = `chart-${prompt}`;
      if (
        !messages.some(
          (message) => message.role === "tool" && message.tool_call_id === id,
        )
      ) {
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id,
                type: "function",
                function: {
                  name: "render_chart",
                  arguments: JSON.stringify({ spec }),
                },
              },
            ],
          },
        };
      }
      return {
        message: {
          role: "assistant",
          content: (prompt === "bad" ? [bad] : specs).map(fence).join("\n\n"),
        },
      };
    },
  }),
};
let service = await createHarness(options);
await service.updateSettings({
  settings: { baseUrl: "http://127.0.0.1:1/v1", model: "fixture" },
});
for (const [name, prompts] of [
  ["A", ["first", "second"]],
  ["B", ["other"]],
  ["Bad", ["bad"]],
]) {
  const session = await service.createSession({
    workspace: directory,
    title: `Chart recovery ${name}`,
  });
  for (const prompt of prompts) {
    await service.run(
      // The Web RPC stamps this flag; direct fixture runs must do so too.
      { sessionId: session.id, prompt, permission: "readonly", uiHost: "web" },
      () => {},
      async () => false,
      new AbortController().signal,
    );
  }
}
// Test real persistence instead of handing the UI only in-memory messages.
await service.dispose();
service = await createHarness(options);
const web = await createWebHost({
  service,
  workspace: directory,
  host: "127.0.0.1",
  port: Number(port),
  restrictWorkspace: false,
});
web.server.on("request", (request, response) => {
  void web.handle(request, response, () => {
    response.writeHead(404);
    response.end();
  });
});
await new Promise((done) => web.server.listen(Number(port), "127.0.0.1", done));
console.log(`Chart fixture Core: ${web.origin}`);
process.on("SIGTERM", () => {
  void web.dispose().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
