import { cp, mkdir, rm, stat, copyFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "desktop", "web");

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const bin = path.join(root, "node_modules", ".bin");
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        ...extraEnv,
        PATH: `${bin}${path.delimiter}${process.env.PATH || ""}`,
      },
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} → ${code}`))));
  });
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(path.join(root, "public", "fonts", "local.css")))) {
    await run("node", ["scripts/fetch-fonts.mjs"]);
  }
  if (!(await exists(path.join(root, "build", "icon.png")))) {
    await run("node", ["scripts/make-icon.mjs"]);
  }
  await run("npx", ["--yes", "vite", "build"], { ELECTRON_BUILD: "1" });

  await rm(web, { recursive: true, force: true });
  await mkdir(web, { recursive: true });

  const client = path.join(root, "dist", "client");
  if (await exists(client)) {
    await cp(client, web, { recursive: true });
    console.log("desktop web from", client);
  } else {
    throw new Error("Thiếu dist/client. Kiểm tra vite build ELECTRON_BUILD=1");
  }
  await cp(path.join(root, "public"), web, { recursive: true });
  const shell = path.join(web, "_shell.html");
  const index = path.join(web, "index.html");
  if (!(await exists(index)) && (await exists(shell))) await copyFile(shell, index);
  if (!(await exists(index))) throw new Error("Build desktop thiếu index.html");
  console.log("desktop/web ready");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
