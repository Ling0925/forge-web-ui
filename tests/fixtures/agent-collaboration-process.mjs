// Production Core/HTTP contracts with an offline, gated provider. The launcher
// supplies an isolated HOME/FORGE_HOME; this fixture never contacts a provider.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHarness } from "@forge/core/core/harness";
import { createWebHost } from "@forge/core/web/server";
import { agentProfileTemplates } from "@forge/core/shared/agent-profiles";

const [directory, port] = process.argv.slice(2);
const call = (id, name, args) => ({ message: { role: "assistant", content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] } });
const answer = content => ({ message: { role: "assistant", content } });
let release;
const gate = new Promise(done => { release = done; });
process.on("message", message => { if (message === "answer") release(); });
let parentTurns = 0;
let childTurns = 0;
let replied = false;
let parent;
const service = await createHarness({
  stateDir: join(directory, "state"),
  providerFactory: () => ({
    listModels: async () => ["fixture/offline"],
    complete: async (_messages, definitions) => {
      if (definitions.some(tool => tool.function.name === "advisor")) {
        if (++childTurns === 1) return call("ask", "advisor", {
          question: "应当兼容旧接口，还是迁移到新接口？", context: "已读取调用方，尚未修改文件。",
          recommendation: "先保持兼容。", timeout_ms: 60000,
        });
        process.send?.({ childTurns });
        return answer("子代理收到指导并完成检查。");
      }
      if (++parentTurns === 1) return call("spawn", "spawn_agent", {
        task: "核对接口并询问兼容策略。", profileId: "integration-explorer",
      });
      const pending = (await service.getSession(parent.id)).advisorRequests?.find(request => request.status === "pending");
      if (pending && !replied) {
        await gate;
        replied = true;
        return call("reply", "answer_advisor", {
          requestId: pending.id, answer: "保留旧接口兼容性。", nextInstruction: "运行两个调用方的聚焦测试。",
        });
      }
      return replied ? answer("主代理已整合子任务结论。")
        : call(`wait-${parentTurns}`, "wait_agents", { timeout_ms: 60000 });
    },
  }),
});
await service.updateSettings({ source: { type: "save", source: {
  id: "fixture-source", label: "离线测试来源", apiMode: "chat-completions",
  baseUrl: "http://127.0.0.1:1/v1", model: "fixture/offline",
  modelSelection: { mode: "selected", models: ["fixture/offline", "fixture/alternate"] },
} } });
await service.updateSettings({ source: { type: "activate", id: "fixture-source" } });
await service.updateSettings({ agent: { type: "save", expectedRevision: 0,
  profile: { ...agentProfileTemplates[0], id: "integration-explorer", name: "离线集成探索" } } });
parent = await service.createSession({ workspace: directory, model: "fixture/offline", title: "协作集成检查" });
const web = await createWebHost({ service, workspace: directory, host: "127.0.0.1", port: Number(port),
  rendererRoot: fileURLToPath(new URL("../../dist/renderer", import.meta.url)) });
web.server.on("request", (request, response) => {
  void web.handle(request, response, () => { response.writeHead(404); response.end(); });
});
await new Promise(done => web.server.listen(Number(port), "127.0.0.1", done));
console.log(`Fixture: ${web.origin}`);
process.on("SIGTERM", () => {
  release();
  void web.dispose().then(() => process.exit(0), () => process.exit(1));
});
