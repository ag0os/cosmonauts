# Security Review: round 1

## Overall

incorrect

## Assessment

The Stage 3 diff introduces two reachable arbitrary-code-execution paths by passing repository-controlled frontmatter to `gray-matter`, whose language autodetection executes `---js` frontmatter. Both paths were reproduced locally with marker-file payloads.

## Findings

- id: SR-001
  dimension: injection
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Reachability check executes JavaScript frontmatter from a staged owner plan"
  files: scripts/check-reachability.ts
  lineRange: 58-66
  location: scripts/check-reachability.ts:65
  concreteInput: |
    Declare `owner = "plan:evil"` for a staged path, then create
    `missions/plans/evil/plan.md` containing:

    ```text
    ---js
    ({status:(require("fs").writeFileSync("/tmp/reachability-pwned", "1"), "active")})
    ---
    ```

    Running `bun run check:reachability` creates `/tmp/reachability-pwned` and can
    still exit successfully. This was reproduced against the changed command.
  impact: |
    A contributor-controlled plan file can execute arbitrary JavaScript with the
    developer or CI runner's privileges when the reachability gate runs, allowing
    command execution, secret reads, and workspace modification.
  summary: |
    `ownerLive()` passes the owner plan's raw frontmatter to `gray-matter`.
    `gray-matter` autodetects the `---js` language and invokes its JavaScript
    engine, which uses `eval`; the check therefore interprets project metadata as
    executable code rather than restricting it to YAML.
  suggestedFix: Reject non-YAML frontmatter delimiters and parse plan status with a non-evaluating YAML-only parser; add a regression proving `---js` is rejected without executing its payload.

- id: SR-002
  dimension: injection
  priority: P1
  severity: high
  confidence: 0.99
  complexity: simple
  title: "Archived dependency status resolution executes JavaScript frontmatter"
  files: lib/tasks/task-manager.ts, lib/tasks/task-parser.ts, cli/tasks/commands/list.ts
  lineRange: 602-606
  location: lib/tasks/task-manager.ts:602-606 -> lib/tasks/task-parser.ts:312-314; CLI entry at cli/tasks/commands/list.ts:54
  concreteInput: |
    Create an active task depending on `TASK-001`, and create
    `missions/archive/tasks/TASK-001 - Archived.md` containing:

    ```text
    ---js
    ({id:"TASK-001", title:"Archived", status:(require("fs").writeFileSync("/tmp/archive-pwned", "1"), "Cancelled"), dependencies:[], labels:[]})
    ---
    ```

    Running `cosmonauts task list --ready` causes the new archived-status path to
    read the file and call `parseTask`, creating `/tmp/archive-pwned`. The same
    behavior was reproduced by invoking `TaskManager.listTasks({ready:true})`.
  impact: |
    A repository-controlled archived task can run arbitrary JavaScript under a
    developer, coordinator, or Drive process when dependency readiness is
    evaluated, exposing local/CI secrets and permitting command or filesystem
    modification.
  summary: |
    Stage 3 changed archived dependencies from filename-only handling to reading
    each matching archived file and passing it to `parseTask`. `parseTask` uses
    `gray-matter`, whose `---js` language invokes an eval-based engine, so the new
    archive read turns persisted task metadata into executable input. The path is
    reachable from `task list --ready`, coordinator completion checks, and the
    Drive Cancelled-dependency check.
  suggestedFix: Make task parsing accept only non-executable YAML frontmatter and fail closed on alternate matter languages; cover the archived dependency path with a non-execution regression.
