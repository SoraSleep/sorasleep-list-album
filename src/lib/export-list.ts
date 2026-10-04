import {
  ALL_FORMATS,
  AudioBufferSource,
  AudioSampleSink,
  BufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
  type StreamTargetChunk,
  type Target,
} from "mediabunny";
import { PEAK_HZ } from "@/lib/audio-pack";
import { drawList } from "@/lib/draw-list";
import { isDesktop } from "@/lib/desktop";
import { engine } from "@/lib/engine";
import { openExportFile, removeExportFile } from "@/lib/export-dir";
import { loadAudio } from "@/lib/idb-audio";
import { locate, type Song } from "@/lib/playlist";
import { useProject } from "@/lib/store";
import { synthSong } from "@/lib/synth";

let cancel = false;

function showExport(progress: number, drawMs: number, encodeMs: number) {
  const node = document.querySelector("[data-export-meter]");
  if (!node) return;
  node.textContent = `Hủy ${Math.round(progress * 100)}% · vẽ ${Math.round(drawMs)}ms · nén ${Math.round(encodeMs)}ms`;
}

export function cancelExport() {
  cancel = true;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}

function sliceBuffer(buffer: AudioBuffer, seconds: number) {
  const frames = Math.max(1, Math.min(buffer.length, Math.floor(seconds * buffer.sampleRate)));
  const out = new AudioBuffer({
    length: frames,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    out.getChannelData(channel).set(buffer.getChannelData(channel).subarray(0, frames));
  }
  return out;
}

function silence(seconds: number) {
  return new AudioBuffer({
    length: Math.max(1, Math.floor(seconds * 48000)),
    numberOfChannels: 2,
    sampleRate: 48000,
  });
}

function pulse(songs: Song[], time: number) {
  const bars = 28;
  const place = locate(songs, time);
  const song = songs[place.index];
  const peaks = song ? engine.peaksOf(song.id) : undefined;
  if (peaks && peaks.length) {
    const at = Math.floor(place.local * PEAK_HZ);
    const out: number[] = [];
    for (let i = 0; i < bars; i++) out.push(peaks[Math.min(peaks.length - 1, at + i)] ?? 0.12);
    return out;
  }
  const buffer = song ? engine.buffer(song.id) : undefined;
  if (!buffer) return Array.from({ length: bars }, () => 0.12);
  const data = buffer.getChannelData(0);
  const at = Math.floor(place.local * buffer.sampleRate);
  const hop = Math.max(1, Math.floor(buffer.sampleRate / 30 / bars));
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    let peak = 0;
    const base = at + i * hop;
    for (let j = 0; j < hop; j += 8) peak = Math.max(peak, Math.abs(data[base + j] ?? 0));
    out.push(Math.min(1, peak * 1.6));
  }
  return out;
}

type Sink = {
  target: Target;
  pull: () => Promise<Blob>;
  placed: boolean;
  filename: string;
};

function exportFilename() {
  const live = useProject.getState();
  const label = [live.titleA, live.titleB].filter(Boolean).join(" ") || live.name || "playlist";
  const safe = label.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${safe || "playlist"}-youtube.webm`;
}

/** Write the WebM straight to disk. A full list at 8 Mbps does not fit in RAM. */
async function openSink(seconds: number, filename: string): Promise<Sink> {
  const chosen = await openExportFile(filename).catch(() => null);
  if (isDesktop() && !chosen) throw new Error("Hãy chọn thư mục xuất.");
  if (chosen) {
    let closed = false;
    const finish = async () => {
      if (closed) return;
      closed = true;
      await chosen.writable.close();
    };
    const writable = new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        const copy = new Uint8Array(chunk.data);
        await chosen.writable.write({ type: "write", position: chunk.position, data: copy });
      },
      close: finish,
      async abort() {
        if (!closed) {
          closed = true;
          try {
            await chosen.writable.abort();
          } catch {
            try {
              await chosen.writable.close();
            } catch {
              /* already closed */
            }
          }
        }
        await removeExportFile(filename);
      },
    });
    return {
      target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      placed: true,
      filename,
      pull: async () => chosen.dir.getFileHandle(filename).then((file) => file.getFile()),
    };
  }
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle("youtube-export.webm", { create: true });
    const access = await handle.createWritable();
    let closed = false;
    const finish = async () => {
      if (closed) return;
      closed = true;
      await access.close();
    };
    const writable = new WritableStream<StreamTargetChunk>({
      async write(chunk) {
        const copy = new Uint8Array(chunk.data);
        await access.write({ type: "write", position: chunk.position, data: copy });
      },
      close: finish,
      async abort() {
        if (closed) return;
        closed = true;
        try {
          await access.abort();
        } catch {
          try {
            await access.close();
          } catch {
            /* already closed */
          }
        }
      },
    });
    return {
      target: new StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      placed: false,
      filename,
      pull: async () => handle.getFile(),
    };
  } catch {
    if (seconds > 20) {
      throw new Error("Hãy chọn thư mục xuất. Video dài không giữ trong bộ nhớ.");
    }
    const target = new BufferTarget();
    return {
      target,
      placed: false,
      filename,
      pull: async () => {
        if (!target.buffer) throw new Error("Không ghi được file.");
        return new Blob([target.buffer], { type: "video/webm" });
      },
    };
  }
}

/** Decode one packed song in short slices and mux it. The whole PCM is never kept. */
async function appendPacked(audio: AudioBufferSource, bytes: ArrayBuffer, seconds: number) {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  let filled = 0;
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return 0;
    const sink = new AudioSampleSink(track);
    for await (const sample of sink.samples(0, seconds)) {
      if (cancel) {
        sample.close();
        break;
      }
      const room = seconds - filled;
      if (room <= 0.001) {
        sample.close();
        break;
      }
      let piece = sample;
      if (sample.duration > room + 0.001) {
        const frames = Math.max(1, Math.min(sample.numberOfFrames, Math.floor(room * sample.sampleRate)));
        piece = sample.trim(0, frames);
        sample.close();
      }
      const decoded = piece.toAudioBuffer();
      const dur = decoded.duration;
      piece.close();
      await audio.add(decoded);
      filled += dur;
      if (filled >= seconds - 0.001) break;
    }
  } finally {
    input.dispose();
  }
  return filled;
}

async function encoderAccel(w: number, h: number): Promise<"prefer-hardware" | "prefer-software"> {
  if (typeof VideoEncoder === "undefined" || typeof VideoEncoder.isConfigSupported !== "function") {
    return "prefer-software";
  }
  try {
    const hw = await VideoEncoder.isConfigSupported({
      codec: "vp09.00.10.08",
      width: w,
      height: h,
      bitrate: 8_000_000,
      hardwareAcceleration: "prefer-hardware",
    });
    return hw.supported ? "prefer-hardware" : "prefer-software";
  } catch {
    return "prefer-software";
  }
}

export async function exportPlaylist(limitSeconds?: number): Promise<"folder" | "download" | "cancel"> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("Trình xem này không xuất được video YouTube.");
  }
  const state = useProject.getState();
  if (!state.songs.length) throw new Error("Chưa có bài hát.");
  await engine.ensureSongs(state.songs);
  const total = locate(state.songs, 0).total;
  const dur = Math.max(0.4, Math.min(total, limitSeconds ?? total));
  const wide = state.aspect === "wide";
  const canvas = document.createElement("canvas");
  canvas.width = wide ? 1920 : 1080;
  canvas.height = wide ? 1080 : 1920;
  const pen = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!pen) throw new Error("Không tạo được khung hình.");
  const accel = await encoderAccel(canvas.width, canvas.height);

  const sink = await openSink(dur, exportFilename());
  const output = new Output({ format: new WebMOutputFormat(), target: sink.target });
  const video = new CanvasSource(canvas, {
    codec: "vp9",
    quality: new Quality({ bitrate: 8_000_000, bitrateMode: "variable" }),
    keyFrameInterval: 2,
    latencyMode: limitSeconds == null ? "quality" : "realtime",
    hardwareAcceleration: accel,
    contentHint: "detail",
  });
  const audio = new AudioBufferSource({
    codec: "opus",
    quality: new Quality({ bitrate: 256_000, bitrateMode: "variable" }),
    transform: { numberOfChannels: 2, sampleRate: 48000 },
  });
  output.addVideoTrack(video);
  output.addAudioTrack(audio);

  cancel = false;
  useProject.setState({
    exporting: true,
    exportProgress: 0,
    exportDrawMs: 0,
    exportEncodeMs: 0,
    playing: false,
    currentTime: 0,
  });
  const fps = 30;
  const step = 1 / fps;
  const job = {
    songs: state.songs,
    look: state.look,
    weather: state.weather,
    fx: state.fx,
    bg: state.bg,
    name: state.name,
    titleA: state.titleA,
    titleB: state.titleB,
    caption: state.caption,
    artist: state.artist,
    showArtist: state.showArtist,
    showWave: state.showWave,
    glide: state.glide,
  };

  try {
    await output.start();
    let smooth = 0;
    let drawSum = 0;
    let encodeSum = 0;
    const frames = Math.max(1, Math.round(dur * fps));
    for (let frame = 0; frame < frames; frame++) {
      if (cancel) break;
      const t = Math.min(dur, frame * step);
      const place = locate(job.songs, t);
      smooth += (place.index - smooth) * (1 - Math.exp(-step * 2.4 * job.glide));
      const drawAt = performance.now();
      drawList(pen, {
        songs: job.songs,
        index: place.index,
        local: place.local,
        total: place.total,
        time: t,
        smooth,
        motion: t,
        look: job.look,
        weather: job.weather,
        fx: job.fx,
        bg: job.bg,
        name: job.name,
        titleA: job.titleA,
        titleB: job.titleB,
        caption: job.caption,
        artist: job.artist,
        showArtist: job.showArtist,
        showWave: job.showWave,
        wave: pulse(job.songs, t),
        glide: job.glide,
      });
      const drawn = performance.now();
      await video.add(t, step, { keyFrame: frame % 60 === 0 });
      const encoded = performance.now();
      drawSum += drawn - drawAt;
      encodeSum += encoded - drawn;
      if (frame % 10 === 0) {
        showExport((t / dur) * 0.86, drawSum / (frame + 1), encodeSum / (frame + 1));
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (!cancel) {
      let cursor = 0;
      const songs = useProject.getState().songs;
      for (let index = 0; index < songs.length; index++) {
        if (cancel || cursor >= dur - 0.01) break;
        const song = songs[index]!;
        const take = Math.min(song.duration, dur - cursor);
        let filled = 0;
        if (song.source === "file") {
          const bytes = engine.bytes(song.id) ?? (await loadAudio(song.id)) ?? undefined;
          if (bytes) filled = await appendPacked(audio, bytes, take);
        } else if (song.source === "demo") {
          const buffer = synthSong(engine.ensure(), song.tone, take);
          if (buffer.duration > 0.02) {
            const slice = sliceBuffer(buffer, Math.min(take, buffer.duration));
            filled = slice.duration;
            await audio.add(slice);
          }
        } else {
          const buffer = engine.buffer(song.id);
          if (buffer && buffer.duration > 0.02) {
            const slice = sliceBuffer(buffer, Math.min(take, buffer.duration));
            filled = slice.duration;
            await audio.add(slice);
          }
        }
        if (take - filled > 0.05) await audio.add(silence(take - filled));
        cursor += song.duration;
        showExport(0.86 + 0.14 * ((index + 1) / songs.length), drawSum / frames, encodeSum / frames);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      video.close();
      audio.close();
      await output.finalize();
      const file = await sink.pull();
      if (!sink.placed) download(file, sink.filename);
      return sink.placed ? "folder" : "download";
    }
    video.close();
    audio.close();
    await output.cancel();
    return "cancel";
  } catch (err) {
    try {
      await output.cancel();
    } catch {
      /* already closed */
    }
    throw err instanceof Error ? err : new Error("Xuất video thất bại");
  } finally {
    useProject.setState({
      exporting: false,
      exportProgress: cancel ? 0 : 1,
      playing: false,
    });
  }
}
