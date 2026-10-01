# Coordinator brief — lean coding domain, wave 3a (first live runs)

Same rules, sources and precedence as `coordinator-brief.md` (wave 1): read its "North star" and
"How to work" first. Your predecessor's handoff is the `# ROTATE` block at the top of
`COORD-STATUS.md`; read it, then the wave-2 package table. Branch `feature/lean-domain` at
`793ee564`, worktree `/Users/cosmos/Projects/cosmonauts-framework-health`; run
`bun install --frozen-lockfile` first. Gates were green at HEAD on Shepherd's own run.

Constraints this wave: Codex and the Pi `openai-codex/*` models are unavailable until
2026-10-05. **Claude Code is available** as the external builder/reviewer backend
(`lib/agent-packages/claude-cli.ts`, used by `lib/lean-run`). A Pi-hosted role needs a model
Pi can reach today: `openrouter/deepseek/*` (about $4 of credit — use it for one smoke run at
most, not for iteration); the Pi anthropic OAuth is out of extra usage. The interactive `lead`
is therefore not exercised this wave; you (or a subagent) play the lead in pair mode: write
`plan.md` by hand from the contract template and start the run through the same code path
`lean_build` uses (`runBuild` with `createDefaultProviders()`), from a script in your scratchpad.

A whole-branch independent review is running in parallel (Shepherd's); its findings arrive via
Shepherd as a separate package later. Do not wait for it.

## Packages

**W3-1 — Wiring left open by wave 2** (ROTATE block item 1 and 2). `lean_build`/`runBuild`
build the context pack by default (`buildContextPack` from the plan's `Touches`/`Reuses`, budget
from config, default 1,500 tokens) and hand it to the builder prompt verbatim (brief §4.6);
regenerate `graph.json` with the file-graph pass before the blast-radius and mutation providers
when it is missing or stale (treat a loader throw as "regenerate now", closing wp3g-2 F-5);
wp3-3 F-7: bounded touch-signature cap in the overflow branch so a 100-file touch set still
renders some neighbours. Tests with stubs/fixtures. Bounded review loop as always. Merge first;
W3-2 runs on top of it.

**W3-2 — Live run 1, direct-fix tier, Claude Code backend** (brief §2 "direct", §4.7, §4.9).
Target: a real one-function fix on this branch — `lib/code-health` fails with EEXIST when the
repository tracks a `node_modules` symlink (W2-NOTE; tolerate an existing path when creating the
base-worktree symlink). Run it in a **scratch clone** of the worktree (`git clone` to a temp dir,
`bun install --frozen-lockfile`, so the private review workspace has a `main` and no linked
worktree), with `backend: claude-cli` for builder and code-reviewer, `createDefaultProviders()`,
and a hand-written one-paragraph direct-fix request (no plan). Observe and record in
`reviews/live-1.md`: wall time per stage; whether the builder's final line was a bare envelope
(parser result, OD-4 rule hit or not); every signal (`facts.json`) and whether it fired
correctly — verify commands, health on the changed function, blast radius (tests selected),
plan-vs-actual (n/a for direct), mutation (ranges, tests, killed/survived, wall time); whether
the health hook fired (it cannot on an external backend — confirm the run records that, brief
§4.7A); reviewer findings and whether its inputs (diff, facts) were complete; the generated
PR body (§4.9) rendered as Markdown; final status and `RunRecord` completeness. Then diff the
builder's change against what a human would write and say whether you would merge it. Do
**not** merge the builder's change to the branch from the scratch clone; if it is good, land
the same fix through a normal subagent package with tests (that is also a comparison point).

**W3-3 — Live run 2, plan tier, Claude Code backend** (brief §2 "plan only", §4.4, §4.6).
Target: wp3-3 F-7 is already done in W3-1, so pick the next real multi-module item from the
ROTATE "Low opens" list that touches ≥2 modules (e.g. wp4m "only-NoCoverage → info" plus the
npm-consumer `info` degradation, or wp5-2 F-8..F-10 if they span modules). Write `plan.md` with
the §4.4 template (Approach, Touches, Reuses from a real `cosmonauts architecture slice`,
Behaviors B-1..n, Risks, one Mermaid diagram), run as in W3-2 with the context pack on, and
record `reviews/live-2.md` with the same observations plus: did the builder reuse what `Reuses`
named, did plan-vs-actual report unplanned files, was the context pack within budget and did
the builder visibly use it (cite its transcript). Same merge rule as W3-2.

**W3-4 — Smoke run on Pi with DeepSeek** (D-3: Pi first for the hook). One run only, direct-fix
tier, same request as W3-2, `backend: pi` with model `openrouter/deepseek/deepseek-chat` (check
the exact id Pi accepts: `cosmonauts --list-models` or the Pi catalog) for builder and
code-reviewer. Purpose: prove the Pi path end to end — session stats recorded, the post-edit
health hook loads and stays silent on a clean edit (force one regression if cheap: ask the
builder to also inflate a function), envelope parsed. Record `reviews/live-3.md`. Stop at one
run regardless of outcome; if DeepSeek cannot follow the envelope contract, that is the finding.

**W3-5 — Contract inventory and cost sheet** (brief §1 "measured by how many contracts it
deletes", WP6 inputs). Count for lean vs coding: agents, prompt words, capability words,
skill words a role must load, output grammars, protocol sections, per-backend variants. Produce
the table as `missions/reviews/lean-contracts.md` (allowed by brief §5 "evaluation report") with
the counting method stated so WP6 can reuse it. No model calls.

Order: W3-1 → (W3-2, W3-5 in parallel) → W3-3 → W3-4. WP0 baseline and WP6 wait for Codex and
are not in this wave. When done, update COORD-STATUS (new `## Wave 3a` section), mark
"WAVE 3a DONE", and write ROTATE if you are near 45%.
