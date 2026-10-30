import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";

export async function freePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>((done, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", done);
  });
  const address = reservation.address();
  await new Promise<void>((done) => reservation.close(() => done()));
  if (!address || typeof address === "string") throw new Error("Missing port");
  return address.port;
}

export function launch(
  args: string[],
  directory: string,
  origin: string,
  state: string,
) {
  const child = spawn(process.execPath, args, {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      FORGE_HOME: join(directory, state),
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const closed = new Promise<number | null>((done, reject) => {
    child.once("error", reject);
    child.once("close", done);
  });
  let output = "";
  const started = new Promise<void>((done) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8192);
      if (output.includes(origin)) done();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-8192);
    });
  });
  return {
    child,
    closed,
    async ready() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          started,
          closed.then(() => {
            throw new Error(`Entry exited before listening: ${output}`);
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Entry timed out: ${output}`)),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
    async stop(signal: NodeJS.Signals = "SIGTERM") {
      if (child.exitCode !== null || child.signalCode !== null) return closed;
      child.kill(signal);
      const force = setTimeout(() => child.kill("SIGKILL"), 5000);
      try {
        return await closed;
      } finally {
        clearTimeout(force);
      }
    },
  };
}
