import { useState } from "react";
import { Download, Pause, Play, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/engine";
import { cancelExport, exportPlaylist } from "@/lib/export-list";
import { formatTime, locate, totalDuration } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function TopBar() {
  const name = useProject((s) => s.name);
  const aspect = useProject((s) => s.aspect);
  const playing = useProject((s) => s.playing);
  const currentTime = useProject((s) => s.currentTime);
  const songs = useProject((s) => s.songs);
  const exporting = useProject((s) => s.exporting);
  const exportProgress = useProject((s) => s.exportProgress);
  const setName = useProject((s) => s.setName);
  const setAspect = useProject((s) => s.setAspect);
  const [busy, setBusy] = useState(false);

  const total = totalDuration(songs);
  const place = locate(songs, currentTime);

  async function toggle() {
    try {
      const ctx = engine.ensure();
      if (ctx.state === "suspended") await ctx.resume();
      if (engine.playing) {
        engine.pause();
        useProject.setState({ playing: false, currentTime: engine.now() });
        return;
      }
      const live = useProject.getState();
      await engine.ensureSongs(live.songs);
      let t = live.currentTime;
      const end = totalDuration(live.songs);
      if (t >= end - 0.08) t = 0;
      engine.onEnded = () => {
        useProject.setState({ playing: false, currentTime: engine.now() });
      };
      engine.playFrom(t, live.songs);
      useProject.setState({ playing: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không phát được danh sách");
    }
  }

  async function runExport(limit?: number) {
    if (busy || exporting) return;
    setBusy(true);
    try {
      toast.message(limit ? "Đang xuất 20 giây đầu…" : "Đang xuất cả danh sách…");
      await exportPlaylist(limit);
      if (!canceling()) toast.success("Đã tải video WebM.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Xuất video thất bại");
      useProject.setState({ exporting: false, playing: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <div className="hidden items-center gap-2 sm:flex">
        <span className="grid size-8 place-items-center rounded-md bg-subtle font-display text-sm font-semibold text-accent">
          L
        </span>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-fg">SoraSleep List</p>
          <p className="text-xs text-faint">Danh sách chạy</p>
        </div>
      </div>
      <input
        aria-label="Tên playlist"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-11 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-silver"
      />
      <p className="hidden font-display text-sm tabular-nums text-muted md:block">
        {formatTime(currentTime)} · {formatTime(total)}
        <span className="ml-2 text-accent">{songs.length ? `${place.index + 1}/${songs.length}` : ""}</span>
      </p>
      <Button
        variant={aspect === "wide" ? "solid" : "quiet"}
        className="w-11 px-0"
        aria-label="Khung 16:9"
        onClick={() => setAspect("wide")}
      >
        <RectangleHorizontal className="size-4" />
      </Button>
      <Button
        variant={aspect === "tall" ? "solid" : "quiet"}
        className="w-11 px-0"
        aria-label="Khung 9:16"
        onClick={() => setAspect("tall")}
      >
        <RectangleVertical className="size-4" />
      </Button>
      <Button variant="solid" className="w-11 px-0" data-play aria-label={playing ? "Tạm dừng" : "Phát"} onClick={() => void toggle()} disabled={exporting}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      {exporting ? (
        <Button variant="ghost" onClick={() => cancelExport()}>
          <Square className="size-3.5" />
          Hủy {Math.round(exportProgress * 100)}%
        </Button>
      ) : (
        <>
          <Button variant="ghost" onClick={() => void runExport(20)} disabled={busy || !songs.length}>
            <Download className="size-4" />
            <span className="hidden sm:inline">20s</span>
          </Button>
          <Button variant="ghost" onClick={() => void runExport()} disabled={busy || !songs.length}>
            <Download className="size-4" />
            <span className="hidden sm:inline">Cả list</span>
          </Button>
        </>
      )}
    </header>
  );
}

function canceling() {
  return !useProject.getState().exporting && useProject.getState().exportProgress === 0;
}
