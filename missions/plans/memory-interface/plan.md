---
title: Shared memory interface + plain-text substrate (agent-memory W1)
status: active
createdAt: '2026-07-07T00:48:01.000Z'
updatedAt: '2026-07-07T01:10:00.000Z'
---

## Summary

Spec-ready plan for Wave 1 of the `agent-memory` track: extract the shared
pluggable memory interface (`write` / `retrieve(scope, query)` /
`consolidate`) now that its two source implementations exist, stand up the
plain-text OKF substrate with scope-filtered retrieval, retrofit the shipped
code-structure map's retrieval onto the interface without changing its
behavior, and ship one thin end-to-end authored record ("remember this" →
recall in a later session) so `write()` has a real caller. For agents and
Cosmo that consume memory, the human who owns the (unchanged) architectural
map and can read/prune every record, and the developer who builds W2 on this
foundation. Awaits planner design.

## Scope

The interface + plain-text substrate + scope-filtered retrieval (project and
user scopes; session scope gated on an in-scope Pi-First audit) + the
architectural-memory retrieval retrofit + one authored record type recalled
end-to-end via a `recall()` tool and compact-index injection. Excludes W2's
full profile/playbook records, W3 episodic log, W4 background consolidation,
any embedding/SQLite backend, and everything in the autonomy track. The four
scope-shaping choices (thin-sliver MLV, sibling stores per scope,
index-inject + pull recall, slug) were ratified by the human 2026-07-07 —
see spec Assumptions.
