import { LOOKS, type LookId } from "@/lib/playlist";
import { useProject } from "@/lib/store";

export function Inspector() {
  const look = useProject((s) => s.look);
  const glide = useProject((s) => s.glide);
  const showArtist = useProject((s) => s.showArtist);
  const showWave = useProject((s) => s.showWave);
  const setLook = useProject((s) => s.setLook);
  const setGlide = useProject((s) => s.setGlide);
  const setShowArtist = useProject((s) => s.setShowArtist);
  const setShowWave = useProject((s) => s.setShowWave);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-y-auto bg-surface">
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
          Xuất WebM theo thời gian thật, kèm tiếng. Nút 20s để xem thử trước khi xuất cả danh sách.
        </p>
      </div>
    </aside>
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
      ) : id === "ticker" ? (
        <span className={`h-1.5 flex-1 rounded-full ${active ? "bg-accent" : "bg-silver"}`} />
      ) : (
        [0, 1, 2].map((bar) => (
          <span
            key={bar}
            className={`w-1 rounded-full ${active ? "bg-accent" : "bg-silver"}`}
            style={{ height: `${10 + bar * 6}px`, opacity: bar === 1 ? 1 : 0.45 }}
          />
        ))
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
      <span className={`h-6 w-10 rounded-full p-0.5 ${checked ? "bg-accent" : "bg-subtle"}`}>
        <span className={`block size-5 rounded-full bg-fg transition-transform duration-150 ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}
