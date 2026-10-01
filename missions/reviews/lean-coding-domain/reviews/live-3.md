# Live run 3 — smoke run on Pi with DeepSeek (W3-4)

One run, as briefed, stop regardless of outcome. Branch `feature/lean-domain` @ `8d7927e0` in scratch clone `live-3-clone` (local `main`, frozen install; pre-fix, so the same EEXIST request as live-1 applies), with `bundled/lean/agents/{builder,code-reviewer}.ts` pointed at `openrouter/deepseek/deepseek-chat` (Pi model store: OpenRouter "DeepSeek V3"), `thinkingLevel: "off"` — a scratch-only commit, because project config has no per-agent model override. `runBuild` + `createDefaultProviders()` via the coordinator's script, `backend: pi` (`createPiBuilderBackend`, in-process ephemeral Pi session, domain `lean`). Request = live-1's paragraph plus one sentence asking the builder to add a deliberate extra nested `if` on an irrelevant env var inside `linkDependencies` so the post-edit hook has a regression to flag.

Run id `20261001T074305-…` under the clone's `missions/sessions/lean/runs/`.

## Timeline

| Stage | Wall time | Note |
|---|---|---|
| graph refresh (start) | ~5 s | `regenerated`, `missing` |
| builder-1 (Pi, DeepSeek V3) | 70.0 s | 1 turn, **4 tool calls**, 64,161 input / 1,119 output tokens, $0.0177; edited both files; final text = the word `json` on one line then one JSON line |
| builder-1 repair | 8.5 s | 7,922 / 97 tokens, $0.0021, 0 tool calls; one JSON line |
| **total** | **1 min 24 s** | **`failed`**: "builder-1: invalid envelope: schema violation: evidence must be array; reason must be string; repair turn: schema violation: evidence[0].kind must be one of test, command, file, claim; reason must be string" |

Total cost ≈ $0.02 of the ~$4 DeepSeek credit. No providers ran, no reviewer ran (the run ends at the first stage without a valid envelope, after the one repair).

## What the Pi path proved (the purpose of this run)

- **Session stats recorded**: `stats.json` carries real `spawn` stats per stage (tokens input/output/cacheRead/cacheWrite/total, cost, duration, turns, toolCalls); `run.json` `tokensUsed: 73299` = input + output of both sessions (H-1 fix observed live; Pi's `total` would have been 73,299 too here because DeepSeek reports no cache tokens).
- **Health hook loaded**: manifest `healthHook: "pi"`; the builder definition's `health-hook` extension attached (no packaging warning, unlike the external backends). **Firing could not be confirmed from the record**: the Pi session is ephemeral and in-process, so the hook's injected finding (appended to the edit tool's result) and its `lean.health-hook` log entries are not persisted anywhere the host reads. Running the same check the hook runs, after the fact, on the builder's diff gives `linkDependencies cyclomatic 4 (base 2), cognitive 4 (base 1), crap 7.5 (base 2.9) REGRESSED` plus a new arrow — exactly the probe branch — so the hook had a regression to report on the first write. Finding: the hook should also persist what it reported (e.g. append to `<git-dir>/lean-run/health-hook.jsonl` next to the base-sha marker, which the runner can copy into the run dir), otherwise §4.7A is unobservable for the host and for the reviewer.
- **Role guard loaded** (Pi only): no evidence either way — the builder made no git call.
- **Context pack**: `built`; same shape as live-1 (no repo map for a direct request — W3-6 ruling 4).
- **Envelope parsed**: the parser found the last `{` line despite the stray `json` line before it (the OD-4 rule did not trip since nothing after the object mentioned `outcome`).

## Could DeepSeek V3 follow the envelope contract? No.

First reply: `evidence` was an object, not an array; `kind: "tests"`; `reason: null` (the schema makes `reason` optional but, when present, a string). Repair prompt named all three violations and the field list; the second reply fixed the array shape but kept `kind: "tests"` and `reason: null`. Two of the three are enumeration/shape strictness the instruction never stated (W3-6 ruling 1 adds the enumerations); `null` for an optional field is a tolerance the lean-run layer can add without touching the schema (asked of W3-6). With those two changes the first reply's object-shaped `evidence` would still fail, and the repair reply would still fail on `kind: "tests"` — the repair prompt already named the allowed kinds and DeepSeek kept its own value (checked by the W3-6 reviewer, `reviews/w36-1.md`). So the enumeration clause and null tolerance narrow the gap but do not establish that DeepSeek V3 would pass; that needs another run after W3-6. Separately, the stray `json` line suggests DeepSeek meant a code fence and dropped the backticks — harmless to the parser.

## The change itself (not merged, scratch only)

4 tool calls in 70 s produced: the probe branch as requested (nested `if` on `COSMONAUTS_LINK_PROBE`), an `existsSync` guard plus a `.catch` on `EEXIST`, and one test that commits a dangling tracked symlink and asserts the resolver resolves. Mixed quality: `existsSync` follows symlinks (a dangling one reads as absent, so the catch is doing the real work), the comment "this should be flagged by the host" is left in, and the test asserts only `resolves.toBeDefined()`. It would not be merged as is; it was never verified because the run failed before the providers.

## Findings

1. DeepSeek V3 cannot be used as a lean builder on this contract as it stands; the enumeration clauses and null tolerance (W3-6 rulings 1 and 10) remove two of the three failure causes, but it ignored the allowed `kind` list even when the repair prompt stated it — unproven either way, one run only, as briefed.
2. The Pi health hook's effect is not recorded anywhere durable; make the hook persist its findings (above).
3. The Pi path otherwise works end to end: stats, budget counting, extension loading, context pack, graph refresh, repair turn with tools blocked by the role guard (0 tool calls in the repair session, consistent with the guard; not independently provable from the record).
4. Cost/latency reference: DeepSeek V3 via OpenRouter, 70 s for one edit turn with 64k input (the pack + AGENTS.md + skills), $0.018.
