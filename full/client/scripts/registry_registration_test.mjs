import assert from "node:assert/strict";
import * as R from "./registry.mjs";

const reg = R.empty();
R.addBoard(reg, { path: "/work/parent", site: "https://jira.example", project_key: "MAR", company: "parent" });
R.addBoard(reg, { path: "/work/child", site: "https://jira.example", project_key: "NAIL", company: "child" });
R.addBoard(reg, { path: "/work/missing", site: "https://jira.example", project_key: "OPS", company: "ops" });
let checked = R.reconcile(reg, { fileExists: (p) => p !== "/work/missing", readCompany: (p) => ({ "/work/parent": "parent", "/work/child": "child" }[p] ?? null) });
assert.ok(checked.issues.some((x) => x.code === "missing_repo"));
assert.ok(checked.issues.some((x) => x.code === "missing_company_config"));
assert.equal(R.route(reg, { company: "parent", issue: "MAR-1", site: "https://jira.example" }).repos[0].path, "/work/parent");
assert.equal(R.route(reg, { company: "child", issue: "NAIL-1", site: "https://jira.example" }).repos[0].path, "/work/child");
R.addBoard(reg, { path: "/work/other", site: "https://jira.example", project_key: "MAR", company: "parent" });
checked = R.reconcile(reg, { fileExists: () => true, readCompany: () => "parent" });
assert.ok(checked.issues.some((x) => x.code === "duplicate_mapping"));
assert.match(R.registrationComment("OPS-1", checked.issues), /REGISTRATION ACTION REQUIRED/);
assert.match(R.registrationComment("OPS-1", checked.issues), /holding project add/);
console.log("registry_registration_test: new install, parent/child, missing and duplicate mappings passed");
