// Offline Core process for the split-service browser test. No real provider/config.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHarness } from "@forge/core/core/harness";
import { PUBLISHED_FILE_MAX_BYTES } from "@forge/core/shared/published-files";
import { createWebHost } from "@forge/core/web/server";

const [directory, port] = process.argv.slice(2);
await writeFile(
  join(directory, "large.bin"),
  Buffer.alloc(PUBLISHED_FILE_MAX_BYTES),
);
let releaseOffline;
let releaseFinish;
const offline = new Promise((done) => {
  releaseOffline = done;
});
const finish = new Promise((done) => {
  releaseFinish = done;
});
process.on("message", (message) => {
  if (message === "offline") releaseOffline();
  if (message === "finish") releaseFinish();
});
let calls = 0;
const service = await createHarness({
  stateDir: join(directory, "state"),
  providerFactory: () => ({
    listModels: async () => ["fixture"],
    complete: async (_messages, _tools, options) => {
      if (
        _messages.some(
          (message) =>
            message.role === "user" &&
            message.content === "publish 50 MiB fixture",
        )
      ) {
        if (
          _messages.some(
            (message) =>
              message.role === "tool" && message.tool_call_id === "large-file",
          )
        )
          return {
            message: { role: "assistant", content: "50 MiB file delivered." },
          };
        return {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "large-file",
                type: "function",
                function: {
                  name: "publish_file",
                  arguments: JSON.stringify({ path: "large.bin" }),
                },
              },
            ],
          },
        };
      }
      process.send?.({ calls: ++calls });
      options.onText("Before Web restart.\n\n");
      await offline;
      options.onText("Core kept working while Web was offline.\n\n");
      process.send?.({ offlineProgress: true });
      await finish;
      options.onText("Finished after reconnect.\n");
      return {
        message: {
          role: "assistant",
          content:
            "Before Web restart.\n\nCore kept working while Web was offline.\n\nFinished after reconnect.",
        },
      };
    },
  }),
});
await service.updateSettings({
  settings: { baseUrl: "http://127.0.0.1:1/v1", model: "fixture" },
});
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
console.log(`Fixture Core: ${web.origin}`);
process.on("SIGTERM", () => {
  releaseOffline();
  releaseFinish();
  void web.dispose().then(
    () => process.exit(0),
    () => process.exit(1),
  );
});
