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
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  const long = Math.max(cw, ch);
  const scale = long > 1280 ? 1280 / long : 1;
  const bw = Math.max(2, Math.round(cw * scale));
  const bh = Math.max(2, Math.round(ch * scale));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
}

export function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paceRef = useRef<HTMLElement>(null);
  const smooth = useRef(0);
  const motion = useRef(0);
  const songs = useProject((s) => s.songs);
  const currentTime = useProject((s) => s.currentTime);
  const name = useProject((s) => s.name);
  const titleA = useProject((s) => s.titleA);
  const titleB = useProject((s) => s.titleB);
  const place = locate(songs, currentTime);
  const song = songs[place.index];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let lastUi = 0;
    let paceWindow = last;
    let paceFrames = 0;
    let paceDraw = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) motion.current += dt;
      const live = useProject.getState();
      if (live.exporting) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const t = engine.playing ? engine.now() : live.currentTime;
      const at = locate(live.songs, t);
      if (reduced) smooth.current = at.index;
      else smooth.current += (at.index - smooth.current) * (1 - Math.exp(-dt * 2.6 * live.glide));
      if (now - lastDraw >= 1000 / 30) {
        lastDraw = now;
        fit(canvas, live.aspect === "wide" ? 16 / 9 : 9 / 16);
        if (canvas.width > 2 && canvas.height > 2) {
          const drawAt = performance.now();
          drawList(ctx, {
            songs: live.songs,
            index: at.index,
            local: at.local,
            total: at.total,
            time: t,
            smooth: smooth.current,
            motion: motion.current,
            look: live.look,
            weather: live.weather,
            fx: live.fx,
            bg: live.bg,
            name: live.name,
            titleA: live.titleA,
            titleB: live.titleB,
            caption: live.caption,
            artist: live.artist,
            showArtist: live.showArtist,
            showWave: live.showWave,
            wave: engine.wave(),
            glide: live.glide,
          });
          paceFrames += 1;
          paceDraw += performance.now() - drawAt;
        }
      }
      if (now - paceWindow >= 1000 && paceFrames > 0 && paceRef.current) {
        const fps = (paceFrames * 1000) / (now - paceWindow);
        const draw = paceDraw / paceFrames;
        paceRef.current.textContent = ` · ${Math.round(fps)} fps · ${Math.round(draw)} ms`;
        paceWindow = now;
        paceFrames = 0;
        paceDraw = 0;
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
          </>
        ) : (
          "Thêm bài hát để chạy danh sách"
        )}
        {([titleA, titleB].filter(Boolean).join(" ") || name) ? (
          <span className="text-faint"> · {[titleA, titleB].filter(Boolean).join(" ") || name}</span>
        ) : null}
        <span ref={paceRef} data-pace className="text-faint" />
      </p>
    </div>
  );
}
