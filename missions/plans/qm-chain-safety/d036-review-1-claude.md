# D-036 review 1 — Claude channel (Opus 5.5 subagent), condensed

Verdict: **DO-NOT-SHIP-YET** (SHIP once F-1 lands).

- **MEDIUM F-1:** `lib/config/loader.ts:221-225` validates `reviewerModel` with `/^[^/\s]+\/[^/\s]+$/`, so the model id cannot contain a slash. Pi's `resolveModel` splits on the first slash and 588 of Pi 0.80.6's 1057 catalog models have slash-bearing ids (openrouter, groq, fireworks, together, huggingface, nvidia, vercel-ai-gateway, cloudflare). Setting `openrouter/anthropic/claude-sonnet-4.5` makes every cosmonauts command fail with `Invalid qualityReview.reviewerModel`. Under "No constraint" this is a model constraint. Fix: `^[^/\s]+\/\S+$` plus a test.
- **LOW F-2:** an old `diverseReviewerModel` / `modelFamilies` key is dropped silently. Safe, and acceptable under the ruling.
- **LOW F-3:** nothing pins "the verdict does not change when the configured and observed generalist models differ". An injected substitution-failure branch survived 1113 tests. No live accidental route; this is a regression-pin gap only.
- **Q1:** no model-family coupling is left on any live surface. The only hit is the new negative regex.
- **Q2:** nothing is broken except F-1. The override still reaches only the generalist through the real spawn path. An unset override means shipped models with no item. D-019's checks half, the D-031/D-032 floors, D-025, D-026 and INV-001..005 are intact. The mutation checks of the new test caught 4 of 6 reintroductions; the unresolvable-provider one was caught by the one-pass test, and the substitution one by nothing (F-3). The reviewer agrees that `assertQualityReviewModelIdentity` and the Reviewer models record are evidence integrity, not a model constraint.
- **Gates in the clone:** 3433/3433 tests; lint, typecheck, reachability 198/198, suppressions and check-artifacts all pass.
- **Residuals:** only the generalist has a config knob; the QM and specialists use their shipped definitions (D-036 scope). The amendment-3 `ratifiedBy` still names the D-030 ratification. This repository runs its generalist on the shipped `openai-codex` model.
- **Hostile-only (D-027):** a committer edits the base `reviewerModel`, or tampers with reviewer artifact metadata.
