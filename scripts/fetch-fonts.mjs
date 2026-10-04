import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "fonts");
const fileDir = path.join(outDir, "files");
const href =
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=Great+Vibes&family=Manrope:wght@500;600;700&display=swap";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function main() {
  await mkdir(fileDir, { recursive: true });
  const res = await fetch(href, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`font css ${res.status}`);
  let css = await res.text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
  const seen = new Map();
  for (const url of urls) {
    const base = path.basename(new URL(url).pathname);
    if (!seen.has(url)) {
      const bin = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(path.join(fileDir, base), bin);
      seen.set(url, base);
    }
    css = css.replaceAll(url, `./files/${seen.get(url)}`);
  }
  await writeFile(path.join(outDir, "local.css"), css, "utf8");
  console.log(`fonts: ${seen.size} files → public/fonts/local.css`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
