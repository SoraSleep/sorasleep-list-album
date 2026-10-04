import { loadHandle, saveHandle } from "@/lib/idb-audio";
import { desktopExportWritable, isDesktop } from "@/lib/desktop";

const EXPORT_KEY = "export-dir";
const DESKTOP_DIR = "sora-export-dir";
const IMAGE_NAME = /\.(jpe?g|png|webp|gif|avif)$/i;

type DirHandle = {
  name: string;
  entries: () => AsyncIterable<[string, { kind: string; getFile: () => Promise<File> }]>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    getFile: () => Promise<File>;
    createWritable: () => Promise<FileSystemWritableFileStream>;
  }>;
  removeEntry: (name: string) => Promise<void>;
  queryPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" | "read" }) => Promise<PermissionState>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirHandle>;
};

function asDir(value: unknown) {
  if (!value || typeof value !== "object" || !("name" in value)) return null;
  return value as DirHandle;
}

async function permit(handle: DirHandle, mode: "read" | "readwrite") {
  if (!handle.queryPermission || !handle.requestPermission) return true;
  if ((await handle.queryPermission({ mode })) === "granted") return true;
  return (await handle.requestPermission({ mode })) === "granted";
}

async function savedDir() {
  return asDir(await loadHandle(EXPORT_KEY));
}

export async function pickImageDirectory(): Promise<File[] | "fallback"> {
  const pick = (window as PickerWindow).showDirectoryPicker;
  if (!pick) return "fallback";
  const dir = await pick({ mode: "read" });
  const files: File[] = [];
  for await (const [, entry] of dir.entries()) {
    if (entry.kind !== "file") continue;
    const file = await entry.getFile();
    if (!IMAGE_NAME.test(file.name) && !file.type.startsWith("image/")) continue;
    files.push(file);
  }
  return files;
}

function desktopDir() {
  try {
    return localStorage.getItem(DESKTOP_DIR) || "";
  } catch {
    return "";
  }
}

function folderLabel(dir: string) {
  return dir.split(/[\\/]/).filter(Boolean).pop() || dir;
}

export async function exportFolderName() {
  const desk = desktopDir();
  if (desk && isDesktop()) return folderLabel(desk);
  return (await savedDir())?.name ?? "";
}

export async function chooseExportFolder() {
  if (isDesktop()) {
    const current = desktopDir();
    const picked = await window.soraDesktop?.pickExportFolder?.(current || undefined);
    if (!picked) throw new DOMException("Aborted", "AbortError");
    localStorage.setItem(DESKTOP_DIR, picked);
    return folderLabel(picked);
  }
  const pick = (window as PickerWindow).showDirectoryPicker;
  if (!pick) throw new Error("Trình xem này không cho chọn thư mục. Video sẽ tải về máy.");
  const handle = await pick({ mode: "readwrite" });
  if (!(await permit(handle, "readwrite"))) throw new Error("Chưa được phép ghi vào thư mục đó.");
  await saveHandle(EXPORT_KEY, handle);
  return handle.name;
}

/** Ask while the click is still fresh. Returns false when there is no folder. */
export async function exportFolderReady() {
  const handle = await savedDir();
  if (!handle) return false;
  return permit(handle, "readwrite");
}

export async function openExportFile(filename: string) {
  if (isDesktop()) {
    const dir = desktopDir();
    if (!dir) return null;
    const id = await window.soraDesktop?.beginExport?.(filename, dir);
    if (!id) return null;
    return {
      writable: desktopExportWritable(id),
      dir: {
        getFileHandle: async () => ({ getFile: async () => new File([], filename) }),
      },
      filename,
    };
  }
  const handle = await savedDir();
  if (!handle || !(await permit(handle, "readwrite"))) return null;
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  return { writable, dir: handle, filename };
}

export async function removeExportFile(filename: string) {
  const handle = await savedDir();
  if (!handle) return;
  try {
    await handle.removeEntry(filename);
  } catch {
    /* nothing to remove */
  }
}
