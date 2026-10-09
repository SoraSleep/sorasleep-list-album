import { useEffect, useRef, useState } from "react";
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
  const [assetsReady, setAssetsReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
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
    const onReady = () => setAssetsReady(true);
    const fallback = window.setTimeout(onReady, 3000);
    window.addEventListener("sorasleep:assets-ready", onReady, { once: true });
    return () => {
      window.clearTimeout(fallback);
      window.removeEventListener("sorasleep:assets-ready", onReady);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) return;
    const targetCanvas = canvas;
    const targetContext = ctx;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = false;
    let dirty = true;
    let last = performance.now();
    let lastDraw = 0;
    let lastUi = 0;
    let paceWindow = last;
    let paceFrames = 0;
    let paceDraw = 0;
    const setActivity = (active: boolean) => {
      stage.dataset.animationActive = active ? "true" : "false";
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setActivity(false);
    };
    const start = () => {
      if (raf || !visible || document.visibilityState !== "visible") return;
      last = performance.now();
      setActivity(true);
      raf = requestAnimationFrame(loop);
    };
    function loop(now: number) {
      raf = 0;
      if (!visible || document.visibilityState !== "visible") {
        setActivity(false);
        return;
      }
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
      const frameInterval = reduced ? (engine.playing ? 1000 / 8 : Number.POSITIVE_INFINITY) : 1000 / 30;
      if (dirty || now - lastDraw >= frameInterval) {
        dirty = false;
        lastDraw = now;
        fit(targetCanvas, live.aspect === "wide" ? 16 / 9 : 9 / 16);
        if (targetCanvas.width > 2 && targetCanvas.height > 2) {
          const drawAt = performance.now();
          drawList(targetContext, {
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
      if (reduced && !engine.playing && !dirty) {
        setActivity(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    }
    const intersection = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0);
        if (visible) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    const resize = new ResizeObserver(() => {
      dirty = true;
      fit(targetCanvas, useProject.getState().aspect === "wide" ? 16 / 9 : 9 / 16);
      start();
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    const unsub = useProject.subscribe(() => {
      dirty = true;
      start();
    });
    intersection.observe(stage);
    resize.observe(stage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      intersection.disconnect();
      resize.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
    };
  }, []);

  return (
    <div ref={stageRef} data-animation-active="false" className="flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-64 flex-1 items-center justify-center px-3 pt-3">
        <canvas ref={canvasRef} className="preview-canvas rounded-lg bg-bg" />
        {!assetsReady ? (
          <div className="preview-loading pointer-events-none absolute rounded-lg border border-border bg-bg/90 px-4 py-3 text-center shadow-2xl backdrop-blur-sm">
            <span className="mx-auto mb-2 block h-1 w-24 overflow-hidden rounded-full bg-subtle"><span className="block h-full w-1/2 rounded-full bg-fg" /></span>
            <span className="text-xs text-muted">Đang dựng khung xem trước…</span>
          </div>
        ) : null}
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
