const BG = new Set(["bg", "nen"]);
const AVATAR = new Set(["avt", "avatar"]);

export type PlateSlot = { kind: "bg" } | { kind: "avatar" } | { kind: "album"; index: number };

export function normStem(filename: string) {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  return base
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map image names onto the background, the avatar, and album slots. */
export function assignPlateNames(filenames: string[], titles: string[]) {
  const files = [...filenames].sort((a, b) => a.localeCompare(b, "vi"));
  const used = new Set<string>();
  const taken = new Set<number>();
  const out: { file: string; slot: PlateSlot }[] = [];
  let hasBg = false;
  let hasAvatar = false;

  const claim = (file: string, slot: PlateSlot) => {
    used.add(file);
    if (slot.kind === "album") taken.add(slot.index);
    out.push({ file, slot });
  };

  for (const file of files) {
    const stem = normStem(file);
    if (!hasBg && BG.has(stem)) {
      hasBg = true;
      claim(file, { kind: "bg" });
    } else if (!hasAvatar && AVATAR.has(stem)) {
      hasAvatar = true;
      claim(file, { kind: "avatar" });
    }
  }

  const titled = titles.map((title) => normStem(title));
  for (const file of files) {
    if (used.has(file)) continue;
    const stem = normStem(file);
    const index = titled.findIndex((title, i) => title.length > 0 && title === stem && !taken.has(i));
    if (index >= 0) claim(file, { kind: "album", index });
  }

  for (const file of files) {
    if (used.has(file)) continue;
    const num = /^(\d{1,2})$/.exec(normStem(file));
    if (!num) continue;
    const index = Number(num[1]) - 1;
    if (index < 0 || index >= titles.length || taken.has(index)) continue;
    claim(file, { kind: "album", index });
  }

  let cursor = 0;
  for (const file of files) {
    if (used.has(file)) continue;
    while (cursor < titles.length && taken.has(cursor)) cursor += 1;
    if (cursor >= titles.length) break;
    claim(file, { kind: "album", index: cursor });
    cursor += 1;
  }

  return out;
}
