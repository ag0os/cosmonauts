# Independent review record — analysis-investigation-procedures

Seven `codex exec` rounds against `git diff 9c1c046..HEAD`, run in the
foreground with an explicit timeout after the prior slice's backgrounded runs
were killed mid-flight. Round 7 returned SHIP with no findings at any severity.

## Rounds and dispositions

| Round | Verdict | Finding | Disposition |
|---|---|---|---|
| 1 | DO-NOT-SHIP | ROADMAP dropped type-aware checks and security signals from remaining work; neither shipped | Fixed, `c7ddfaf` |
| 2 | DO-NOT-SHIP | "each completed invocation" declares coverage — coverage attaches only to verdict-bearing results (D-013 enforced by the type) | Fixed, `5b11660` |
| 3 | DO-NOT-SHIP | One sentence asserted a false causal chain over three independent degradation mechanisms | Fixed, `1988342` |
| 4 | DO-NOT-SHIP | The round-3 fix grouped blocking `failed-to-run` under degradation; it is distinct from degraded/unbound | Fixed, `afa941b` |
| 5 | DO-NOT-SHIP | A project with no provider surfaces capabilities as `unbound`, not `unsupported` | Fixed, `227ba91` |
| 6 | DO-NOT-SHIP | (a) detection keys on provider config or package dependency, never project language; (b) TASK-553's note said remaining work was "limited to" a list omitting two open items | Both fixed, `688be5b` |
| 7 | **SHIP** | None | — |

An earlier self-review pass before round 1 fixed three further issues in
`8e6f953`: an over-broad D-021 guard spanning the whole planner prompt, the
same guard missing entirely from B-021, and an orphaned planner paragraph
between two numbered steps.

## What the pattern says

Every one of the ten findings landed in prose — the `analysis-tools` ROADMAP
entry and one task note. Not one touched the deliverable. The four prompts,
their four content tests, the D-021 asymmetry, and the preserved slice-2
migration clause were re-confirmed clean in every round.

Two lessons worth carrying:

- **Fixing a conflation can introduce a conflation.** Round 4 exists only
  because the round-3 fix invented a new umbrella ("gates degrade visibly")
  that swept a blocking outcome in with two degraded ones.
- **Generalizing to "audit every claim" was still too shallow.** Rounds 3, 4,
  and 5 were each a fresh instance after that generalization. What finally
  ended the class was writing *less*: the entry now defers to
  `gate-contracts.md` for the resolution vocabulary instead of paraphrasing a
  subtle contract in a backlog file.

## Known test status at sign-off

The full suite reports one intermittent failure under load:
`tests/driver/run-step.test.ts > uses frozen episode actor and attempt identity
in the detached runner` — a 5000ms wall-clock timeout, not an assertion.

Attribution evidence, established before accepting it:

- The identical failure reproduces on clean `main` (2864/2865 there).
- The file passes in isolation; so do all four historically flaky driver files.
- `git diff 9c1c046..HEAD -- tests/driver/ lib/driver/ bin/` is empty, and
  codex independently confirmed byte-identical git tree IDs at base and HEAD.
- Round 7 hit the same 5000ms timeout in a *different* unchanged driver test,
  confirming a load-sensitive class rather than one specific test.

The test belongs to `episodic-log#B-018`. Changing it here would be out of
scope; it is worth a follow-up on that plan's own ground.
