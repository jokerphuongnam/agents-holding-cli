import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromCwd, resolveCompany, setActive } from "./company.mjs";

const root = mkdtempSync(join(tmpdir(), "ah-co-"));
try {
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".agents", "viptalk-ios-x-company"), { recursive: true });
  writeFileSync(join(repo, ".agents", "viptalk-ios-x-company", "COMPANY.md"), "x");
  assert.deepEqual(fromCwd(repo), { company: "viptalk-ios-x-company", source: ".agents/viptalk-ios-x-company" });

  // any folder name (no -company suffix) with COMPANY.md
  mkdirSync(join(root, "repo2", ".agents", "nailly"), { recursive: true });
  writeFileSync(join(root, "repo2", ".agents", "nailly", "COMPANY_BOOT.md"), "x");
  assert.equal(fromCwd(join(root, "repo2")).company, "nailly");

  // nested cwd
  mkdirSync(join(repo, "Sources"), { recursive: true });
  assert.equal(fromCwd(join(repo, "Sources")).company, "viptalk-ios-x-company");

  // several companies: prefer active match
  mkdirSync(join(repo, ".agents", "other"), { recursive: true });
  writeFileSync(join(repo, ".agents", "other", "COMPANY.md"), "y");
  assert.equal(fromCwd(repo).company, null);
  assert.deepEqual(fromCwd(repo, { active: "other" }), { company: "other", source: ".agents/other (active)" });

  // company.json is legacy fallback only when no marked folders
  mkdirSync(join(root, "legacy", ".agents"), { recursive: true });
  writeFileSync(join(root, "legacy", ".agents", "company.json"), JSON.stringify({ company: "legacy-co" }));
  assert.deepEqual(fromCwd(join(root, "legacy")), { company: "legacy-co", source: ".agents/company.json (legacy)" });

  // A registered repo's company.json is the canonical server ID even when its
  // generated Company OS directory still has the legacy <slug>-company name.
  const repo3 = join(root, "repo3"), home3 = join(root, "home3");
  mkdirSync(join(repo3, ".agents", "nailly-company"), { recursive: true });
  mkdirSync(join(home3, ".config", "agents-holding"), { recursive: true });
  writeFileSync(join(repo3, ".agents", "nailly-company", "COMPANY.md"), "x");
  writeFileSync(join(repo3, ".agents", "company.json"), JSON.stringify({ company: "nailly" }));
  writeFileSync(join(home3, ".config", "agents-holding", "projects.json"), JSON.stringify({ projects: [
    { path: repo3, boards: [{ company: "nailly", project_key: "NAIL" }] },
  ] }));
  assert.deepEqual(fromCwd(repo3, { home: home3 }), { company: "nailly", source: ".agents/company.json (registered)" });
  assert.equal(resolveCompany({ cwd: repo3, argv: [], env: {}, home: home3 }).company, "nailly");

  // marked folder wins over company.json at same level
  writeFileSync(join(repo, ".agents", "company.json"), JSON.stringify({ company: "pinned" }));
  // still ambiguous (two marked) — json must NOT win
  assert.equal(fromCwd(repo).company, null);

  setActive("viptalk-ios-x-company", root);
  const r = resolveCompany({ cwd: repo, argv: [], env: {}, home: root });
  assert.equal(r.company, "viptalk-ios-x-company");
  assert.match(r.source, /active/);

  console.log("ok company_resolve_test");
} finally { rmSync(root, { recursive: true, force: true }); }
