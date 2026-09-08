import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.AUSSIEMED_LOCAL_PORT || "3001");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("AUSSIEMED_LOCAL_PORT must be an integer from 1 to 65535.");
}

// Process-level values override .env without removing the shared preview gate.
const server = spawn(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      AUSSIEMED_LOCAL_PREVIEW: "1",
      PREVIEW_PASSWORD: "",
      PUBLIC_URL: `http://127.0.0.1:${port}`,
    },
    stdio: "inherit",
    windowsHide: true,
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("error", (error) => {
  console.error("Could not start the local preview:", error.message);
  process.exitCode = 1;
});
server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
