import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import "./wrangler-config.mjs";
// Public test values only. Existing operator configuration is never overwritten.
for (const [source, destination] of [
  [".env.example", ".env.local"],
  [".dev.vars.example", ".dev.vars"],
]) {
  const contents = (await readFile(source, "utf8")).replace(
    "http://localhost:8788",
    "http://localhost:3000",
  );
  try {
    await writeFile(destination, contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
const processes = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of processes) child.kill("SIGTERM");
}
function launch(command, args) {
  const child = spawn(command, args, { stdio: "inherit" });
  processes.add(child);
  child.on("error", () => {
    console.error("Could not start the local development process.");
    stop(1);
  });
  child.on("exit", (code) => {
    processes.delete(child);
    if (!stopping) stop(code ?? 1);
  });
  return child;
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
const migration = spawn(
  "node_modules/.bin/wrangler",
  ["d1", "migrations", "apply", "DB", "--local"],
  { stdio: "inherit" },
);
const code = await new Promise((resolve) => {
  migration.on("exit", resolve);
  migration.on("error", () => resolve(1));
});
if (code !== 0) process.exit(1);
launch("node_modules/.bin/wrangler", [
  "pages",
  "dev",
  "public",
  "--ip",
  "127.0.0.1",
  "--port",
  "8788",
  "--binding",
  "SITE_ORIGIN=http://localhost:3000",
]);
launch("node_modules/.bin/next", [
  "dev",
  "--hostname",
  "localhost",
  "--port",
  "3000",
]);
