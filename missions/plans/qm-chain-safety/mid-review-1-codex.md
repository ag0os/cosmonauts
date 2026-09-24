---
kind: independent-review
plan: qm-chain-safety
channel: codex exec -m gpt-6-sol -c model_reasoning_effort=high --sandbox read-only
scope: Stages 1-6, e43c238..b437cd1
date: 2026-09-24
---

# Mid-branch review 1 — codex

The prompt is saved alongside as mid-review-prompt.md. Final message verbatim:

## Findings

1. **HIGH — The QM receives a host run-store path.** [quality-review-launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:167) puts the absolute `hostRunStoreRoot/artifacts/qm/checks.md` path in the agent’s prompt. That reveals a path back into the operator checkout to a session with file-reading tools, contrary to D-004’s “no path back” rule and D-006/D-012’s host-only artifact boundary. **Breaks B-002, D-004, D-006, D-012, R-012.**

2. **HIGH — Snapshot analysis consent never reaches the analysis provider.** [quality-review-run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:218) creates an in-memory authorization, but [quality-review-launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:144) does not pass it to the session or project-tools extension. The provider instead looks up consent for its current `cwd`, the random clone path, in [fallow-provider.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/fallow-provider.ts:1509). With consent granted for the source checkout, the QM’s direct audit remains unbound. **Breaks AC-016, B-006, D-004.**

3. **HIGH — A called but unbound audit can still yield `ready`.** [quality-review-launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:20) counts non-error tool completions without inspecting the audit result. An unbound capability returns an ordinary result in [project-tools/index.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/project-tools/index.ts:418). [quality-review-run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:361) then checks only that the model wrote *something* under Gates. If it writes “passed” after an unbound audit and the host checks pass, the host can persist `ready` without a completed analysis gate. **Breaks INV-005, AC-016, B-006/B-007.**

4. **HIGH — The specialist review procedures were removed for all callers.** The new [security](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/security-reviewer.md:3), [performance](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/performance-reviewer.md:3), [UX](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/ux-reviewer.md:3), and [generalist](/Users/cosmos/Projects/cosmonauts/bundled/coding/prompts/reviewer.md:3) prompts replace the base versions’ review dimensions, verification methods, scope workflow, and findings format with two short paragraphs. They also assume host materials and a private checkout. A direct spawn by `cody` or `cosmo` has neither, while the new prompts prohibit the commands previously used to establish diff scope. Specialist lens capability is not preserved. **Breaks AC-016, B-006.**

5. **MEDIUM — Agent tools fail open when caller identity is missing.** [chain-tool.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/chain-tool.ts:127) and [driver-tool.ts](/Users/cosmos/Projects/cosmonauts/domains/shared/extensions/orchestration/driver-tool.ts:195) skip authorization when the system-prompt identity marker cannot be extracted. In a markerless tool invocation, `chain_run` can start a parsed target and `run_driver` can proceed toward a worker run; `spawn_agent` correctly refuses the same unresolved caller. **Breaks AC-001, B-001’s unknown-caller fail-closed rule.**

6. **MEDIUM — Panel triage misses user-facing CLI changes.** [quality-review-launch.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-launch.ts:197) selects UX review only by UI file extensions, `/views/`, or `<form`. A change to an error message or interactive flow in `cli/main.ts` with none of those strings receives only the generalist, although the UX lens covers CLI flows. **Breaks AC-016, B-006 and Design §6’s applicable-specialist triage.**

7. **MEDIUM — The QM assessment has no host timeout while its prompt is running.** [agent-spawner.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/agent-spawner.ts:236) awaits `session.prompt()` without a deadline; its five-minute timeout applies only later, while waiting for child completions. If the manager’s model call never settles, [quality-review-run.ts](/Users/cosmos/Projects/cosmonauts/lib/orchestration/quality-review-run.ts:276) remains in `assessing`, with the private workspace retained and no terminal verdict. **Breaks B-004’s liveness outcome.**

**Verdict: DO-NOT-SHIP-YET for Stages 1–6.** The path exposure, disconnected analysis consent, and unverified gate result are sufficient blockers.

Verification was source and test inspection. The focused `bun run test` command executed **zero tests**: Vitest startup was denied when it tried to write `node_modules/.vite-temp` in this read-only sandbox. I did not run the Quality Manager or modify repository files.
