import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as R from "./registry.mjs";
import * as L from "./lean.mjs";

const site = "https://acme.atlassian.net";
const reg = R.empty();
R.addBoard(reg, { path: "/tmp/marlin-parent", site, project_key: "MARLIN", company: "parent" });
R.addBoard(reg, { path: "/tmp/nail-child", site, project_key: "NAIL", company: "child" });
assert.equal(R.routeForRepo(reg, { repo: "/tmp/marlin-parent", issue: "MARLIN-1", site }).company, "parent");
assert.equal(R.routeForRepo(reg, { repo: "/tmp/nail-child", issue: "NAIL-1", site }).company, "child");
const oauthSite = "https://api.atlassian.com/ex/jira/cloud-id/rest/api/3";
assert.equal(R.routeForRepo(reg, { repo: "/tmp/marlin-parent", issue: "MARLIN-1", site: oauthSite }).company, "parent");
assert.equal(R.routeForRepo(reg, { repo: "/tmp/nail-child", issue: "NAIL-1", site: oauthSite }).company, "child");
assert.equal(R.routeForRepo(reg, { repo: "/tmp/nail-child", issue: "MARLIN-1", site: oauthSite }).none, true);
const listenerSource = readFileSync(new URL("./holding-listen.mjs", import.meta.url), "utf8");
assert.match(listenerSource, /const scopedRoute = onlyRepo \? R\.routeForRepo/,
  "manual --repo replay must remain repo-scoped even when --run supplies a company");

const calls = [];
const jira = L.jiraClient({ jira: "https://api.atlassian.com/ex/jira/cloud/rest/api/3", auth: () => "Bearer oauth-access" }, { dry: false, log() {} });
// The resolved OAuth endpoint is already rooted at /rest/api/3; the client must not prefix it again.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url, auth: init.headers.Authorization });
  return { ok: true, status: 200, json: async () => ({}) };
};
try { await jira.issue("MARLIN-1"); } finally { globalThis.fetch = originalFetch; }
assert.equal(calls[0].url, "https://api.atlassian.com/ex/jira/cloud/rest/api/3/issue/MARLIN-1?fields=summary,description,comment");
assert.equal(calls[0].auth, "Bearer oauth-access");
console.log("release_listener_test: OAuth transport and parent/child replay routing passed");
