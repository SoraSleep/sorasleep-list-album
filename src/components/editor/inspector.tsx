import { Plates } from "@/components/editor/plates";
import { LOOKS, WEATHERS, type LookId } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function Inspector() {
  const look = useProject((s) => s.look);
  const weather = useProject((s) => s.weather);
  const fx = useProject((s) => s.fx);
  const bg = useProject((s) => s.bg);
  const glide = useProject((s) => s.glide);
  const showArtist = useProject((s) => s.showArtist);
  const showWave = useProject((s) => s.showWave);
  const setLook = useProject((s) => s.setLook);
  const setWeather = useProject((s) => s.setWeather);
  const setFx = useProject((s) => s.setFx);
  const setBg = useProject((s) => s.setBg);
  const setGlide = useProject((s) => s.setGlide);
  const setShowArtist = useProject((s) => s.setShowArtist);
  const setShowWave = useProject((s) => s.setShowWave);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
      <TitleFields />
      <Plates />
      <div className="px-4 py-3">
        <p className="font-display text-sm font-semibold">Hiệu ứng</p>
        <p className="text-xs text-faint">Chọn cách danh sách chạy trên video.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3">
        {LOOKS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setLook(item.id)}
            className={`rounded-md border px-3 py-3 text-left ${
              look === item.id ? "border-accent bg-subtle" : "border-border bg-bg"
            }`}
          >
            <span className="block font-display text-sm font-semibold text-fg">{item.label}</span>
            <LookMark id={item.id} active={look === item.id} />
          </button>
        ))}
      </div>
      <div className="space-y-4 px-4 py-4">
        {LOOKS.filter((item) => item.id === look).map((item) => (
          <p key={item.id} className="text-sm text-muted">
            {item.hint}
          </p>
        ))}
        <div>
          <p className="font-display text-sm font-semibold">Thời tiết</p>
          <p className="mt-1 text-xs text-faint">Phủ lên mẫu đang chọn. Không để tắt.</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {WEATHERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setWeather(item.id)}
                className={`h-11 rounded-md border text-xs ${
                  weather === item.id ? "border-fg bg-subtle text-fg" : "border-border bg-bg text-muted"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <label className={`block ${weather === "none" ? "pointer-events-none opacity-40" : ""}`}>
          <span className="mb-2 flex items-center justify-between text-sm text-fg">
            Độ mờ
            <span className="tabular-nums text-muted">{Math.round(fx * 100)}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fx}
            aria-label="Độ mờ hiệu ứng"
            disabled={weather === "none"}
            onChange={(event) => setFx(Number(event.target.value))}
            className="w-full accent-accent"
          />
          <span className="mt-1 block text-xs text-faint">100% là rõ nhất. Kéo xuống để mưa, tuyết, kính hoặc hạt phim nhạt đi.</span>
        </label>
        {(look === "poster" || look === "night") && (
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm text-fg">
              Độ mờ nền
              <span className="tabular-nums text-muted">{Math.round(bg * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={bg}
              aria-label="Độ mờ ảnh nền"
              onChange={(event) => setBg(Number(event.target.value))}
              className="w-full accent-accent"
            />
            <span className="mt-1 block text-xs text-faint">100% là rõ nhất. Kéo xuống để ảnh nền của Mẫu 1 và Mẫu 2 nhạt đi.</span>
          </label>
        )}
        <label className="block">
          <span className="mb-2 flex items-center justify-between text-sm text-fg">
            Tốc độ trượt
            <span className="tabular-nums text-muted">{glide.toFixed(1)}</span>
          </span>
          <input
            type="range"
            min={0.45}
            max={2.4}
            step={0.05}
            value={glide}
            aria-label="Tốc độ trượt"
            onChange={(event) => setGlide(Number(event.target.value))}
            className="w-full accent-accent"
          />
          <span className="mt-1 block text-xs text-faint">Chậm hơn để thấy số thứ tự chạy rõ khi đổi bài.</span>
        </label>
        <Toggle label="Hiện nghệ sĩ" checked={showArtist} onChange={setShowArtist} />
        <Toggle label="Sóng nhạc" checked={showWave} onChange={setShowWave} />
        <p className="text-xs leading-relaxed text-faint">
          WAV lớn được đọc từng đoạn và nén Opus 48 kHz (khoảng 1,2 MB mỗi phút) trước khi lưu. File gốc không giữ.
          Video YouTube là WebM 1080p 30 hình/giây, VP9 khoảng 8 Mbps, tiếng Opus 256 kbps, ghi thẳng ra đĩa.
          YouTube nhận file này. Nên thử 20 giây trước — cả list vẽ trong trình duyệt nên lâu hơn thời lượng video.
        </p>
      </div>
    </aside>
  );
}

function TitleFields() {
  const titleA = useProject((s) => s.titleA);
  const titleB = useProject((s) => s.titleB);
  const caption = useProject((s) => s.caption);
  const setTitleA = useProject((s) => s.setTitleA);
  const setTitleB = useProject((s) => s.setTitleB);
  const setCaption = useProject((s) => s.setCaption);

  return (
    <section className="border-b border-border px-3 py-3">
      <p className="font-display text-sm font-semibold">Tiêu đề</p>
      <p className="mt-1 text-xs leading-relaxed text-faint">
        Chữ in trên video. Để trống thì không hiện sẵn “Nhạc Chill”. Dòng 1 là màu nhấn, dòng 2 là chữ trắng.
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs text-muted">Dòng 1</span>
        <input
          value={titleA}
          maxLength={36}
          placeholder="DRILL"
          aria-label="Dòng tiêu đề 1"
          onChange={(event) => setTitleA(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-silver"
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-muted">Dòng 2</span>
        <input
          value={titleB}
          maxLength={42}
          placeholder="EM"
          aria-label="Dòng tiêu đề 2"
          onChange={(event) => setTitleB(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-silver"
        />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-muted">Dòng phụ</span>
        <input
          value={caption}
          maxLength={72}
          placeholder="Chữ nhỏ dưới gạch, có thể bỏ trống"
          aria-label="Dòng phụ"
          onChange={(event) => setCaption(event.target.value)}
          className="h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-fg outline-none placeholder:text-faint focus:border-silver"
        />
      </label>
    </section>
  );
}

function LookMark({ id, active }: { id: LookId; active: boolean }) {
  return (
    <span className="mt-3 flex h-8 items-end gap-1" aria-hidden="true">
      {id === "poster" ? (
        <>
          <span className={`size-4 -rotate-6 rounded-sm ${active ? "bg-accent" : "bg-silver"}`} />
          <span className={`mb-1 size-3 rotate-6 rounded-sm ${active ? "bg-fg" : "bg-silver"}`} />
        </>
      ) : id === "night" ? (
        <span className={`h-2 w-full rounded-sm ${active ? "bg-accent" : "bg-silver"}`} />
      ) : (
        <>
          <span className={`h-5 w-3.5 rounded-sm ${active ? "bg-fg" : "bg-silver"}`} />
          <span className={`h-3 flex-1 rounded-sm ${active ? "bg-accent" : "bg-silver"}`} />
        </>
      )}
    </span>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-full items-center justify-between rounded-md border border-border bg-bg px-3 text-sm text-fg"
    >
      {label}
      <span className={`h-6 w-10 rounded-full p-0.5 ${checked ? "bg-fg" : "bg-subtle"}`}>
        <span className={`block size-5 rounded-full transition-transform duration-150 ${checked ? "translate-x-4 bg-bg" : "bg-fg"}`} />
      </span>
    </button>
  );
}
