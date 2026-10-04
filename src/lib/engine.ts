import { loadAudio, peakKey } from "@/lib/idb-audio";
import { locate, totalDuration, type Song } from "@/lib/playlist";
import { synthSong } from "@/lib/synth";

class PlaylistEngine {
  ctx: AudioContext | null = null;
  gain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  raw = new Map<string, ArrayBuffer>();
  peaks = new Map<string, Float32Array>();
  decodedQueue: string[] = [];
  songs: Song[] = [];
  source: AudioBufferSourceNode | null = null;
  timer = 0;
  prefetch = 0;
  loadingId = "";
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

  buffer(id: string) {
    return this.buffers.get(id);
  }

  bytes(id: string) {
    return this.raw.get(id);
  }

  peaksOf(id: string) {
    return this.peaks.get(id);
  }

  setPeaks(id: string, data: Float32Array) {
    this.peaks.set(id, data);
  }

  has(id: string) {
    return this.buffers.has(id);
  }

  setBuffer(id: string, buffer: AudioBuffer) {
    this.buffers.set(id, buffer);
    this.keepDecoded(id);
  }

  remember(id: string, data: ArrayBuffer) {
    this.raw.set(id, data);
  }

  forget(id: string) {
    this.buffers.delete(id);
    this.raw.delete(id);
    this.peaks.delete(id);
    this.decodedQueue = this.decodedQueue.filter((item) => item !== id);
  }

  /** Decode at most the song you are hearing. Packed Opus stays small; PCM does not. */
  async hold(song: Song) {
    if (song.source === "demo") {
      if (!this.buffers.has(song.id)) {
        this.setBuffer(song.id, synthSong(this.ensure(), song.tone, song.duration));
      } else {
        this.keepDecoded(song.id);
      }
      return;
    }
    if (song.source !== "file") return;
    if (this.buffers.has(song.id)) {
      this.keepDecoded(song.id);
      return;
    }
    let raw = this.raw.get(song.id);
    if (!raw) {
      try {
        raw = await loadAudio(song.id);
      } catch {
        raw = undefined;
      }
      if (raw) this.remember(song.id, raw);
    }
    if (!raw) return;
    if (!this.peaks.has(song.id)) {
      try {
        const packed = await loadAudio(peakKey(song.id));
        if (packed) this.peaks.set(song.id, new Float32Array(packed));
      } catch {
        /* wave can stay flat */
      }
    }
    const copy = raw.slice(0);
    this.raw.delete(song.id);
    const buffer = await this.ensure().decodeAudioData(copy);
    this.setBuffer(song.id, buffer);
  }

  private keepDecoded(id: string) {
    this.decodedQueue = this.decodedQueue.filter((item) => item !== id);
    this.decodedQueue.push(id);
    while (this.decodedQueue.length > 2) {
      const drop = this.decodedQueue.shift();
      if (drop && drop !== id) this.buffers.delete(drop);
    }
  }

  async ensureSongs(songs: Song[]) {
    const ctx = this.ensure();
    for (const song of songs) {
      if (song.source !== "demo") continue;
      if (this.buffers.has(song.id)) {
        this.keepDecoded(song.id);
        continue;
      }
      if (this.decodedQueue.length >= 2) break;
      this.setBuffer(song.id, synthSong(ctx, song.tone, song.duration));
      await new Promise((resolve) => setTimeout(resolve, 0));
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
    if (this.prefetch) {
      window.clearTimeout(this.prefetch);
      this.prefetch = 0;
    }
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
    if (!buffer && song.source !== "none") {
      if (this.loadingId === song.id) return;
      this.loadingId = song.id;
      void this.hold(song)
        .finally(() => {
          if (this.loadingId === song.id) this.loadingId = "";
        })
        .then(() => {
          if (token !== this.token || !this.playing) return;
          if (!this.buffers.has(song.id)) {
            const remain = Math.max(0.05, song.duration - locate(songs, this.now()).local);
            this.timer = window.setTimeout(goNext, remain * 1000);
            return;
          }
          this.arm(this.now(), token);
        });
      return;
    }
    const upcoming = songs[loc.index + 1];
    if (upcoming && upcoming.source !== "none" && !this.buffers.has(upcoming.id)) {
      const wait = Math.max(0, (song.duration - loc.local - 20) * 1000);
      this.prefetch = window.setTimeout(() => {
        if (token !== this.token) return;
        void this.hold(upcoming);
      }, wait);
    }

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
    if (this.prefetch) {
      window.clearTimeout(this.prefetch);
      this.prefetch = 0;
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
