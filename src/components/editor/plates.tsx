import { FolderOpen, X } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pickImageDirectory } from "@/lib/export-dir";
import { albumKey, clearImage, KEY_AVATAR, KEY_BG, previewUrl, storeImage, useImageRev } from "@/lib/images";
import { assignPlateNames } from "@/lib/plate-folder";
import { MAX_SONGS, padIndex } from "@/lib/playlist";
import { useProject } from "@/lib/store";

const PRESETS = [
  "Mẫu 1 dùng nền mờ và 12 bìa album.",
  "Mẫu 2 dùng ảnh nền làm cửa sổ đêm.",
  "Mẫu 3 dùng ảnh đại diện bên phải và bìa trong khung kính.",
];

export function Plates() {
  const songs = useProject((s) => s.songs);
  const folderRef = useRef<HTMLInputElement>(null);
  useImageRev();

  async function applyFiles(list: File[]) {
    const live = useProject.getState().songs;
    const plan = assignPlateNames(
      list.map((file) => file.name),
      live.map((song) => song.title),
    );
    const byName = new Map(list.map((file) => [file.name, file]));
    let placed = 0;
    for (const item of plan) {
      const file = byName.get(item.file);
      if (!file) continue;
      const song = item.slot.kind === "album" ? live[item.slot.index] : undefined;
      const key = item.slot.kind === "bg" ? KEY_BG : item.slot.kind === "avatar" ? KEY_AVATAR : song ? albumKey(song.id) : "";
      if (!key) continue;
      try {
        await storeImage(key, file.type.startsWith("image/") ? file : new File([file], file.name, { type: "image/jpeg" }));
        placed += 1;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : `Không lưu được ${file.name}`);
      }
    }
    if (!placed) toast.message("Không thấy ảnh nền, đại diện hoặc bìa trong thư mục.");
    else toast.success(`Đã gắn ${placed} ảnh từ thư mục.`);
  }

  async function onFolder() {
    try {
      const picked = await pickImageDirectory();
      if (picked === "fallback") {
        folderRef.current?.click();
        return;
      }
      await applyFiles(picked);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(err instanceof Error ? err.message : "Không mở được thư mục ảnh");
    }
  }

  return (
    <section className="border-b border-border px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold">Ảnh</p>
        <Button variant="quiet" className="h-8 px-2 text-xs" onClick={() => void onFolder()}>
          <FolderOpen className="size-3.5" />
          Thư mục ảnh
        </Button>
      </div>
      <input
        ref={(node) => {
          folderRef.current = node;
          node?.setAttribute("webkitdirectory", "");
          node?.setAttribute("directory", "");
        }}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        aria-label="Thư mục ảnh"
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []);
          event.target.value = "";
          void applyFiles(list);
        }}
      />
      <p className="mt-1 text-xs leading-relaxed text-faint">
        Đặt tên `nen` hoặc `bg`, `avt` hoặc `avatar`, đúng tên bài, hoặc `01` đến `12`.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Slot k={KEY_BG} label="Ảnh nền" tall />
        <Slot k={KEY_AVATAR} label="Đại diện" tall />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {Array.from({ length: MAX_SONGS }, (_, index) => {
          const song = songs[index];
          return (
            <Slot
              key={song?.id ?? `empty-${index}`}
              k={song ? albumKey(song.id) : ""}
              label={padIndex(index)}
              disabled={!song}
            />
          );
        })}
      </div>
      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-faint">
        {PRESETS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

function Slot({ k, label, tall, disabled }: { k: string; label: string; tall?: boolean; disabled?: boolean }) {
  const url = k ? previewUrl(k) : null;

  async function onFile(file: File | undefined) {
    if (!file || !k) return;
    try {
      await storeImage(k, file);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không lưu được ảnh");
    }
  }

  return (
    <div className={`relative ${tall ? "aspect-[4/5]" : "aspect-square"}`}>
      <label
        className={`flex size-full items-center justify-center overflow-hidden rounded-sm border border-dashed border-border bg-bg text-center text-xs text-faint ${
          disabled ? "cursor-default opacity-40" : "cursor-pointer hover:border-fg"
        }`}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : label}
        <input
          type="file"
          accept="image/*"
          disabled={disabled || !k}
          className="sr-only"
          aria-label={label}
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
      {url && k ? (
        <button
          type="button"
          aria-label={`Xóa ${label}`}
          className="absolute top-1 right-1 grid size-6 place-items-center rounded-sm bg-bg text-fg"
          onClick={() => void clearImage(k).catch(() => undefined)}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
