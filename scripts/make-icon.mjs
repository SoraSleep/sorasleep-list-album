import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "make-icon.py");
const run = spawnSync("python3", [script], { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
