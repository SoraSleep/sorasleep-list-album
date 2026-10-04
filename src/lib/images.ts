import { useSyncExternalStore } from "react";
import { deleteImage, loadImage, saveImage } from "@/lib/idb-audio";

export const KEY_BG = "bg";
export const KEY_AVATAR = "avatar";

export function albumKey(songId: string) {
  return `album:${songId}`;
}

const bitmaps = new Map<string, ImageBitmap>();
const urls = new Map<string, string>();
let rev = 0;
const listeners = new Set<() => void>();

function publish() {
  rev += 1;
  listeners.forEach((fn) => fn());
}

export function useImageRev() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => rev,
    () => 0,
  );
}

export function frameImage(key: string) {
  return bitmaps.get(key) ?? null;
}

export function previewUrl(key: string) {
  return urls.get(key) ?? null;
}

async function shrink(file: Blob, maxEdge: number) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bmp.close();
    throw new Error("Không xử lý được ảnh");
  }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Không xử lý được ảnh");
  return blob;
}

function remember(key: string, blob: Blob, bmp: ImageBitmap) {
  const prev = bitmaps.get(key);
  if (prev) prev.close();
  bitmaps.set(key, bmp);
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.set(key, URL.createObjectURL(blob));
}

export async function storeImage(key: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Chỉ nhận file ảnh");
  if (file.size > 12 * 1024 * 1024) throw new Error("Ảnh lớn hơn 12 MB");
  const blob = await shrink(file, key === KEY_BG ? 1600 : 800);
  await saveImage(key, blob);
  remember(key, blob, await createImageBitmap(blob));
  publish();
}

export async function clearImage(key: string) {
  await deleteImage(key);
  const prev = bitmaps.get(key);
  if (prev) prev.close();
  bitmaps.delete(key);
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  urls.delete(key);
  publish();
}

export async function hydrateImages(keys: string[]) {
  let changed = false;
  for (const key of keys) {
    if (bitmaps.has(key)) continue;
    const blob = await loadImage(key);
    if (!blob) continue;
    remember(key, blob, await createImageBitmap(blob));
    changed = true;
  }
  if (changed) publish();
}

const SEED = "sorasleep-plates-seed";

export async function seedDemoPlates(songIds: string[]) {
  if (typeof localStorage === "undefined") return;
  if (localStorage.getItem(SEED) === "1") return;
  const jobs: [string, string][] = [
    [KEY_BG, "/plates/bg.jpg"],
    [KEY_AVATAR, "/plates/avatar.jpg"],
  ];
  songIds.slice(0, 12).forEach((id, index) => {
    jobs.push([albumKey(id), `/plates/${String(index + 1).padStart(2, "0")}.jpg`]);
  });
  for (const [key, url] of jobs) {
    if (bitmaps.has(key)) continue;
    const saved = await loadImage(key);
    if (saved) {
      remember(key, saved, await createImageBitmap(saved));
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("Không tải được ảnh mẫu");
    const file = new File([await res.blob()], "plate.jpg", { type: "image/jpeg" });
    const blob = await shrink(file, key === KEY_BG ? 1600 : 800);
    await saveImage(key, blob);
    remember(key, blob, await createImageBitmap(blob));
  }
  localStorage.setItem(SEED, "1");
  publish();
}
