import { useRef, type CSSProperties } from "react";
import { engine } from "@/lib/engine";
import { formatTime, padIndex, totalDuration } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function Timeline() {
  const songs = useProject((s) => s.songs);
  const currentTime = useProject((s) => s.currentTime);
  const bar = useRef<HTMLDivElement>(null);
  const total = totalDuration(songs);
  const progress = total > 0 ? Math.min(100, Math.max(0, (currentTime / total) * 100)) : 0;

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
        <span className="tabular-nums"><span className="text-fg">{formatTime(currentTime)}</span> / {formatTime(total)}</span>
      </div>
      <div
        ref={bar}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(currentTime)}
        aria-label="Vị trí phát"
        tabIndex={0}
        className="timeline relative flex h-14 cursor-pointer overflow-hidden rounded-md border border-border bg-bg outline-none focus-visible:border-fg"
        style={{ "--timeline-progress": `${progress}%` } as CSSProperties}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          seek(event.clientX);
        }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 2 : event.key === "ArrowLeft" ? -2 : event.key === "PageUp" ? 10 : -10;
          const t = event.key === "Home" ? 0 : event.key === "End" ? total : Math.min(total, Math.max(0, currentTime + delta));
          if (engine.playing) engine.playFrom(t, useProject.getState().songs);
          useProject.setState({ currentTime: t });
        }}
      >
        {songs.map((song, index) => (
          <div
            key={song.id}
            style={{ width: `${total > 0 ? (song.duration / total) * 100 : 0}%` }}
            className="timeline-segment relative z-10 flex h-full min-w-0 flex-col justify-center border-r border-border/70 px-2"
          >
            <span className="text-xs font-semibold text-accent tabular-nums">{padIndex(index)}</span>
            <span className="truncate text-xs text-fg">{song.title}</span>
          </div>
        ))}
        <div
          className="timeline-head pointer-events-none absolute inset-y-0 z-20 w-px bg-accent"
          style={{ left: `${progress}%` }}
        ><span className="absolute top-1/2 left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent shadow-[0_0_0_1px_rgba(255,255,255,.35)]" /></div>
      </div>
    </div>
  );
}
