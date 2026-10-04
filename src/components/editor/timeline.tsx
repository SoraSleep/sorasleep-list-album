import { useRef } from "react";
import { engine } from "@/lib/engine";
import { formatTime, padIndex, totalDuration } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function Timeline() {
  const songs = useProject((s) => s.songs);
  const currentTime = useProject((s) => s.currentTime);
  const bar = useRef<HTMLDivElement>(null);
  const total = totalDuration(songs);

  function seek(clientX: number) {
    const el = bar.current;
    if (!el || total <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * Math.max(0, total - 0.02);
    const live = useProject.getState();
    if (engine.playing) engine.playFrom(t, live.songs);
    useProject.setState({ currentTime: t });
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-3 py-3">
      <div className="mb-2 flex items-center justify-between text-xs text-faint">
        <span>Timeline</span>
        <span className="tabular-nums">{formatTime(total)}</span>
      </div>
      <div
        ref={bar}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(currentTime)}
        aria-label="Vị trí phát"
        tabIndex={0}
        className="relative flex h-14 cursor-pointer overflow-hidden rounded-md bg-bg"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          seek(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 2 : -2;
          const t = Math.min(total, Math.max(0, currentTime + delta));
          if (engine.playing) engine.playFrom(t, useProject.getState().songs);
          useProject.setState({ currentTime: t });
        }}
      >
        {songs.map((song, index) => (
          <div
            key={song.id}
            style={{ width: `${total > 0 ? (song.duration / total) * 100 : 0}%` }}
            className="flex h-full min-w-0 flex-col justify-center border-r border-border px-2"
          >
            <span className="text-xs font-semibold text-accent tabular-nums">{padIndex(index)}</span>
            <span className="truncate text-xs text-fg">{song.title}</span>
          </div>
        ))}
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
          style={{ left: `${total > 0 ? (currentTime / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
