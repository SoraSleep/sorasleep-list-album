import { loadAudio } from "@/lib/idb-audio";
import { locate, totalDuration, type Song } from "@/lib/playlist";
import { synthSong } from "@/lib/synth";

class PlaylistEngine {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  raw = new Map<string, ArrayBuffer>();
  songs: Song[] = [];
  source: AudioBufferSourceNode | null = null;
  timer = 0;
  token = 0;
  playing = false;
  origin = 0;
  startedAt = 0;
  recDest: MediaStreamAudioDestinationNode | null = null;
  bin = new Uint8Array(0);
  onEnded: (() => void) | null = null;

  ensure() {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      this.ctx = ctx;
      this.gain = gain;
      this.analyser = analyser;
    }
    return this.ctx;
  }

  now() {
    if (!this.playing || !this.ctx) return this.origin;
    return this.origin + (this.ctx.currentTime - this.startedAt);
  }

  has(id: string) {
    return this.buffers.has(id);
  }

  setBuffer(id: string, buffer: AudioBuffer) {
    this.buffers.set(id, buffer);
  }

  remember(id: string, data: ArrayBuffer) {
    this.raw.set(id, data);
  }

  forget(id: string) {
    this.buffers.delete(id);
    this.raw.delete(id);
  }

  async ensureSongs(songs: Song[]) {
    const ctx = this.ensure();
    for (const song of songs) {
      if (this.buffers.has(song.id)) continue;
      if (song.source === "demo") {
        this.buffers.set(song.id, synthSong(ctx, song.tone, song.duration));
        await new Promise((resolve) => setTimeout(resolve, 0));
        continue;
      }
      let raw = this.raw.get(song.id);
      if (!raw && song.source === "file") {
        try {
          raw = await loadAudio(song.id);
          if (raw) this.raw.set(song.id, raw);
        } catch {
          raw = undefined;
        }
      }
      if (raw) {
        const copy = raw.slice(0);
        const buffer = await ctx.decodeAudioData(copy);
        this.buffers.set(song.id, buffer);
      }
    }
  }

  playFrom(time: number, songs: Song[]) {
    this.stopSource();
    this.songs = songs;
    const ctx = this.ensure();
    const total = totalDuration(songs);
    const t = Math.max(0, Math.min(time, Math.max(0, total - 0.02)));
    this.origin = t;
    this.startedAt = ctx.currentTime;
    this.playing = true;
    this.token += 1;
    this.arm(t, this.token);
  }

  pause() {
    if (this.playing && this.ctx) {
      this.origin = this.origin + (this.ctx.currentTime - this.startedAt);
    }
    this.playing = false;
    this.token += 1;
    this.stopSource();
  }

  wave() {
    const analyser = this.analyser;
    if (!analyser) return [] as number[];
    const size = analyser.frequencyBinCount;
    if (this.bin.length !== size) this.bin = new Uint8Array(size);
    analyser.getByteFrequencyData(this.bin);
    const bars = 28;
    const step = Math.max(1, Math.floor(size / bars));
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += this.bin[i * step + j] ?? 0;
      out.push(sum / step / 255);
    }
    return out;
  }

  attachRecorder() {
    this.ensure();
    this.detachRecorder();
    const dest = this.ctx!.createMediaStreamDestination();
    this.gain!.connect(dest);
    this.recDest = dest;
    return dest.stream;
  }

  detachRecorder() {
    if (this.recDest && this.gain) {
      try {
        this.gain.disconnect(this.recDest);
      } catch {
        /* already detached */
      }
    }
    this.recDest = null;
  }

  private finish(token: number) {
    if (token !== this.token) return;
    this.playing = false;
    this.origin = totalDuration(this.songs);
    this.token += 1;
    this.stopSource();
    this.onEnded?.();
  }

  private arm(time: number, token: number) {
    if (token !== this.token || !this.playing || !this.ctx) return;
    const songs = this.songs;
    const loc = locate(songs, time);
    const song = songs[loc.index];
    const total = loc.total;
    if (!song || total <= 0) {
      this.finish(token);
      return;
    }
    const nextAt = loc.start + song.duration;
    const goNext = () => {
      if (token !== this.token) return;
      if (nextAt >= total - 0.03) {
        this.finish(token);
        return;
      }
      this.origin = nextAt;
      this.startedAt = this.ctx!.currentTime;
      this.arm(nextAt, token);
    };

    const buffer = this.buffers.get(song.id);
    if (!buffer) {
      const remain = Math.max(0.05, song.duration - loc.local);
      this.timer = window.setTimeout(goNext, remain * 1000);
      return;
    }

    const offset = Math.max(0, Math.min(loc.local, Math.max(0, buffer.duration - 0.05)));
    if (loc.local >= buffer.duration - 0.05) {
      goNext();
      return;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain!);
    this.source = src;
    src.onended = () => {
      if (token !== this.token || this.source !== src) return;
      goNext();
    };
    src.start(0, offset);
  }

  private stopSource() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = 0;
    }
    const src = this.source;
    this.source = null;
    if (!src) return;
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* not started */
    }
  }
}

export const engine = new PlaylistEngine();
