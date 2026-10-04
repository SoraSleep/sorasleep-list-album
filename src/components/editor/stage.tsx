import { useEffect, useRef } from "react";
import { drawList } from "@/lib/draw-list";
import { engine } from "@/lib/engine";
import { locate, padIndex } from "@/lib/playlist";
import { useProject } from "@/lib/store";

function fit(canvas: HTMLCanvasElement, aspect: number) {
  const parent = canvas.parentElement;
  if (!parent) return;
  const boxW = parent.clientWidth;
  const boxH = parent.clientHeight;
  if (boxW < 8 || boxH < 8) return;
  let cw = boxW;
  let ch = cw / aspect;
  if (ch > boxH) {
    ch = boxH;
    cw = ch * aspect;
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const bw = Math.max(2, Math.round(cw * dpr));
  const bh = Math.max(2, Math.round(ch * dpr));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
}

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const smooth = useRef(0);
  const motion = useRef(0);
  const songs = useProject((s) => s.songs);
  const currentTime = useProject((s) => s.currentTime);
  const name = useProject((s) => s.name);
  const place = locate(songs, currentTime);
  const song = songs[place.index];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let lastUi = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) motion.current += dt;
      const live = useProject.getState();
      fit(canvas, live.aspect === "wide" ? 16 / 9 : 9 / 16);
      const t = engine.playing ? engine.now() : live.currentTime;
      const at = locate(live.songs, t);
      if (reduced) smooth.current = at.index;
      else smooth.current += (at.index - smooth.current) * (1 - Math.exp(-dt * 2.6 * live.glide));
      const ctx = canvas.getContext("2d");
      if (ctx && canvas.width > 2 && canvas.height > 2) {
        drawList(ctx, {
          songs: live.songs,
          index: at.index,
          local: at.local,
          total: at.total,
          time: t,
          smooth: smooth.current,
          motion: motion.current,
          look: live.look,
          name: live.name,
          showArtist: live.showArtist,
          showWave: live.showWave,
          wave: engine.wave(),
          glide: live.glide,
        });
      }
      if (engine.playing && now - lastUi > 120) {
        lastUi = now;
        useProject.setState({ currentTime: t });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-64 flex-1 items-center justify-center px-3 pt-3">
        <canvas ref={canvasRef} className="rounded-lg bg-bg" />
      </div>
      <p className="truncate px-4 py-2 text-sm text-muted">
        {song ? (
          <>
            <span className="font-display font-semibold text-accent">{padIndex(place.index)}</span>
            <span className="text-fg"> {song.title}</span>
            {song.artist ? ` — ${song.artist}` : ""}
          </>
        ) : (
          "Thêm bài hát để chạy danh sách"
        )}
        {name ? <span className="text-faint"> · {name}</span> : null}
      </p>
    </div>
  );
}
