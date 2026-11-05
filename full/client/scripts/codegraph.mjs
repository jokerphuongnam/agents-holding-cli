#!/usr/bin/env node
/**
 * Code-graph backend adapter for the `code-graph` staff.
 * Detects installed graph tools; routes queries to whichever the company chose.
 * Rules: 0 backends ready → fall back to prism (may still need install).
 *        1 backend → use it silently.  2+ → ask once per company; persist.
 * Change later: holding codegraph use <name> | list | status | resolve | detect
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, accessSync, constants as fsConstants } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveCompany as _resolveCompany } from "./company.mjs";
const resolveCompany = (o) => {
  try { return _resolveCompany(o); }
  catch { return { company: process.env.AH_COMPANY || null, source: "env" }; }
};

const HOME = process.env.HOME || homedir();
const STATE = (...p) => join(HOME, ".config/agents-holding/state", ...p);

/** Canonical backends. `id` is what `use` accepts (aliases listed too). */
const BACKENDS = [
  {
    id: "codegraph",
    aliases: ["colby-codegraph", "colbymchenry"],
    label: "codegraph (local .codegraph index)",
    binsAny: ["codegraph"],
    binFingerprint: { bin: "codegraph", mustInclude: ["explore", "serve"] },
    mcpKeys: ["codegraph"],
    mcpTools: ["codegraph_explore"],
    indexDirs: [".codegraph"],
    queryCli: 'codegraph explore "<question>"',
    queryMcp: "codegraph_explore",
  },
  {
    id: "codegraphcontext",
    aliases: ["cgc", "code-graph-context"],
    label: "CodeGraphContext (cgc)",
    binsAny: ["cgc", "codegraphcontext"],
    mcpKeys: ["codegraphcontext", "cgc", "code-graph-context"],
    mcpTools: [],
    indexDirs: [".codegraphcontext", ".cgc"],
    queryCli: "cgc query \"<question>\"   # or: codegraphcontext …",
    queryMcp: null,
  },
  {
    id: "code-graph",
    aliases: ["danweiner", "danweinerdev", "code-graph-mcp-dan"],
    label: "code-graph MCP (code-graph CLI)",
    binsAny: ["code-graph"],
    mcpKeys: ["code-graph", "code_graph"],
    mcpTools: [],
    indexDirs: [],
    queryCli: "code-graph \"<question>\"",
    queryMcp: null,
  },
  {
    id: "code-graph-mcp",
    aliases: ["sdsrss", "sdsrss-code-graph-mcp"],
    label: "code-graph-mcp (MCP-only)",
    binsAny: [],
    mcpKeys: ["code-graph-mcp", "code_graph_mcp", "sdsrss-code-graph"],
    mcpTools: [],
    indexDirs: [],
    queryCli: null,
    queryMcp: "(tools exposed by the code-graph-mcp server)",
  },
  {
    id: "lzehrung-codegraph",
    aliases: ["lzehrung"],
    label: "lzehrung/codegraph",
    binsAny: ["codegraph"],
    binFingerprint: { bin: "codegraph", mustInclude: ["lzehrung"], mustExclude: ["explore"] },
    mcpKeys: ["lzehrung-codegraph", "lzehrung_codegraph"],
    mcpTools: [],
    indexDirs: [],
    queryCli: "codegraph \"<question>\"",
    queryMcp: null,
  },
  {
    id: "prism",
    aliases: ["code-prism"],
    label: "Code Prism (system cache + prism-mcp)",
    binsAll: ["prism", "prism-mcp"],
    mcpKeys: ["code-prism", "prism", "prism-mcp"],
    mcpTools: ["ask_graph", "resolve_symbol", "search_symbols", "get_project_summary", "get_node_info", "get_smart_context"],
    indexDirs: [], // system cache, not project-tree
    queryCli: "prism analyze --root \"$PROJECT_ROOT\"  # then MCP ask_graph / resolve_symbol / …",
    queryMcp: "ask_graph | resolve_symbol | search_symbols | …",
    fallback: true,
  },
];

function which(name) {
  if (!name) return null;
  const found = spawnSync("bash", ["-lc", `command -v ${JSON.stringify(name)}`], { encoding: "utf8" });
  const p = (found.stdout || "").trim();
  if (p) return p;
  for (const c of [
    join(HOME, "bin", name),
    join(HOME, ".local/bin", name),
    join(HOME, "Documents/Code/code-prism-cli/bin", name),
  ]) {
    try {
      accessSync(c, fsConstants.X_OK);
      return c;
    } catch {}
  }
  return null;
}

function helpText(binPath) {
  if (!binPath) return "";
  const r = spawnSync(binPath, ["--help"], { encoding: "utf8", timeout: 4000 });
  return `${r.stdout || ""}\n${r.stderr || ""}`.toLowerCase();
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Collect MCP server keys from common agent configs (Grok / Claude / Codex / Cursor). */
function mcpServerKeysOnMachine() {
  const keys = new Set();
  const addFromObj = (obj) => {
    const servers = obj?.mcpServers || obj?.mcp?.servers || obj?.servers;
    if (servers && typeof servers === "object") Object.keys(servers).forEach((k) => keys.add(k.toLowerCase()));
  };
  const candidates = [
    join(HOME, ".grok/mcp.json"),
    join(HOME, ".grok/mcp_config.json"),
    join(HOME, ".config/grok/mcp.json"),
    join(HOME, ".claude.json"),
    join(HOME, ".claude/settings.json"),
    join(HOME, ".config/claude/mcp.json"),
    join(HOME, ".codex/config.toml"),
    join(HOME, ".cursor/mcp.json"),
    join(HOME, ".config/cursor/mcp.json"),
  ];
  // project-local
  for (const rel of [".cursor/mcp.json", ".vscode/mcp.json", ".mcp.json"]) {
    candidates.push(join(process.cwd(), rel));
  }
  for (const f of candidates) {
    if (!existsSync(f)) continue;
    if (f.endsWith(".toml")) {
      const raw = readFileSync(f, "utf8");
      for (const m of raw.matchAll(/\[mcp_servers\.([^\]]+)\]/gi)) keys.add(m[1].toLowerCase());
      for (const m of raw.matchAll(/\[mcp\.servers\.([^\]]+)\]/gi)) keys.add(m[1].toLowerCase());
      continue;
    }
    const j = readJsonSafe(f);
    if (j) addFromObj(j);
    // Claude sometimes nests mcpServers under projects
    if (j?.projects && typeof j.projects === "object") {
      for (const proj of Object.values(j.projects)) addFromObj(proj);
    }
  }
  return keys;
}

function indexPresent(dirs) {
  const hits = [];
  for (const d of dirs || []) {
    const p = join(process.cwd(), d);
    if (existsSync(p)) hits.push(p);
  }
  return hits;
}

function fingerprintOk(backend, binPath) {
  const fp = backend.binFingerprint;
  if (!fp) return true;
  const text = helpText(binPath);
  if (fp.mustInclude && !fp.mustInclude.every((s) => text.includes(s.toLowerCase()))) return false;
  if (fp.mustExclude && fp.mustExclude.some((s) => text.includes(s.toLowerCase()))) return false;
  return true;
}

function detectOne(backend, mcpKeys) {
  const bins = {};
  let binHit = false;
  for (const b of backend.binsAll || []) {
    const p = which(b);
    bins[b] = p;
    if (!p) return null; // binsAll requires every bin
  }
  if (backend.binsAll?.length) binHit = true;
  for (const b of backend.binsAny || []) {
    const p = which(b);
    bins[b] = p;
    if (p && fingerprintOk(backend, p)) binHit = true;
    else if (p && backend.binFingerprint) bins[b] = null; // wrong flavor of same binary name
  }
  const mcpHit = (backend.mcpKeys || []).some((k) => mcpKeys.has(k.toLowerCase()));
  const indexes = indexPresent(backend.indexDirs);
  const indexHit = indexes.length > 0;
  // Ready if CLI present, or MCP configured, or (for index-based tools) index + some signal
  if (!binHit && !mcpHit && !(indexHit && backend.id === "codegraph")) return null;
  // Special: prism needs both bins for "ready"; MCP-only still counts as detected
  if (backend.id === "prism" && backend.binsAll && !binHit && !mcpHit) return null;
  return {
    id: backend.id,
    label: backend.label,
    bins,
    mcp: mcpHit,
    indexes,
    queryCli: backend.queryCli,
    queryMcp: backend.queryMcp,
    mcpTools: backend.mcpTools || [],
    fallback: !!backend.fallback,
    evidence: [
      binHit ? "cli" : null,
      mcpHit ? "mcp-config" : null,
      indexHit ? "index-dir" : null,
    ].filter(Boolean),
  };
}

export function detectAll() {
  const mcpKeys = mcpServerKeysOnMachine();
  const found = [];
  const seenBins = new Set(); // avoid double-counting same codegraph binary as two backends
  for (const b of BACKENDS) {
    const hit = detectOne(b, mcpKeys);
    if (!hit) continue;
    // If codegraph binary matched colby (explore), skip lzehrung
    if (b.id === "lzehrung-codegraph") {
      const colby = found.find((x) => x.id === "codegraph");
      if (colby) continue;
    }
    if (b.id === "codegraph" && hit.bins.codegraph) seenBins.add(hit.bins.codegraph);
    found.push(hit);
  }
  return found;
}

function companyOf() {
  const r = resolveCompany({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), home: HOME });
  return r?.company || process.env.AH_COMPANY || null;
}

function choicePath(company) {
  if (!company) return null;
  return STATE(company, "codegraph.json");
}

function loadChoice(company) {
  const p = choicePath(company);
  if (!p || !existsSync(p)) return null;
  const j = readJsonSafe(p);
  return j?.backend ? String(j.backend) : null;
}

function saveChoice(company, backendId) {
  if (!company) throw new Error("no company resolved — pass --company <slug> or run inside a company workspace");
  const p = choicePath(company);
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const payload = {
    backend: backendId,
    set_at: new Date().toISOString(),
    set_by: "holding codegraph use",
  };
  writeFileSync(p, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
  return p;
}

function findBackendMeta(id) {
  const key = String(id || "").toLowerCase();
  return BACKENDS.find((b) => b.id === key || (b.aliases || []).includes(key)) || null;
}

/** Resolve which backend the code-graph staff should use right now. */
export function resolve(opts = {}) {
  const company = opts.company ?? companyOf();
  const detected = detectAll();
  const choice = loadChoice(company);
  const byId = Object.fromEntries(detected.map((d) => [d.id, d]));

  // Persisted choice wins if still present (or is prism fallback even if missing)
  if (choice) {
    const meta = findBackendMeta(choice);
    const id = meta?.id || choice;
    if (byId[id]) {
      return { ok: true, company, backend: byId[id], reason: "saved-choice", detected, need_choice: false };
    }
    if (id === "prism") {
      // Forced prism even if not installed — staff will ask install
      const prismMeta = BACKENDS.find((b) => b.id === "prism");
      return {
        ok: true,
        company,
        backend: {
          id: "prism",
          label: prismMeta.label,
          bins: { prism: which("prism"), "prism-mcp": which("prism-mcp") },
          mcp: false,
          indexes: [],
          queryCli: prismMeta.queryCli,
          queryMcp: prismMeta.queryMcp,
          mcpTools: prismMeta.mcpTools,
          fallback: true,
          evidence: ["saved-choice"],
          installed: !!(which("prism") && which("prism-mcp")),
        },
        reason: "saved-choice-prism",
        detected,
        need_choice: false,
      };
    }
    // Stale choice — fall through
  }

  if (detected.length === 1) {
    return { ok: true, company, backend: detected[0], reason: "only-one", detected, need_choice: false };
  }
  if (detected.length === 0) {
    const prismMeta = BACKENDS.find((b) => b.id === "prism");
    return {
      ok: true,
      company,
      backend: {
        id: "prism",
        label: prismMeta.label,
        bins: { prism: which("prism"), "prism-mcp": which("prism-mcp") },
        mcp: false,
        indexes: [],
        queryCli: prismMeta.queryCli,
        queryMcp: prismMeta.queryMcp,
        mcpTools: prismMeta.mcpTools,
        fallback: true,
        evidence: ["default-fallback"],
        installed: false,
      },
      reason: "none-fallback-prism",
      detected,
      need_choice: false,
    };
  }
  // Multiple — need user choice once
  return {
    ok: false,
    company,
    backend: null,
    reason: "need-choice",
    detected,
    need_choice: true,
    ask: `Several code-graph backends are installed. Pick one for this company (saved until you change it):\n` +
      detected.map((d, i) => `  ${i + 1}. ${d.id}  — ${d.label}  [${d.evidence.join("+")}]`).join("\n") +
      `\nRun: holding codegraph use <name>${company ? ` --company ${company}` : ""}`,
  };
}

function printResolve(r, asJson) {
  if (asJson) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  if (r.need_choice) {
    console.log(`status\tneed-choice\tcompany=${r.company || "-"}`);
    console.log(r.ask);
    return;
  }
  const b = r.backend;
  const installed =
    b.installed !== false &&
    (b.evidence?.includes("cli") || b.evidence?.includes("mcp-config") || b.id !== "prism" || (b.bins?.prism && b.bins?.["prism-mcp"]));
  console.log(`status\tok\tbackend=${b.id}\treason=${r.reason}\tcompany=${r.company || "-"}`);
  console.log(`label\t${b.label}`);
  console.log(`query_mcp\t${b.queryMcp || "-"}`);
  console.log(`query_cli\t${b.queryCli || "-"}`);
  if (b.mcpTools?.length) console.log(`mcp_tools\t${b.mcpTools.join(",")}`);
  console.log(`evidence\t${(b.evidence || []).join(",") || "-"}`);
  if (b.id === "prism" && !b.bins?.prism) {
    console.log(
      "install\tcurl -fsSL https://raw.githubusercontent.com/jokerphuongnam/code-prism-cli/main/install.sh | bash",
    );
  }
}

function cmdList(asJson) {
  const company = companyOf();
  const detected = detectAll();
  const choice = loadChoice(company);
  if (asJson) {
    console.log(JSON.stringify({ company, choice, available: BACKENDS.map((b) => b.id), detected }, null, 2));
    return;
  }
  console.log(`company\t${company || "(none resolved)"}`);
  console.log(`saved\t${choice || "(none)"}`);
  console.log("detected:");
  if (!detected.length) console.log("  (none — will fall back to prism)");
  for (const d of detected) {
    const mark = choice === d.id ? "*" : " ";
    console.log(` ${mark} ${d.id}\t${d.label}\t[${d.evidence.join("+")}]`);
  }
  console.log("all ids: " + BACKENDS.map((b) => b.id).join(", "));
}

function cmdUse(name, asJson) {
  const meta = findBackendMeta(name);
  if (!meta) {
    console.error(`unknown backend: ${name}\nknown: ${BACKENDS.map((b) => b.id).join(", ")}`);
    process.exit(2);
  }
  const company = companyOf();
  const path = saveChoice(company, meta.id);
  if (asJson) console.log(JSON.stringify({ company, backend: meta.id, path }, null, 2));
  else console.log(`saved\t${meta.id}\tcompany=${company}\t${path}`);
}

function cmdDetect(asJson) {
  const detected = detectAll();
  if (asJson) console.log(JSON.stringify(detected, null, 2));
  else {
    if (!detected.length) console.log("(none)");
    for (const d of detected) console.log(`${d.id}\t${d.evidence.join(",")}\t${d.label}`);
  }
}

function usage() {
  console.log(`usage: holding codegraph <verb>
  list                 show detected backends + saved choice (per company)
  detect               scan PATH / MCP configs / index folders
  status | resolve     which backend the code-graph staff should use now
  use <name>           persist choice for this company (codegraph|cgc|code-graph|code-graph-mcp|lzehrung-codegraph|prism)
  clear                remove saved choice (re-ask if several are present)

Single backend → used silently. None → prism fallback. Several → ask once, then \`use\`.`);
}

const argv = process.argv.slice(2).filter((a) => a !== "--");
const jsonIdx = argv.indexOf("--json");
const asJson = jsonIdx >= 0;
if (asJson) argv.splice(jsonIdx, 1);
// strip --company X (resolveCompany also reads argv)
const verb = (argv[0] || "status").toLowerCase();
const rest = argv.slice(1);

try {
  switch (verb) {
    case "list":
      cmdList(asJson);
      break;
    case "detect":
      cmdDetect(asJson);
      break;
    case "status":
    case "resolve":
    case "":
      {
        const r = resolve();
        printResolve(r, asJson);
        process.exit(r.need_choice ? 4 : 0);
      }
      break;
    case "use":
      if (!rest[0]) {
        usage();
        process.exit(2);
      }
      cmdUse(rest[0], asJson);
      break;
    case "clear": {
      const company = companyOf();
      const p = choicePath(company);
      if (p && existsSync(p)) {
        writeFileSync(p, JSON.stringify({ backend: null, cleared_at: new Date().toISOString() }, null, 2) + "\n");
        console.log(`cleared\tcompany=${company}`);
      } else console.log(`cleared\tnothing\tcompany=${company || "-"}`);
      break;
    }
    case "-h":
    case "--help":
    case "help":
      usage();
      break;
    default:
      usage();
      process.exit(2);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
