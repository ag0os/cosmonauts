# OD-5 check: internal lean roles and the interactive spawn path

Worktree `cosmonauts-framework-health` @ `cf937448`, lean draft from agent worktree `ae8f0874`. Scripts: `/private/tmp/od5/repro{,2,3}.ts` (real `CosmonautsRuntime`, registry, parser, `runChain`, `createPiSpawner`).

## Reproduction

Extension runtime (`domains/shared/extensions/orchestration/index.ts:44` calls `CosmonautsRuntime.create` with no `domainOverride`, so `domainContext` = project config = `undefined`):

- `authorizeAgentStart(lean/lead -> lean/reviewer)` allows it. It passes `caller.domain` as requester (`authorization.ts:41-45`).
- Inline `runChain` fails with `Unknown agent role "lean/reviewer"`. Real spawner fails with the same text (`agent-spawner.ts:183`).
- `getModelForRole("lean/reviewer", …, undefined)` silently returns the fallback `anthropic/claude-opus-4-7`.
- With `domainContext="lean"` (CLI `-d lean`), everything resolves and the model is `gpt-5.6-sol`.

The diagnosis is right in substance, but some locations are off. The parser attaches `agentReference` only for non-default bindings (`chain-parser.ts:86-91`), so `lean/reviewer` reaches the runner with no reference. The failing calls are therefore these:
- inline: `chain-runner.ts:1306` (`resolveReference` → undefined), then `:1313` (`has`).
- durable (the default for `review`/`build`): `durable-chain-compiler.ts:304`, then `spawn-resolution.ts:33` and `:44`, not `:21`.
- `spawn_agent lean/reviewer|lean/verifier` is broken too: admission passes (`spawn-tool.ts:563-567`), then the spawner fails because `spawnConfig.domainContext` is undefined (`spawn-tool.ts:872`).

## (a) Carry the requester through

The touch set is larger than "small":
- `ChainConfig` and `SpawnConfig` fields (`types.ts:129,393`)
- `chain-tool.ts:185`, `spawn-tool.ts:872`
- `chain-runner.ts:442,1306,1311,1313,1339-1349,1399`
- `chain-episodes.ts:102`
- `durable-chain-compiler.ts:291,304,309,317,335`
- `durable-chain-runner.ts:866` (persisted spawn options, rehydrated)
- `spawn-resolution.ts:21,33,44`
- `model-resolution.ts:47,85`. These use `registry.get`, which has no requester parameter, so they would need to switch to `resolveReferenceResult`.

That is about 10–12 files and ~60–90 production lines, plus tests. The change is additive (an optional field). With the field absent, behavior is unchanged for coding/main/shared. No test pins the broken path. `tests/extensions/orchestration.test.ts:795` pins that `parseChain` receives `runtime.domainContext` plus the caller as requester, which stays compatible.

**Smaller fix (d):** in `chain-tool.ts` and `spawn-tool.ts`, use `const domainContext = runtime.domainContext ?? callerDef.domain` in place of `runtime.domainContext`. That is about 12 lines in 2 files. The repro confirms that `domainContext="lean"` makes every downstream site resolve, including model and thinking. It changes behavior only when project config has no domain: bare names from a caller then resolve in the caller's domain first (resolver step 3). For `coding/cody` this turns bare `reviewer` into `coding/reviewer`, which is the desired result. For `main/cosmo` there is no `main/<x>` collision, so the result is unchanged.

## (b) Rename and drop `internal`

Confirmed. With renamed ids and no `internal`, bare `reviewer`/`verifier` from a coding caller resolve to `coding/*`, and `getResolvedTarget("lean/critic", undefined)` is found with no framework change. Without the rename and without `internal`, the lookup returns `not-found` (ambiguous).

Lean draft edits:
- `domain.ts:9-11` and the role names in its description
- `agents/reviewer.ts`, `agents/verifier.ts` (file names and `id`)
- `prompts/reviewer.md`, `prompts/verifier.md` (file names and line 3)
- `agents/lead.ts:14`, `prompts/lead.md:23`, `chains.ts:9,14`
- spike docs `missions/architecture/spikes/lean-coding-domain/{README,check,domain-packaging}.md`

`lead` and `builder` collide with nothing: the only bare-name collisions across shared/coding/lean/main are `reviewer` and `verifier`.

**Name choice matters:** `stage-prompts.ts:153` treats a stage as a reviewer only if it is `reviewer` or `*-reviewer`. A `builder -> critic -> builder` chain would lose the "revision" stage prompt. `code-reviewer` keeps it and collides with nothing.

## (c) Keep names and `internal`, defer to `lib/lean-run/`

`SpawnConfig` takes `role` + optional `agentReference` + `domainContext`, never an `AgentDefinition` (`types.ts:383-393`). The spawner re-resolves (`agent-spawner.ts:181`). Even a supplied reference is re-checked with `getResolvedTarget(q, config.domainContext)` (`spawn-resolution.ts:21`).

So a runner works only if it passes `domainContext: "lean"`. Resolving with `resolveReferenceResult(…, "lean")` beforehand is not enough. That works, as the repro shows. `lib/lean-run/` does not exist yet.

What stays broken: from the interactive lead, `chain_run` for any `lean/reviewer` or `lean/verifier` stage (both `build` and `review`, inline and durable), and `spawn_agent` of `lean/reviewer` and `lean/verifier`. The lead's own prompt (`lead.md:23`) tells it to do both.

## Consequences

| | Framework change | Brief deviation | Stays broken | Lines |
|---|---|---|---|---|
| a | yes, ~11 files | no | nothing | ~60–90 + tests |
| d | yes, 2 extension files | no | nothing interactive | ~12 + tests |
| b | none | role names | nothing | ~15 edits, 4 renames |
| c | none | accepts a broken lead path | lead `chain_run`/`spawn_agent` to both roles | 0 now |

## What the options miss

1. **The collision reaches beyond cody.** `coding/planner` spawns bare `verifier` (`planner.ts:37`). `quality-manager` lists bare `reviewer` (`quality-manager.ts:17`, lens set `quality-review-launch.ts:348,467`).
2. **`-d lean` breaks coding.** With `domainContext="lean"`, cody's bare `reviewer` resolves to `lean/reviewer` and is denied as `internal` (repro). (d) avoids this because the context follows the caller.
3. **Config overrides leak across domains.** `roleToConfigKey` unqualifies (`qualified-role.ts:58,72`), so `models.reviewer`/`thinking.reviewer` in project config also override `lean/reviewer`. Verified: `X-from-models.reviewer`. A rename avoids this.
4. **Unseen wrong model.** Under the broken path, model resolution falls back silently. A fix that touches only visibility checks would run the right agent on the wrong model.
