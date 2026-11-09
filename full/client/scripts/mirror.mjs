// Control-board mirror policy. Pure planning only: Jira writes are performed by the listener
// after this plan is validated. Source boards never receive comments/labels/assignments.
const FORBIDDEN = new Set(["comment", "label", "assign", "attach", "worklog", "auto_done", "close"]);
export function normalizePolicy(m = {}) {
  return { direction: m.direction ?? "both", status_map: m.status_map ?? {}, notify: new Set(m.notify ?? []), policy: { done: "source_to_mirror_only", source_actions: ["mapped_transition"], forbidden_source_actions: [...FORBIDDEN], ...(m.policy ?? {}) } };
}
export function eventKey({ mirrorId, issue, status, updated }) { return `mirror:${mirrorId}:${issue}:${status}:${updated ?? ""}`; }
export function planMirrorEvent(mirror, event) {
  const p = normalizePolicy(mirror), out = [], status = String(event.status ?? "");
  if (p.notify.has(status)) out.push({ type: "notify", issue: event.controlIssue ?? event.issue, status });
  if (["source_to_mirror", "both"].includes(p.direction) && event.side === "source") {
    const target = p.status_map.source_to_mirror?.[status] ?? p.status_map[status];
    if (target) out.push({ type: "transition_mirror", issue: event.controlIssue, to: target });
    if (status === "Done" && p.policy.done === "source_to_mirror_only") out.push({ type: "transition_mirror", issue: event.controlIssue, to: "Done" });
  }
  if (["mirror_to_source", "both"].includes(p.direction) && event.side === "mirror") {
    const target = p.status_map.control_to_source?.[status] ?? p.status_map[status];
    if (target && !FORBIDDEN.has("mapped_transition") && !(status === "Done" && p.policy.done !== "allow_mirror_to_source")) out.push({ type: "transition_source", issue: event.sourceIssue, to: target });
  }
  return out.filter((x, i, a) => a.findIndex((y) => JSON.stringify(y) === JSON.stringify(x)) === i);
}
export function validateAction(a) { return a.type === "transition_source" ? ["transition_source"].includes(a.type) : !FORBIDDEN.has(a.type.replace(/^transition_/, "")); }
