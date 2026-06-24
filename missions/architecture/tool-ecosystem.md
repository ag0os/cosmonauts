# Agent Tool Ecosystem — Forward Architecture & Roadmap

**Status:** Forward source of truth for cosmonauts' agent tool surface — the audit
verdict, the "native not bolted-on" theme, and the web-research + browser gaps.
Companion to the `agent-tools` roadmap entry. **Absorbs** `web-search-tool`,
`web-fetch-tool`, `browser-tool`. Last updated 2026-06-13.

## Audit verdict — the pattern is healthy

- **One consistent authoring pattern, no drift.** Every custom tool is
  `pi.registerTool({ name, label, description, parameters: Type.Object(...),
  execute })` with TypeBox → `{ content, details }`. ~15 tools, zero one-offs.
- **Two tool sources:** Pi built-ins gated by the `tools` preset
  (`coding`/`readonly`/`verification`/`none` → read/bash/edit/write/grep/find/ls);
  custom tools via `extensions` (always callable once the extension loads).
- **Capabilities (prompt docs) and extensions (enable) are decoupled** — a new
  tool needs *both* a capability doc and an extension.
- **The one gap in the pattern:** it's code-first, **undocumented in prose** — no
  tool-authoring contract or template. Fine internally; a sharp edge once
  installable domains let outsiders add tools → **owned by `domain-plugins`**
  (cross-link), not built here.

## The theme — native, not bolted-on

Agents reach for capabilities that feel **native**: registered tools (typed
params, structured returns, present in the always-on tool list) documented by a
capability. They don't reach for bolted-on ones — an *absent* capability, or a
*shell-out skill they must remember to load*. Both current gaps are this same
disease, and the fix is the same: surface the capability as a native registered
tool + an explicit capability doc.

## Gap 1 — Web research (absent)

Confirmed: no `web_search` / `web_fetch`, no `pi-skills` wired. Cosmonauts agents
have **zero native research** — the felt pain that sends you to Claude Code/Codex.

- **Primitives:** build native `web_search` + `web_fetch` (the `registerTool`
  pattern), behind a **pluggable search backend** (Brave / Tavily / Exa / SearXNG —
  configured, not hardcoded).
- **Research is a composition, not a tool:** once the primitives exist, a thin
  `researcher` skill/agent loops search → fetch → synthesize. This also unblocks
  superplanning's `product-researcher` (designed around a future web-search
  capability).
- **Pi-First:** evaluate `pi-skills` brave-search first; lean native for control +
  reliability + the clean pattern (it's small).

## Gap 2 — Browser (under-surfaced, not unwanted)

A `playwright-cli` skill exists (`bundled/coding/skills/playwright-cli/`) but
is under-used because it doesn't feel native — and that low usage is a *surfacing*
problem, not a need problem (browser automation is used heavily in Claude
Code/Codex):

- It's a **shell-out skill, not a registered tool** → friction (load skill, build
  `bash`, parse YAML snapshots), and it's not in the always-on tool list.
- **Not self-contained:** requires a global `npm install -g @playwright/cli` and
  defers its real command reference to externally-generated `.claude/skills/`
  files — baking in a Claude-Code path and violating the stack-agnostic
  shipped-skill rule.
- **`coding`-domain only** → `cosmo` never sees it.

Fix, cheap → native (keep **Playwright** as the engine — it's enough for starters):

- **Sharpen the skill first:** inline the command reference (self-contained), make
  it stack-agnostic, crisp use-cases, surface it to `cosmo` + coding agents.
- **Upgrade if usage stays low:** a thin native `browser` tool wrapping the
  Playwright CLI under `registerTool` + a capability doc.
- **No engine change** (no CDP-direct / new engine) until there's a concrete need.

## Forward slices

- **S1 — Web research** *(active slice → `agent-tools`)*. `web_search` + `web_fetch`
  primitives (pluggable backend) → a `researcher` skill/agent. Pi-First: evaluate
  brave-search.
- **S2 — Browser.** Sharpen the `playwright-cli` skill (self-contained,
  stack-agnostic, surfaced); optional native `browser` tool wrapper if usage stays
  low.
- **Cross-cutting — tool-authoring contract.** Document the `registerTool`
  convention + a template; rides with `domain-plugins`.

## Open decisions

- Search backend default (Brave free tier / Tavily / Exa / SearXNG) and whether
  it's user-configurable per project.
- `web_fetch`: its own tool vs. part of `web_search`'s content extraction.
- `researcher` as a skill (any agent loads it) vs. a dedicated sub-agent.
- Browser: stop at a sharpened skill, or commit to the native tool wrapper now.

## Consolidation ledger

- **Absorbs ROADMAP ideas:** `web-search-tool` (→ S1), `web-fetch-tool` (→ S1),
  `browser-tool` (→ S2).
- **Cross-links (not absorbed):** `domain-plugins` (tool-authoring contract);
  superplanning-integration's `product-researcher` (consumer of web research).
