import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { Inspector } from "@/components/editor/inspector";
import { SongBin } from "@/components/editor/song-bin";
import { Stage } from "@/components/editor/stage";
import { Timeline } from "@/components/editor/timeline";
import { TopBar } from "@/components/editor/top-bar";
import { cn } from "@/lib/cn";
import { engine } from "@/lib/engine";
import { loadAudio } from "@/lib/idb-audio";
import { persistSnapshot, restoreProject, useProject } from "@/lib/store";

const TABS = [
  { id: "songs", label: "Bài hát" },
  { id: "preview", label: "Xem" },
  { id: "look", label: "Hiệu ứng" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function EditorShell() {
  const [tab, setTab] = useState<Tab>("preview");

  useEffect(() => {
    restoreProject();
    void document.fonts?.load('600 48px "Be Vietnam Pro"').catch(() => undefined);
    const warm = window.setTimeout(() => {
      void (async () => {
        try {
          const files = useProject.getState().songs.filter((song) => song.source === "file");
          for (const song of files) {
            const raw = await loadAudio(song.id);
            if (!raw) continue;
            engine.remember(song.id, raw);
            const ctx = engine.ensure();
            const buffer = await ctx.decodeAudioData(raw.slice(0));
            engine.setBuffer(song.id, buffer);
          }
          await engine.ensureSongs(useProject.getState().songs.filter((song) => song.source === "demo"));
        } catch {
          /* phát lại khi bấm Play */
        }
      })();
    }, 250);

    let last = "";
    const unsub = useProject.subscribe((state) => {
      const slim = JSON.stringify({
        name: state.name,
        aspect: state.aspect,
        look: state.look,
        glide: state.glide,
        showArtist: state.showArtist,
        showWave: state.showWave,
        songs: state.songs,
      });
      if (slim === last) return;
      last = slim;
      try {
        persistSnapshot(state);
      } catch {
        toast.error("Không lưu được danh sách trên máy này.");
      }
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      document.querySelector<HTMLButtonElement>("[data-play]")?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(warm);
      unsub();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-hidden bg-bg text-fg">
      <Toaster theme="dark" position="bottom-right" />
      <TopBar />
      <div className="flex h-11 shrink-0 border-b border-border lg:hidden">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn("flex-1 text-sm", tab === item.id ? "bg-subtle text-fg" : "text-muted")}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={cn("min-h-0 w-full lg:w-80 lg:shrink-0 lg:border-r lg:border-border", tab !== "songs" && "hidden lg:block")}>
          <SongBin />
        </div>
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", tab !== "preview" && "hidden lg:flex")}>
          <Stage />
          <Timeline />
        </div>
        <div className={cn("min-h-0 w-full lg:w-72 lg:shrink-0 lg:border-l lg:border-border", tab !== "look" && "hidden lg:block")}>
          <Inspector />
        </div>
      </div>
    </div>
  );
}
