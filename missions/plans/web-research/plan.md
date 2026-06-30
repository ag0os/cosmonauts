---
title: 'Native web research — web_search + web_fetch + researcher (agent-tools S1)'
status: active
createdAt: '2026-06-30T20:30:26.132Z'
updatedAt: '2026-06-30T20:30:26.132Z'
---

## Summary

S1 of the `agent-tools` capability track (`missions/architecture/tool-ecosystem.md`):
give Cosmonauts agents **native** web research so they stop leaving for Claude
Code/Codex. Two registered tools — `web_search` and `web_fetch` — behind a
pluggable search backend (default **Brave**), plus a loadable `researcher` skill
that composes search → fetch → synthesize. "Native" means typed params, structured
returns, presence in the always-on tool list, and a capability doc — not a
shell-out skill. This plan is spec-ready and **awaits planner design** (architecture,
behaviors, quality contract).

## Scope

Web research only. `web_search` + `web_fetch` primitives, a Brave backend behind a
pluggable interface, backend/key configuration, the `researcher` skill, capability
docs, and wiring into the `shared` domain so `cosmo` and coding agents both reach
them. Browser automation (S2) and the tool-authoring contract (rides with
`domain-plugins`) are out of scope. Implementation details are deferred to the
planner.
