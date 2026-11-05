// select(title, items, { initial }) -> 0-based index, or null when not interactive (no TTY, CI, AH_NONINTERACTIVE=1):
// callers then keep their numeric/env fallback. Up/Down or k/j move, Enter chooses, 1-9 pick directly,
// Ctrl-C cancels (raw mode off, cursor shown, exit 130). Dependency-free; same behavior as full/lib/menu.sh (ah_menu).
export function interactive(env = process.env, stdin = process.stdin, stdout = process.stdout) {
  return !!(stdin.isTTY && stdout.isTTY && env.AH_NONINTERACTIVE !== "1" && !env.CI);
}
export function render(title, items, cur) {
  return [title, ...items.map((s, i) => (i === cur ? `  \x1b[1;36m❯ ${i + 1}) ${s}\x1b[0m` : `    ${i + 1}) ${s}`)),
    `  \x1b[2m↑/↓ move · Enter choose · 1-${items.length} shortcut · Ctrl-C cancel\x1b[0m`];
}
// pure key handler (tested directly): returns { cur, done, cancel }
export function step(key, cur, n) {
  if (key === "\x03") return { cur, cancel: true };
  if (key === "\x1b[A" || key === "\x1bOA" || key === "k" || key === "K") return { cur: (cur - 1 + n) % n };
  if (key === "\x1b[B" || key === "\x1bOB" || key === "j" || key === "J") return { cur: (cur + 1) % n };
  if (key === "\r" || key === "\n") return { cur, done: true };
  if (/^[1-9]$/.test(key) && Number(key) <= n) return { cur: Number(key) - 1, done: true };
  return { cur };
}
const keysOf = (s) => s.match(/\x1b\[[0-9;]*[A-Za-z~]|\x1bO[A-Za-z]|[\s\S]/g) ?? [];
export async function select(title, items, { initial = 0, stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!interactive(process.env, stdin, stdout) || !items.length) return null;
  let cur = initial >= 0 && initial < items.length ? initial : 0;
  const lines = () => render(title, items, cur).map((l, i) => (i ? "\x1b[2K" + l : l)).join("\n") + "\n";
  stdout.write("\x1b[?25l" + lines());
  const wasRaw = stdin.isRaw; stdin.setRawMode(true); stdin.resume(); stdin.setEncoding("utf8");
  const restore = () => { stdin.setRawMode(!!wasRaw); stdin.pause(); stdout.write("\x1b[?25h"); };
  const onExit = () => restore(); process.once("exit", onExit);
  try {
    return await new Promise((resolve) => {
      const onData = (chunk) => {
        for (const k of keysOf(chunk)) {
          const r = step(k, cur, items.length);
          if (r.cancel) { stdin.off("data", onData); restore(); stdout.write("\n"); process.exit(130); }
          if (r.cur !== cur) { cur = r.cur; stdout.write(`\x1b[${items.length + 1}A\x1b[2K` + lines().slice(lines().indexOf("\n") + 1)); }
          if (r.done) { stdin.off("data", onData); return resolve(cur); }
        }
      };
      stdin.on("data", onData);
    });
  } finally { process.off("exit", onExit); restore(); }
}
