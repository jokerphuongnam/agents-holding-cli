// ONE outbound allowlist for every telemetry / skill-crawl / billing call to our server. Anything not listed is dropped
// before the request is built. Connected tools and local data (Jira, Git, Slack, Notion, email, databases, files, any future
// connector) never appear here: they are used only on this machine. Test: outbound_test.mjs (covers every endpoint below).
const ENUM = (v) => typeof v === "string" ? v.toLowerCase().replace(/[^a-z0-9_:+. -]/g, "").slice(0, 40) : undefined;
const INT = (v) => Number.isInteger(v) && v >= 0 ? Math.min(v, 1e6) : undefined;
const BOOL = (v) => typeof v === "boolean" ? v : undefined;
const SLUG = (v) => typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/.test(v) ? v : undefined;
const MAP = (v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [ENUM(k), ENUM(x)]).filter(([k, x]) => k && x)) : undefined;
const STR = (n) => (v) => typeof v === "string" ? v.slice(0, n) : undefined;
const NUM = (v) => typeof v === "number" && isFinite(v) ? v : undefined;
const FILES = (v) => Array.isArray(v) ? v.slice(0, 60).filter((f) => f && /^(SKILL\.md|(references|scripts|templates)\/[\w./-]+)$/.test(f.path) && !f.path.includes("..")).map((f) => ({ path: f.path, content: String(f.content).slice(0, 200000) })) : undefined;
export const ALLOW = {
  listener_heartbeat: { company: SLUG, host: STR(80), pid: INT, autostart: BOOL, version: STR(20), state: ENUM,
    meta: (v) => v && typeof v === "object" ? clean({ providers: MAP, models: MAP, os: ENUM, lang: ENUM, private_skills: INT, public_skills: INT }, v) : undefined },
  skill_crawl_upload: { company: SLUG, name: SLUG, staff: SLUG, files: FILES, manifest_hash: STR(64), nonce: STR(64), ts: NUM, sig: STR(64), excluded_count: INT },
  billing: { lang: ENUM }, whoami: {},
};
function clean(schema, a) { const o = {}; for (const [k, f] of Object.entries(schema)) { const v = f(a?.[k]); if (v !== undefined) o[k] = v; } return o; }
export const governed = (name) => name in ALLOW;
/** Filter args for a governed endpoint; throws for an unknown telemetry endpoint so nothing slips through untyped. */
export function outbound(name, args) { if (!governed(name)) throw new Error(`outbound: ${name} is not in the allowlist`); return clean(ALLOW[name], args ?? {}); }
