# Pi 0.87.1 upgrade — status

Branch `upgrade/pi-0.87.1` (worktree `cosmonauts-framework-health`), rebased onto local `main` 838f7ad.

- `bfce9b79` Upgrade Pi packages to 0.87.1 (one rebase conflict in `lib/orchestration/session-factory.ts`, resolved keeping main's `resolveQualitySkillPaths`)
- `ed1a744a` JSON-typed tool args in one test; pi skill re-audit
- `3d871232` review round 1 remediation: session-level real-Pi contract test, skill doc corrections
- `be0feada` review round 2 remediation: contract assertions made able to fail
- `f790678d` review round 3 remediation: contract premises tightened
- `09b08c87` Kimi MEDIUM-1: observability `turn_end` mock typed `satisfies TurnEndEvent`
- `8dab3578` user ruling (a): document default prompt-cache warming (docs/orchestration.md stats, pi skill cost tracking)
- `64dca3c9` user ruling: ROADMAP `pi-lockstep-bump` closed; wrong 0.84 premise noted in the commit message

**Ready to merge** at `64dca3c9` (8 commits on main 838f7ad): lint green, full suite 3441/3441 on the doc/ROADMAP edits.

**Branch verified** at `09b08c87` (6 commits on main 838f7ad; not pushed/merged). Gates all green on that HEAD: 3441/3441 tests, `tests/pi-contract/` 11/11, lint, typecheck, `check:suppressions -- --base main`, `check:reachability` (198/198). Both review channels SHIP (Claude rounds 1-3; Kimi K2.5).

Round 2 (Claude, on `3d871232`): **SHIP**, one medium + two lows, all in the new test/header:
  1. (medium) "prompt still reaches the provider" could not fail — the forced-prompt extension rebuilds the head regardless → split into a no-override run that pins Pi's system-prompt restore after a `context` prune; mutation-probed (a `context_with_system` strip fails it).
  2. (low) no positive control that earlier turns reach the provider → assert request 2 carries "first" and "reply 1"; mutation-probed.
  3. (low) behavior-contract header overclaimed → narrowed (multi-handler message merging and tool allowlist listed as uncovered).
  Round 3 (Claude, on `be0feada`): **SHIP**, no high/medium; its five Pi-runtime mutation probes (restore removed, system messages leaked to `context`, handler result ignored, history dropped) each fail the intended test. Two lows applied: the restore test now asserts its own run pruned (`memory 2` only), and the history control matches structured `user:first` / `assistant:reply 1` turns instead of JSON substrings (so a TMPDIR containing "first" cannot satisfy it). Both mutation-probed.
  Follow-up — out of scope, pre-existing (not in this diff): `domains/shared/extensions/todo/index.ts:97-104` filters out every `todo-context` message, including the one injected that turn, so todos appear never to reach the provider. Follow-up candidate; not verified live.

## Review

- Round 1, Claude subagent: **SHIP**, no high/medium. Five lows:
  1. Pi 0.86 prompt-cache warming defaults to `"streaming"` → **Needs the user** (below).
  2. Skill `project_trust` row wrong (handler must return `{ trusted }`) → fixed.
  3. Skill context-edit replacement shape and `session.messages` description wrong → fixed.
  4. `ROADMAP.md` `pi-lockstep-bump` idea still pending, and its "0.84 removes the session APIs our factory is built on" is wrong (those were pi-agent-core harness APIs; we use `SessionManager`) → **Needs the user** (ratified roadmap text; left for the merge/archive step).
  5. Session-level Pi wiring was unpinned → added `tests/pi-contract/pi-session-contract.test.ts` (real `createAgentSession` + faux provider; mutation-probed: disabling the prune and doubling the forced block each fail their test).
- Second family: Kimi K2.5 via opencode (read-only), run by Shepherd — user's ruling while Codex is broken. Reviewed `bfce9b79`+`ed1a744a`; **SHIP** (file: `.shepherd/work/in-progress/pi-upgrade/kimi/review.md`).
  - MEDIUM-1 observability test `turn_end` mock missing 0.87 required fields → fixed in `09b08c87` (`satisfies TurnEndEvent`; dropping a field now fails typecheck).
  - MEDIUM-2 agents pin `openai-codex/gpt-5.6-sol` → intentional, no change (the user's work account has no GPT-6).
  - LOW judgment/narrative providers resolve models separately from the runtime they create → follow-up (reported, not verified; overlaps the `modelRegistry.stream` Pi-First item).
  - LOW test mocks' `pi.on()` return `void` instead of an unsubscribe → follow-up.
  - LOW orchestration `sendLiveMessage` relies on the `sendMessage` default instead of explicit `triggerTurn` → follow-up (we already only send when idle).
  - Pi-First list agrees with ours; adds `registerMarkdownTransformer` and `context_with_system` as candidates.

## Pi-First audit 0.80.6 → 0.87.1

Breaking changes that touched us (all handled in the diff): `modelRuntime` replaces `authStorage`/`modelRegistry` (0.80.8); JSON-only `ToolCall.arguments` / tool-result `details` types (0.86); `AgentContext`/provider inputs carry the system prompt as `role: "system"` messages (0.86, contract tests only).

Breaking changes checked and not affecting us: `shouldStopAfterTurn` removed, `turn_end` actionable boundary / `ExtensionRunner.emit` (observability handler returns nothing), `agent.state.messages` assignment no longer canonical (unused), `context` handlers no longer see system messages (our handlers filter custom types only), `before_agent_start` forced `systemPrompt` sent unrecorded (project-tools; now pinned), `session.messages` includes `system` role (all readers filter by assistant role), `sendMessage` `triggerTurn:false` no longer steers (we only send when idle), `user_bash` fail-closed (unused), JSON/RPC `message_update` delta-only (unused), TypeBox 1.3 inside Pi vs our pinned 1.1.33 (reviewer cross-validated our schema shapes; no breakage).

New Pi features that could obsolete custom code (not adopted):
- `agent_before_settle` / actionable `turn_end` boundaries (`continue: true`) — could replace parts of our spawn completion loop that re-prompt a session.
- `ctx.modelRegistry.stream()/streamSimple()` (0.86) — single-call LLM use without a full `AgentSession`; candidates: `cli/memory/judgment-provider.ts`, `cli/architecture/narrative-provider.ts`.
- Context edits (`appendContextEdit`, 0.87) — replace the `context`-handler filtering of stale injected messages (todo, agent-memory, knowledge-surface) with append-only omissions.
- `ui_prompt_start` / `ui_prompt_end` (0.84.4) — distinguish waiting-on-human from agent work; relevant to execution-liveness.
- `SessionManager.inMemory(cwd, {id}, entries)` restorable sessions (0.85) — session handoff/restore.
- Per-model `compaction.modelOverrides` (0.86) — could replace per-agent compaction plumbing.
- `pi.on()` returns unsubscribe (0.86) — simplifies extension teardown (orchestration cleanup).
- `terminate` on blocked `tool_call` (0.84.1); `session_compact_failed` event (0.84.3); `pi auth check` (0.84.1) for model preflight.

## Needs the user

None open — both items below were ruled 2026-09-25 (cache warming: option (a), documented in `8dab3578`; ROADMAP closed in `64dca3c9`).

### Ruled

- **Prompt-cache warming (Pi 0.86 default `"streaming"`).** While a session sits in a long tool call (e.g. a parent blocked in `spawn_agent`, chain, `run_driver`, a long test run) Pi may send 1-token cache-refresh requests on the full context, only when it estimates ≥ $0.05 avoided cache-miss cost. They count in `getSessionStats()` (so in our spawn stats/lineage) and consume subscription quota. It is a global Pi setting (`cacheWarming: off|streaming|idle`). Options: (a) keep Pi's default and document it (recommended: it is cost-aware and saves money on API billing); (b) force `cacheWarming: "off"` for cosmonauts-spawned sessions; (c) off everywhere via the user's `~/.pi/agent/settings.json`.
- **ROADMAP `pi-lockstep-bump` idea** (ratified slate): this branch completes it. Remove/close it at merge, and note its "0.84 removes our session APIs" premise was wrong.

## Resolved

- Codex cannot start on this machine (`Failed to load cloud config bundle (workspace-managed policies)` on every `codex exec`, while `codex login status` says logged in). User ruled: Kimi K2.5 replaces Codex as the second-family reviewer for this branch.
