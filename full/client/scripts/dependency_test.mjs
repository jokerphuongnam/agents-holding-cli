import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const home = mkdtempSync(join(tmpdir(), "ah-dep-test-")); process.env.HOME = home;
mkdirSync(join(home,".claude")); mkdirSync(join(home,".codex"));
const D = await import("./dependency.mjs");
test("pack names derive from SSH, HTTPS, scp and local links",()=>{
 for(const [url,name] of [["git@github.com:owner/My_Pack.git","my-pack"],["https://github.com/owner/My_Pack/","my-pack"],["ssh://git@github.com/owner/My_Pack.git","my-pack"],["file:///tmp/My_Pack.git","my-pack"]]) assert.equal(D.packNameFromLink(url),name);
 assert.throws(()=>D.packNameFromLink(""),/missing/);
});
test("discovery ignores symlinks and identifies Claude skills and commands",()=>{
 const p=mkdtempSync(join(tmpdir(),"ah-pack-")); mkdirSync(join(p,"skills/reviewer"),{recursive:true}); mkdirSync(join(p,".claude/commands"),{recursive:true});
 writeFileSync(join(p,"skills/reviewer/SKILL.md"),'---\nname: Reviewer\ndescription: Reviews code\nallowed-tools: Bash\n---\nReview carefully.');
 writeFileSync(join(p,".claude/commands/review.md"),'---\ndescription: Review command\n---\nRun review.'); symlinkSync("/etc/passwd",join(p,"skills/reviewer/leak"));
 const e=D.discoverPackEntries(p); assert.equal(e.length,2); assert.equal(e.find((x)=>x.kind==="skill").claudeOnly,true); assert.equal(e.find((x)=>x.kind==="command").id,"review");
});
test("pack exposure adapts for Grok Codex Claude and local staff without auto-running scripts",()=>{
 const p=mkdtempSync(join(tmpdir(),"ah-pack-expose-")); mkdirSync(join(p,"skills/reviewer"),{recursive:true});
 writeFileSync(join(p,"skills/reviewer/SKILL.md"),'---\nname: Reviewer\ndescription: Reviews code\nallowed-tools: Bash\n---\nReview carefully.');
 const out=D.exposePack("demo",p); assert.equal(out.entries.length,1);
 for(const a of ["grok","claude","codex"]) assert.ok(out.exposed.some((x)=>x.agent===a),a);
 for(const x of out.exposed){assert.ok(existsSync(x.path));const text=readFileSync(x.path,"utf8");assert.match(text,/never auto-run/);assert.match(text,/agents-holding dependency pack/);}
 assert.equal(readFileSync(join(home,".grok/commands/ah-pack-demo-reviewer.md"),"utf8").includes("allowed-tools"),false);
 assert.ok(existsSync(join(home,".agents-holding/packs/demo/.ah-meta.json"))); assert.ok(existsSync(join(home,".agents-holding/skills/library/ah-pack-demo-reviewer/SKILL.md")));
});
