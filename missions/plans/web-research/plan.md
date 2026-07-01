---
title: 'Native web research — web_search + web_fetch + researcher (agent-tools S1)'
status: deferred
createdAt: '2026-06-30T20:30:26.132Z'
updatedAt: '2026-07-01T00:00:00.000Z'
---

## Status

**Deferred to backlog 2026-07-01.** Parked in favor of delegating research to an
external, already-web-enabled harness (Codex / Claude Code) — see
`missions/plans/research-delegation/`. The delegation slice is cheaper (no new API
key or billing), reuses the existing driver seam, and directly attacks this track's
Purpose ("the human has to leave for Claude Code/Codex") from the other side.

**Revisit this native slice when fully-autonomous chain runs need grounded/cited
facts** — that is the mode delegation does *not* serve (no interactive harness is
wired, and prose answers are not machine-consumable). The `agent-tools` track stays
in `ROADMAP.md`; this plan is the warm spec for the native build when that need
arrives.

## Summary

S1 of the `agent-tools` capability track (`missions/architecture/tool-ecosystem.md`):
give Cosmonauts agents **native** web research so they stop leaving for Claude
Code/Codex. Two registered tools — `web_search` and `web_fetch` — behind a
pluggable search backend, plus a loadable `researcher` skill that composes
search → fetch → synthesize. "Native" means typed params, structured returns,
presence in the always-on tool list, and a capability doc — not a shell-out skill.
**Deferred (see Status); awaits planner design when revived.**

## Scope

Web research only. `web_search` + `web_fetch` primitives, a pluggable search backend,
backend/key configuration, the `researcher` skill, capability docs, and wiring into
the `shared` domain so `cosmo` and coding agents both reach them. Browser automation
(S2) and the tool-authoring contract (rides with `domain-plugins`) are out of scope.
Implementation details are deferred to the planner.

## Research findings (2026-07-01) — keep warm for revival

Two background investigations ran before parking. Durable conclusions, so a future
planner doesn't re-derive them:

- **Pi-First (build-vs-reuse): build native.** Installed Pi 0.79.8 ships **no** web
  tools (hard-coded 7-tool union: read/bash/edit/write/grep/find/ls) and no reusable
  HTTP/extraction helper (`undici` is present only as LLM-transport plumbing). Nothing
  installed obsoletes the native `registerTool` approach. Best **reference
  implementations to crib from** (none clean enough to depend on): `badlogic/pi-skills`
  `brave-search/content.js` (Readability+turndown recipe + exact Brave request shape),
  `sids/pi-extensions` (separate `web_search` + `fetch-url` tools, Brave), and
  `coctostan/pi-web-tools` (`registerTool` + Exa). Avoid `demigodmode/pi-web-agent`
  (AGPL-3.0 + mega-tool shape). For `web_fetch` extraction: **@mozilla/readability +
  linkedom + turndown** (linkedom, not jsdom — far lighter), or **defuddle** for fewer
  deps. Brave backend itself is a ~50-line fetch wrapper.

- **Backend default must change — Brave's free tier ended Feb 2026** (card required,
  uncapped metered billing). This **invalidates this spec's assumption** that a
  free-tier Brave key is an acceptable default. No open-source backend is reliable
  enough to be a hands-off default (SearXNG scrapes engines that fight back + JSON API
  off by default; Whoogle EOL Apr 2026; YaCy/Marginalia own indexes but too weak/niche;
  Mojeek is the best independent index but proprietary). Recommended when revived:
  **default → Tavily** (free 1,000 credits/mo, no card), **Exa** alternate (free 1,000
  req/mo, own neural index), **Brave** premium opt-in, **SearXNG** as the supported
  OSS/self-host backend (operator enables `json` in `search.formats`, runs the limiter,
  de-prioritizes Google). Keep the pluggable interface — it is vindicated.

- **Prefer search-API mode over answer-API mode.** Tavily `include_answer` / Exa
  `/answer` pre-synthesize inside the backend, duplicating the `researcher` layer and
  making the seam behave differently per backend. Keep synthesis in our `researcher`
  skill; normalize every backend to `{ title, url, snippet }`.
