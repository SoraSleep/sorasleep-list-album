import { drawList } from "@/lib/draw-list";
import { engine } from "@/lib/engine";
import { locate } from "@/lib/playlist";
import { useProject } from "@/lib/store";

let cancel = false;

export function cancelExport() {
  cancel = true;
}

function mime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportPlaylist(limitSeconds?: number) {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Trình xem này không xuất được video.");
  }
  const state = useProject.getState();
  if (!state.songs.length) throw new Error("Chưa có bài hát.");
  const ctx = engine.ensure();
  if (ctx.state === "suspended") await ctx.resume();
  await engine.ensureSongs(state.songs);
  const located = locate(state.songs, 0);
  const total = located.total;
  const dur = Math.max(0.4, Math.min(total, limitSeconds ?? total));

  const wide = state.aspect === "wide";
  const canvas = document.createElement("canvas");
  canvas.width = wide ? 1280 : 720;
  canvas.height = wide ? 720 : 1280;
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("Không tạo được khung hình.");

  const stream = canvas.captureStream(30);
  const audio = engine.attachRecorder();
  const track = audio.getAudioTracks()[0];
  if (track) stream.addTrack(track);

  const type = mime();
  const rec = new MediaRecorder(
    stream,
    type ? { mimeType: type, videoBitsPerSecond: 4_500_000, audioBitsPerSecond: 160_000 } : undefined,
  );
  const chunks: Blob[] = [];
  rec.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const done = new Promise<Blob>((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
    rec.onerror = () => reject(new Error("Ghi video thất bại."));
  });

  cancel = false;
  useProject.setState({ exporting: true, exportProgress: 0, playing: true, currentTime: 0 });
  engine.onEnded = () => {
    useProject.setState({ playing: false, currentTime: engine.now() });
  };

  try {
    engine.playFrom(0, useProject.getState().songs);
    rec.start(250);

    let smooth = 0;
    let last = performance.now();
    await new Promise<void>((resolve) => {
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const live = useProject.getState();
        const t = Math.min(dur, engine.now());
        const place = locate(live.songs, t);
        smooth += (place.index - smooth) * (1 - Math.exp(-dt * 2.4 * live.glide));
        drawList(pen, {
          songs: live.songs,
          index: place.index,
          local: place.local,
          total: place.total,
          time: t,
          smooth,
          motion: t,
          look: live.look,
          name: live.name,
          showArtist: live.showArtist,
          showWave: live.showWave,
          wave: engine.wave(),
          glide: live.glide,
        });
        useProject.setState({ exportProgress: dur > 0 ? t / dur : 1, currentTime: t });
        if (cancel || t >= dur - 0.04) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });

    if (rec.state !== "inactive") rec.stop();
    const blob = await done;
    if (!cancel) {
      const safe = (useProject.getState().name || "playlist").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      download(blob, `${safe || "SoraSleep-List"}.webm`);
    }
  } finally {
    engine.pause();
    engine.detachRecorder();
    if (rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
    useProject.setState({
      exporting: false,
      exportProgress: cancel ? 0 : 1,
      playing: false,
      currentTime: engine.now(),
    });
  }
}
