---
type: decision
title: Reachability is a repository walker with declared public and staged entries
description: >-
  check:reachability walks runtime imports from real entry points; unwired
  modules must be declared staged with a live owner or deleted with their tests.
resource: >-
  knowledge/framework-health/decision-reachability-is-a-repository-walker-with-declared-public-and-staged-entries-f2b26e8edb9d.md
tags:
  - architecture
  - dead-code
  - reachability
  - staged-code
timestamp: '2026-09-23T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: >-
  missions/archive/tasks/TASK-708 - Stage 3 reachability command with declared
  roots and annotated staged entries.md
date: '2026-09-23T00:00:00.000Z'
---
`bun run check:reachability` (`scripts/check-reachability.ts`) runs its own walk of runtime imports. Type-only imports do not count as reach. Its roots are what the `package.json` bin scripts import, `bun build --compile` entries, domain manifests, agents and extensions, plus the modules declared in `missions/architecture/staged-code.toml`. That file holds `public` (deep-importable API) and `[[staged]]` rows with a `path` and an `owner`. The owner is `plan:<slug>`, live only while that plan is active, or `roadmap:<exact heading>`. `fallow.toml` `entry` must equal public ∪ staged exactly, so nothing becomes reachable by editing `entry` alone. A staged entry whose owner is archived or absent is an orphan. Fallow is not the walker: it cannot follow the extensionless `bin/cosmonauts`, so it reports all of `cli/` unused, and it counts type-only reach. Rooting every `cli/` file is also wrong, because it hides orphans. Orphans found this way were deleted with their tests, including a transitively test-only Drive loop and the spawn compiler. A module used only by a script belongs next to that script, not in `lib/`.
