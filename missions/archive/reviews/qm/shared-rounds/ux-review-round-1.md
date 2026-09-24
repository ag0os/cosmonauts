# UX Review: round 1

## Overall

incorrect

## Assessment

The Cancelled task flow is coherent across CLI filtering, archive, Drive blocking, and watch-event text, and the accepted bare `task list --ready` behavior is clear in the help. However, the new reachability gate can report success when configured shipped roots are missing, and two failure paths omit the concrete file/task information users need to recover.

## Findings

- id: UX-001
  dimension: confusing-states
  priority: P1
  severity: high
  confidence: 0.98
  complexity: simple
  title: "Reachability reports success when configured bin and compile roots do not exist"
  files: scripts/check-reachability.ts
  lineRange: 227-265
  location: scripts/check-reachability.ts:227-265
  reproduction: |
    In a synthetic project, set `package.json` to include `"bin":{"fixture":"bin/DOES-NOT-EXIST"}` and `"scripts":{"compile":"bun build --compile lib/DOES-NOT-EXIST.ts --outfile bin/x"}`. Declare one existing `lib/live.ts` as the sole public/fallow entry, then run `bun run check:reachability <fixture-root>`. The command exits 0 and prints `reachability: 1/1 lib modules reached; 0 staged`.
  impact: |
    A user or CI gate receives a green health result even though both configured shipped entry points are absent. Lines 240-242 silently discard a missing bin path, while lines 261-265 silently discard a missing compile root because it is not in `moduleSet`; the output gives no indication that those roots were never traversed.
  summary: |
    Configured roots are treated as optional during discovery, so the command can silently certify a package whose executable/build entry point is broken.
  suggestedFix: Validate every configured bin path and every discovered `bun build --compile` entry before graph traversal; emit path-specific diagnostics and exit nonzero for missing roots.

- id: UX-002
  dimension: feedback
  priority: P2
  severity: medium
  confidence: 0.97
  complexity: simple
  title: "Coordinator fast-fail hides the tasks and dependencies that need intervention"
  files: lib/orchestration/chain-runner.ts, bundled/coding/prompts/coordinator.md
  lineRange: 151-159
  location: lib/orchestration/chain-runner.ts:151-159; bundled/coding/prompts/coordinator.md:28-30
  reproduction: |
    Create `TASK-001` with label `plan:alpha`, create labelled `TASK-002` depending on it, and set `TASK-001` to Cancelled. Run `cosmonauts --completion-label plan:alpha -d coding run chain coordinator`. It exits 1 before spawning the coordinator and reports only `No actionable tasks for completion label "plan:alpha": none is In Progress or To Do with every dependency Done`.
  impact: |
    The user is not told that `TASK-002` is waiting on Cancelled `TASK-001`, which task must be cancelled/replanned, or whether Blocked tasks are also present. Because the pre-check prevents the coordinator from running, the new prompt instruction to report a task whose dependency is Cancelled never executes; users must manually inspect the whole scope to find the cause.
  summary: |
    The new terminal state correctly stops a futile loop, but its observable result omits the concrete blockers needed to recover.
  suggestedFix: Include each stranded task ID and its unsatisfied dependency/status (and any remaining Blocked task IDs) in the terminal diagnostic.

- id: UX-003
  dimension: feedback
  priority: P2
  severity: medium
  confidence: 0.99
  complexity: simple
  title: "Malformed staged-owner plan frontmatter fails without naming the file"
  files: scripts/check-reachability.ts
  lineRange: 58-66
  location: scripts/check-reachability.ts:58-66
  reproduction: |
    Declare `lib/live.ts` as staged with owner `plan:future-work`, then put `status: [active` in `missions/plans/future-work/plan.md`. Run `bun run check:reachability <fixture-root>`. It exits 1 with only `unexpected end of the stream within a flow collection at line 3, column 1` and does not mention `missions/plans/future-work/plan.md` or `plan:future-work`.
  impact: |
    In a repository with several staged owners, the gate blocks without identifying which plan must be repaired. The line/column alone is not actionable because `gray-matter` is invoked without wrapping the parse failure in the owner path.
  summary: |
    TOML parse errors identify their source file, but the staged plan-owner YAML path does not provide the same diagnostic context.
  suggestedFix: Catch owner-plan frontmatter parse errors and rethrow with the plan path and owner before the parser message.

- id: UX-004
  dimension: confusing-states
  priority: P3
  severity: low
  confidence: 0.98
  complexity: simple
  title: "Reachability summary counts exempt type-only modules as reached"
  files: scripts/check-reachability.ts
  lineRange: 269-275
  location: scripts/check-reachability.ts:269-275
  reproduction: |
    Use a fixture with declared/reached runtime module `lib/live.ts` and unimported type-only module `lib/shapes.ts` containing only an exported interface. `bun run check:reachability <fixture-root>` exits 0 and prints `reachability: 2/2 lib modules reached`, even though `lib/shapes.ts` was never added to `reached`.
  impact: |
    The success exit is consistent with the intentional type-only exemption, but the displayed numerator is factually different from the graph result. Users cannot distinguish modules actually reached from modules exempted by the runtime-code rule.
  summary: |
    The summary derives its numerator from total files minus reported runtime orphans rather than from the `reached` set.
  suggestedFix: Report reached runtime-bearing modules against the runtime-bearing total, or show type-only exemptions separately instead of labeling them reached.
