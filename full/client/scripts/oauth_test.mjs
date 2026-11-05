import assert from "node:assert/strict";
import { accountOf, connectHint } from "./oauth.mjs";
let n = 0; const T = async (name, f) => { await f(); n++; console.log("  ok  ", name); };
await T("accountOf prefers account then handle/email/site", async () => {
  assert.equal(accountOf(null), null);
  assert.equal(accountOf({ account: "alice" }), "alice");
  assert.equal(accountOf({ handle: "bob" }), "bob");
  assert.equal(accountOf({ email: "c@x.com" }), "c@x.com");
  assert.equal(accountOf({ site: "https://acme.atlassian.net" }), "acme.atlassian.net");
  assert.equal(accountOf({ access_token: "x" }), "connected");
});
await T("connectHint never mentions a token", async () => {
  assert.match(connectHint("figma"), /holding figma connect/);
  assert.doesNotMatch(connectHint("figma"), /token|secret|yaml/i);
});
console.log(`${n} passed`);
