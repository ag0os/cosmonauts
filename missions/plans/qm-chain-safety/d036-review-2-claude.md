# D-036 review 2 — Claude channel (Opus 5.5 subagent), condensed

Verdict: **SHIP.**

- **Scope:** clone at `69b6c03`. Mutations ran in a second clone; the source repository was untouched.
- **Findings:** no HIGH, no MEDIUM.
  - **LOW L-1:** the loader's negative tests pin only the no-slash case. Loosening the regex to `/\//` stays green. There is no live defect.

**Dispositions:**
- **F-1 / UR-002 RESOLVED.** `lib/config/loader.ts:223` uses `^[^/\s]+\/\S+$`, and the test is `tests/config/loader.test.ts:107-120`. Restoring the old regex fails that test.
- **F-3 RESOLVED.** The fourth B-011 case is at `quality-review-run.test.ts:1600-1604`. Two injected substitution branches, one a human item and one an integrity throw, each fail it.
- **UR-003 RESOLVED.** The error message is at `loader.ts:225-227`, and a test pins it.
- **F-2 / UR-001 ACCEPTED.** The legacy keys are absent from `main` and `origin/main`.
- **UR-004 ACCEPTED.** These were the deliberate e2e sentinels.

**Q2:** no regression found.
- All of these are rejected: no slash, empty provider, empty id, whitespace (including NBSP and an em-space), and non-strings.
- All 1057 `provider/id` pairs in Pi 0.80.6's catalog pass the loader (0 rejected) and round-trip through `resolveModel`.

**Q1:** no model-family coupling and no model constraint is left on any live surface. The only rule left is the `<provider>/<model-id>` syntax that `resolveModel` needs.

**Gates in the clone:** 3435/3435 tests; lint, typecheck, reachability 198/198, suppressions and check-artifacts all pass.

**Residuals:**
- L-1.
- An unresolvable but well-formed `reviewerModel` fails at reviewer spawn, not at config load.
- Only the generalist has a model knob (D-036 scope).
- The D-031/D-032/D-035 limits.
- The D-027 hostile routes.
