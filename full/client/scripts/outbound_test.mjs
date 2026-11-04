import { ALLOW, outbound } from "./outbound.mjs";
let f = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) f++; };
const junk = { jira_token: "x", issue_key: "KAN-12", title: "secret project", comment: "hi", path: "/Users/me/x", email: "a@b.c", slack: "msg", notion: "page", db: "rows" };
for (const name of Object.keys(ALLOW)) { const o = JSON.stringify(outbound(name, { ...junk, company: "acme" }));
  ok(`${name}: unknown fields dropped`, !/KAN-12|secret project|\/Users|a@b\.c|jira_token|slack|notion|rows/.test(o)); }
const hb = outbound("listener_heartbeat", { meta: { providers: { dev: "codex" }, models: { dev: "Some Model!" }, os: "darwin", private_skills: 3, repo: "/Users/x", note: "free text" } });
ok("heartbeat meta keeps enums/counts only", hb.meta.os === "darwin" && hb.meta.private_skills === 3 && !("repo" in hb.meta) && !("note" in hb.meta));
const up = outbound("skill_crawl_upload", { name: "my-skill", files: [{ path: "SKILL.md", content: "x" }, { path: "history/log.md", content: "y" }, { path: "assets/a.png", content: "z" }, { path: "../etc", content: "q" }, { path: "scripts/run.sh", content: "s" }] });
ok("crawl: history/, assets/ and odd paths never leave", up.files.map((x) => x.path).join() === "SKILL.md,scripts/run.sh");
let threw = false; try { outbound("send_jira_data", {}); } catch { threw = true; } ok("unknown telemetry endpoint refused", threw);
console.log(`outbound_test: ${f} failures`); process.exit(f ? 1 : 0);
