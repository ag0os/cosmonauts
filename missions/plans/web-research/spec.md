## Purpose

Cosmonauts agents have **zero native web research**. There is no `web_search` or
`web_fetch`, and no search backend is wired. When an agent — or `cosmo` acting as
an assistant — needs current or external information, the human has to leave for
Claude Code/Codex. That is the felt pain this slice removes.

The fix follows the project's "native, not bolted-on" theme: agents reach for
capabilities that are **registered tools** (typed params, structured returns,
present in the always-on tool list, documented by a capability), not for an
*absent* capability or a *shell-out skill they must remember to load*. This slice
ships web research as native tools plus a thin composition skill.

This is **S1** of the `agent-tools` track. Browser automation is S2 (separate
plan). Source of truth: `missions/architecture/tool-ecosystem.md`.

## Users

- **`cosmo` (executive assistant)** — answers questions that need current or
  external facts in-session, with citations, instead of sending the human elsewhere.
- **Coding agents** (planner, worker, reviewers) — look up libraries, APIs, error
  messages, and docs inline while designing or implementing, without a context
  switch.
- **The human pairing with an agent** — gets grounded, cited answers during the
  conversation rather than a "go check the web yourself" hand-off.
- **`superplanning`'s future `product-researcher`** — was designed around a web
  research capability that does not exist yet; these primitives unblock it (it is
  not built here).

## User Experience

### Searching and fetching as native tool calls

An agent calls `web_search("rust async runtime comparison")` and gets back
structured results — each with a title, URL, and snippet — from the configured
backend (Brave by default). It calls `web_fetch("https://…")` and gets the page's
readable content (cleaned text/markdown), not raw HTML. Both tools are in the
always-on tool list, so the agent never has to load a skill to reach them, and each
has a capability doc describing when and how to use it.

### Research as a composition

For multi-step questions, the agent loads the `researcher` skill, which loops
search → fetch → synthesize: run a search, fetch the most relevant results,
extract what matters, and return a synthesized answer **with source URLs cited**.
Any agent (including `cosmo` and the future `product-researcher`) can load it; it
is not a separate agent to spawn.

### Configurable, pluggable backend

Brave is the default backend, but the backend is pluggable: a project can point the
same tools at a different provider through configuration without any change to
calling agents. The backend's API key is supplied through configuration/environment,
not hardcoded.

### Failure and edge flows

- **Missing or invalid API key** — the tool returns a clear, actionable error
  ("set BRAVE_API_KEY" or equivalent), not an unhandled crash or a silent empty
  result.
- **Backend error / rate limit / timeout** — surfaced as a graceful, readable tool
  error the agent can reason about and retry or report.
- **No results** — a valid empty result, distinguishable from an error.
- **`web_fetch` on a hostile or awkward target** — non-HTML content, very large
  pages, redirects, and unreachable URLs are handled within bounds (size/time caps)
  rather than hanging or dumping raw bytes. Requests to internal/loopback/private
  addresses must be handled as a security boundary (see Open Questions) — `web_fetch`
  is a server-side request surface.

## Acceptance Criteria

- An agent can call `web_search(query)` and receive structured results (title, URL,
  snippet) from the configured backend; with no backend explicitly configured, the
  default is Brave.
- An agent can call `web_fetch(url)` and receive readable extracted content (text or
  markdown), not raw HTML, within enforced size/time bounds.
- Both `web_search` and `web_fetch` are registered tools present in the always-on
  tool list, each with a capability doc; `cosmo` and coding agents can both reach
  them.
- The search backend is pluggable: changing the configured backend changes the
  provider used, with no change required in calling agents; Brave is the shipped
  default implementation.
- A missing or invalid backend API key produces a clear, actionable error message
  (naming the env/config key to set), not an unhandled exception or a silent empty
  result.
- The `researcher` skill exists, is loadable by any agent, and composes search +
  fetch into a synthesized answer that cites its source URLs.
- Backend/rate-limit/timeout failures and empty-result cases are handled as
  distinct, readable outcomes.
- Full project gates pass; `web_search`, `web_fetch`, and the backend interface have
  direct test coverage with the network/backend mocked (no live calls in the suite).

## Scope

Included:
- `web_search` and `web_fetch` registered tools (the established `pi.registerTool` +
  TypeBox → `{ content, details }` pattern).
- A Brave search backend implementation behind a pluggable backend interface.
- Configuration for backend selection and the backend API key (env/config).
- The `researcher` loadable skill that composes the primitives into cited synthesis.
- Capability docs for the new tools, and wiring into the `shared` domain so `cosmo`
  and coding agents both get them.
- Tests for the primitives and the backend interface, with the backend mocked.

Excluded:
- Browser automation (S2 — separate plan): sharpening `playwright-cli` / a native
  `browser` tool.
- Shipping backends beyond Brave (the interface is pluggable, but only Brave is
  implemented in S1 unless the planner decides a second proves the seam — see Open
  Questions).
- The cross-cutting tool-authoring contract/template (rides with `domain-plugins`).
- The `product-researcher` agent itself (a `superplanning` consumer).
- Caching/result memory, embeddings, or semantic retrieval of results.

## Assumptions

- The search backend requires a paid/metered API key — **Brave's free tier ended
  Feb 2026** (card required), invalidating the original "free-tier key is an acceptable
  default" assumption. Recommended default on revival is **Tavily** (free 1,000
  credits/mo, no card), with Brave demoted to a premium opt-in and **SearXNG** offered
  as the OSS self-host backend. Keys are supplied via environment/config, not committed.
  (See `plan.md` → Research findings.)
- `web_fetch` is a **separate** tool from `web_search` (composable), not folded into
  search-result content extraction.
- Built **native** on `pi.registerTool` rather than depending on `pi-skills`
  brave-search — chosen for control and the clean established pattern; the planner
  should re-confirm Pi/​pi-skills provides nothing that obsoletes this (Pi-First).
- The tools live in the **`shared`** domain (both `cosmo` and coding agents need
  them); the capability doc goes in `domains/shared/capabilities/` and the
  `researcher` skill in `domains/shared/skills/`.
- "Readable content" from `web_fetch` means server-side HTML-to-text/markdown
  extraction; no headless browser is involved (that is S2).

## Open Questions

- **Secret handling.** Where does the Brave API key live — env var only, or project
  config (`.cosmonauts/config.json`) with an env override? `lib/config/` does not
  handle secrets today; the planner must define the pattern (and avoid persisting
  secrets to tracked config).
- **`web_fetch` safety boundary.** Content-extraction depth (raw text vs
  readability/markdown), size/time caps, redirect handling, and — importantly —
  SSRF protection: should `web_fetch` refuse internal/loopback/private-network URLs?
  This is a security surface the planner + security-reviewer must spec.
- **Which backend is the default, and how many ship?** Given Brave's free tier is
  gone, the recommended default is **Tavily** (free, no card), with **Exa** as a
  second proving the seam, **Brave** as a premium opt-in, and **SearXNG** as the
  OSS/self-host backend. Open: how many of these ship in the first native slice vs.
  land the interface + one backend and extend later.
- **Session caching.** Should identical searches/fetches be cached within a session
  to cut cost and latency, or is that deferred past S1?
- **Researcher depth/budget.** Should the `researcher` skill bound how many
  fetches/iterations it performs per question, and is that configurable?
