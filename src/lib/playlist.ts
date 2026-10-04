export type LookId = "glass" | "night" | "poster";
export type WeatherId = "none" | "rain" | "drops" | "snow" | "grain";
export type SongSource = "demo" | "file" | "none";

export type Song = {
  id: string;
  title: string;
  artist: string;
  duration: number;
  color: string;
  source: SongSource;
  tone: number;
};

export const MAX_SONGS = 12;

export const LOOKS: { id: LookId; label: string; hint: string }[] = [
  { id: "poster", label: "Mẫu 1", hint: "Ảnh nền mờ. Bìa album xoay chậm bên trái, không đổi khi sang bài." },
  { id: "night", label: "Mẫu 2", hint: "12 bài trên cửa sổ đêm, hàng nút sát hồ. Hồ phản chiếu cả khung." },
  { id: "glass", label: "Mẫu 3", hint: "Ảnh đại diện bên phải. 12 bìa nằm trong khung kính. Nền mờ phía sau." },
];

export const WEATHERS: { id: WeatherId; label: string }[] = [
  { id: "none", label: "Không" },
  { id: "rain", label: "Mưa nhẹ" },
  { id: "drops", label: "Kính mưa" },
  { id: "snow", label: "Tuyết" },
  { id: "grain", label: "Hạt phim" },
];

export const DISC = ["#c8ccd4", "#d4b483", "#a8b0a4", "#b7a8b0", "#9aabb8", "#cbbba4"];

export const DEMO_SONGS: Song[] = [
  { id: "demo-1", title: "Mưa trên kính", artist: "SoraSleep", duration: 12, color: "#d4b483", source: "demo", tone: 0 },
  { id: "demo-2", title: "Đèn phố khuya", artist: "Phòng thu đêm", duration: 11, color: "#8eb4c4", source: "demo", tone: 1 },
  { id: "demo-3", title: "Hồ không tên", artist: "SoraSleep", duration: 13, color: "#7f8f78", source: "demo", tone: 2 },
  { id: "demo-4", title: "Gió qua sân", artist: "Khách", duration: 10, color: "#c4a4b0", source: "demo", tone: 3 },
  { id: "demo-5", title: "Bản nháp cuối", artist: "SoraSleep", duration: 12, color: "#9aa8c4", source: "demo", tone: 4 },
  { id: "demo-6", title: "Sau cơn mưa", artist: "Phòng thu đêm", duration: 11, color: "#cbbba4", source: "demo", tone: 5 },
  { id: "demo-7", title: "Phòng trống", artist: "SoraSleep", duration: 12, color: "#d08a62", source: "demo", tone: 0 },
  { id: "demo-8", title: "Khuya thứ hai", artist: "Khách", duration: 10, color: "#6f8fbf", source: "demo", tone: 1 },
  { id: "demo-9", title: "Ánh đèn cuối", artist: "Phòng thu đêm", duration: 13, color: "#c46b6b", source: "demo", tone: 2 },
  { id: "demo-10", title: "Không nói gì", artist: "SoraSleep", duration: 11, color: "#8d7eb0", source: "demo", tone: 3 },
  { id: "demo-11", title: "Mùa cửa sổ", artist: "Khách", duration: 12, color: "#6e9a86", source: "demo", tone: 4 },
  { id: "demo-12", title: "Băng ghế đá", artist: "Phòng thu đêm", duration: 10, color: "#c9a15b", source: "demo", tone: 5 },
];

export function totalDuration(songs: Song[]) {
  return songs.reduce((sum, song) => sum + Math.max(0, song.duration), 0);
}

export function locate(songs: Song[], time: number) {
  const total = totalDuration(songs);
  const t = songs.length ? Math.max(0, Math.min(time, Math.max(0, total))) : 0;
  let start = 0;
  for (let index = 0; index < songs.length; index++) {
    const duration = Math.max(0.001, songs[index].duration);
    if (t < start + duration || index === songs.length - 1) {
      return { index, local: Math.min(duration, Math.max(0, t - start)), start, total };
    }
    start += duration;
  }
  return { index: 0, local: 0, start: 0, total };
}

export function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function padIndex(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function parseLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+[-–—|]\s+/);
      if (parts.length >= 2) {
        return { title: parts[0] ?? line, artist: parts.slice(1).join(" - ") };
      }
      return { title: line, artist: "" };
    });
}

export function titleFromFile(name: string) {
  const base = name.split(/[/\\]/).pop() ?? name;
  const title = base.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return title || "Bài mới";
}
