import { create } from "zustand";
import { DEMO_SONGS, DISC, MAX_SONGS, WEATHERS, type LookId, type Song, type SongSource, type WeatherId } from "@/lib/playlist";

const KEY = "sorasleep-list-v1";
const POSTER_ONCE = "sorasleep-poster-once";
const DEMO_FILLED = "sorasleep-demo-12";
const NIGHT_ONCE = "sorasleep-night-once";
const GLASS_ONCE = "sorasleep-glass-once";
const TITLE_OWN = "sorasleep-title-own";

type Persisted = {
  name: string;
  titleA: string;
  titleB: string;
  caption: string;
  artist: string;
  aspect: "wide" | "tall";
  look: LookId;
  weather: WeatherId;
  fx: number;
  bg: number;
  glide: number;
  showArtist: boolean;
  showWave: boolean;
  songs: Song[];
};

type State = Persisted & {
  currentTime: number;
  playing: boolean;
  exporting: boolean;
  exportProgress: number;
  exportDrawMs: number;
  exportEncodeMs: number;
  setName: (name: string) => void;
  setTitleA: (titleA: string) => void;
  setTitleB: (titleB: string) => void;
  setCaption: (caption: string) => void;
  setArtist: (artist: string) => void;
  setAspect: (aspect: "wide" | "tall") => void;
  setLook: (look: LookId) => void;
  setWeather: (weather: WeatherId) => void;
  setFx: (fx: number) => void;
  setBg: (bg: number) => void;
  setGlide: (glide: number) => void;
  setShowArtist: (showArtist: boolean) => void;
  setShowWave: (showWave: boolean) => void;
  patchSong: (id: string, patch: Partial<Song>) => void;
  addSongs: (songs: Song[]) => void;
  removeSong: (id: string) => void;
  moveSong: (id: string, dir: -1 | 1) => void;
  replaceSongs: (songs: Song[]) => void;
};

const LOOKS: LookId[] = ["glass", "night", "poster"];

function blankSong(index: number, partial: Partial<Song> & Pick<Song, "title">): Song {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title,
    artist: partial.artist ?? "",
    duration: partial.duration ?? 15,
    color: partial.color ?? DISC[index % DISC.length] ?? DISC[0],
    source: partial.source ?? "none",
    tone: partial.tone ?? index % 6,
  };
}

export function makeSong(index: number, partial: Partial<Song> & Pick<Song, "title">) {
  return blankSong(index, partial);
}

const LEGACY_DEMO = [
  "Mưa trên kính",
  "Đèn phố khuya",
  "Hồ không tên",
  "Gió qua sân",
  "Bản nháp cuối",
  "Sau cơn mưa",
];

function untouchedDemo(songs: Song[]) {
  return (
    songs.length === LEGACY_DEMO.length &&
    songs.every((song, index) => song.id === `demo-${index + 1}` && song.title === LEGACY_DEMO[index])
  );
}

function isLook(value: unknown): value is LookId {
  return typeof value === "string" && LOOKS.includes(value as LookId);
}

function isWeather(value: unknown): value is WeatherId {
  return WEATHERS.some((item) => item.id === value);
}

function isSource(value: unknown): value is SongSource {
  return value === "demo" || value === "file" || value === "none";
}

function sanitizeSongs(value: unknown): Song[] | null {
  if (!Array.isArray(value)) return null;
  const songs: Song[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<Song>;
    if (typeof row.id !== "string" || typeof row.title !== "string") continue;
    songs.push({
      id: row.id,
      title: row.title.slice(0, 80),
      artist: typeof row.artist === "string" ? row.artist.slice(0, 80) : "",
      duration: typeof row.duration === "number" && row.duration > 0.4 ? row.duration : 15,
      color: typeof row.color === "string" ? row.color : DISC[songs.length % DISC.length]!,
      source: isSource(row.source) ? row.source : row.id.startsWith("demo-") ? "demo" : "none",
      tone: typeof row.tone === "number" ? row.tone : songs.length % 6,
    });
  }
  return songs;
}

function clipText(value: unknown, max: number) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function restoreProject() {
  try {
    const once = localStorage.getItem(POSTER_ONCE) !== "1";
    const fill = localStorage.getItem(DEMO_FILLED) !== "1";
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      if (once) localStorage.setItem(POSTER_ONCE, "1");
      if (fill) localStorage.setItem(DEMO_FILLED, "1");
      if (localStorage.getItem(NIGHT_ONCE) !== "1") localStorage.setItem(NIGHT_ONCE, "1");
      if (localStorage.getItem(GLASS_ONCE) !== "1") localStorage.setItem(GLASS_ONCE, "1");
      localStorage.setItem(TITLE_OWN, "1");
      return;
    }
    const data = JSON.parse(raw) as Partial<Persisted>;
    const songs = sanitizeSongs(data.songs);
    const kept = songs && songs.length ? songs : DEMO_SONGS;
    const owned = localStorage.getItem(TITLE_OWN) === "1";
    let name = clipText(data.name, 60);
    let titleA = clipText(data.titleA, 36);
    let titleB = clipText(data.titleB, 42);
    let caption = clipText(data.caption, 72);
    const artist = clipText(data.artist, 80);
    if (!owned) {
      const stock = !name || name === "Nhạc Chill" || name === "Đêm phòng thu";
      if (stock) name = "";
      else if (!titleA && !titleB) {
        const parts = name.trim().split(/\s+/);
        titleA = (parts[0] ?? "").slice(0, 36);
        titleB = parts.slice(1).join(" ").slice(0, 42);
      }
    }
    const showGlass = localStorage.getItem(GLASS_ONCE) !== "1";
    useProject.setState({
      name,
      titleA,
      titleB,
      caption,
      artist,
      aspect: data.aspect === "tall" ? "tall" : "wide",
      look: showGlass ? "glass" : isLook(data.look) ? data.look : "glass",
      weather: isWeather(data.weather) ? data.weather : "none",
      fx: typeof data.fx === "number" ? Math.min(1, Math.max(0, data.fx)) : 1,
      bg: typeof data.bg === "number" ? Math.min(1, Math.max(0, data.bg)) : 1,
      glide: typeof data.glide === "number" ? Math.min(2.4, Math.max(0.45, data.glide)) : 1,
      showArtist: data.showArtist !== false,
      showWave: data.showWave !== false,
      songs: fill && untouchedDemo(kept) ? DEMO_SONGS : kept,
      currentTime: 0,
      playing: false,
    });
    if (once) localStorage.setItem(POSTER_ONCE, "1");
    if (fill) localStorage.setItem(DEMO_FILLED, "1");
    if (showGlass) localStorage.setItem(GLASS_ONCE, "1");
    if (!owned) {
      localStorage.setItem(TITLE_OWN, "1");
      persistSnapshot(useProject.getState());
    }
  } catch {
    /* keep demo */
  }
}

export function persistSnapshot(state: Persisted) {
  const slim: Persisted = {
    name: state.name,
    titleA: state.titleA,
    titleB: state.titleB,
    caption: state.caption,
    artist: state.artist,
    aspect: state.aspect,
    look: state.look,
    weather: state.weather,
    fx: state.fx,
    bg: state.bg,
    glide: state.glide,
    showArtist: state.showArtist,
    showWave: state.showWave,
    songs: state.songs,
  };
  localStorage.setItem(KEY, JSON.stringify(slim));
}

export const useProject = create<State>((set) => ({
  name: "",
  titleA: "",
  titleB: "",
  caption: "",
  artist: "",
  aspect: "wide",
  look: "glass",
  weather: "none",
  fx: 1,
  bg: 1,
  glide: 1,
  showArtist: true,
  showWave: true,
  songs: DEMO_SONGS,
  currentTime: 0,
  playing: false,
  exporting: false,
  exportProgress: 0,
  exportDrawMs: 0,
  exportEncodeMs: 0,
  setName: (name) => set({ name: name.slice(0, 60) }),
  setTitleA: (titleA) => set({ titleA: titleA.slice(0, 36) }),
  setTitleB: (titleB) => set({ titleB: titleB.slice(0, 42) }),
  setCaption: (caption) => set({ caption: caption.slice(0, 72) }),
  setArtist: (artist) => set({ artist: artist.slice(0, 80) }),
  setAspect: (aspect) => set({ aspect }),
  setLook: (look) => set({ look }),
  setWeather: (weather) => set({ weather }),
  setFx: (fx) => set({ fx: Math.min(1, Math.max(0, fx)) }),
  setBg: (bg) => set({ bg: Math.min(1, Math.max(0, bg)) }),
  setGlide: (glide) => set({ glide }),
  setShowArtist: (showArtist) => set({ showArtist }),
  setShowWave: (showWave) => set({ showWave }),
  patchSong: (id, patch) =>
    set((state) => ({
      songs: state.songs.map((song) => (song.id === id ? { ...song, ...patch } : song)),
    })),
  addSongs: (songs) =>
    set((state) => ({
      songs: [...state.songs, ...songs].slice(0, MAX_SONGS),
    })),
  removeSong: (id) =>
    set((state) => ({
      songs: state.songs.filter((song) => song.id !== id),
    })),
  moveSong: (id, dir) =>
    set((state) => {
      const index = state.songs.findIndex((song) => song.id === id);
      const next = index + dir;
      if (index < 0 || next < 0 || next >= state.songs.length) return state;
      const songs = state.songs.slice();
      const [row] = songs.splice(index, 1);
      if (!row) return state;
      songs.splice(next, 0, row);
      return { songs };
    }),
  replaceSongs: (songs) => set({ songs: songs.slice(0, MAX_SONGS), currentTime: 0, playing: false }),
}));
