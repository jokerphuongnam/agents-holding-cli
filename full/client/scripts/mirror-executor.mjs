// Jira control-board mirror executor.
// Adapters are injected so this module is testable and never knows credentials.
const FORBIDDEN = new Set(["comment", "label", "assign", "attach", "worklog", "close", "auto_done"]);
const once = (xs) => [...new Map(xs.map((x) => [JSON.stringify(x), x])).values()];

export function policyOf(m = {}) {
  return { direction: m.direction ?? "both", map: m.status_map ?? {}, notify: new Set(m.notify ?? []), policy: { done: "source_to_mirror_only", ...(m.policy ?? {}) } };
}

export function actionsFor(mirror, event) {
  const p = policyOf(mirror), status = String(event.status ?? ""), out = [];
  if (p.notify.has(status)) out.push({ type: "notify", issue: event.control_issue ?? event.source_issue, status });
  if (event.side === "source" && ["source_to_mirror", "both"].includes(p.direction)) {
    const to = p.map.source_to_mirror?.[status] ?? p.map[status] ?? (status === "Done" ? "Done" : null);
    if (to) out.push({ type: "transition_mirror", issue: event.control_issue, to });
  }
  if (event.side === "mirror" && ["mirror_to_source", "both"].includes(p.direction)) {
    const to = p.map.control_to_source?.[status] ?? p.map[status];
    if (to && !(status === "Done" && p.policy.done !== "allow_mirror_to_source")) out.push({ type: "transition_source", issue: event.source_issue, to });
  }
  return once(out);
}

export function createMirrorExecutor({ jira, notify, seen = new Set(), log = () => {} }) {
  return async function execute(mirror, event) {
    const key = `${mirror.id ?? "mirror"}:${event.issue ?? event.source_issue}:${event.status}:${event.updated ?? ""}`;
    if (seen.has(key)) return { duplicate: true, key, actions: [] };
    const actions = actionsFor(mirror, event); seen.add(key); const results = [];
    for (const a of actions) {
      if (a.type === "notify") { await notify?.({ mirror, event, action: a }); results.push({ ...a, ok: true }); continue; }
      if (a.type === "transition_source" && FORBIDDEN.has("auto_done") && a.to === "Done" && policyOf(mirror).policy.done !== "allow_mirror_to_source") { results.push({ ...a, ok: false, blocked: "source_done_forbidden" }); continue; }
      if (a.type === "transition_mirror" || a.type === "transition_source") { await jira.transition(a.issue, a.to, { side: a.type === "transition_source" ? "source" : "mirror" }); results.push({ ...a, ok: true }); continue; }
      results.push({ ...a, ok: false, blocked: "forbidden_action" });
    }
    log(`mirror ${mirror.id ?? "?"}: ${event.side} ${event.issue ?? event.source_issue} ${event.status} -> ${results.length} action(s)`);
    return { duplicate: false, key, actions: results };
  };
}
