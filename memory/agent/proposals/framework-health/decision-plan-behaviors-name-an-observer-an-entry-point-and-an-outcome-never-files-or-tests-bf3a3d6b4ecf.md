---
type: decision
title: >-
  Plan behaviors name an observer, an entry point and an outcome, never files or
  tests
description: >-
  The plan format dropped the Seam, Test and Marker fields because pre-naming
  the code and its test made the sentence the cheapest thing to satisfy.
resource: >-
  knowledge/framework-health/decision-plan-behaviors-name-an-observer-an-entry-point-and-an-outcome-never-files-or-tests-bf3a3d6b4ecf.md
tags:
  - behaviors
  - plan-format
  - planning
  - testing
timestamp: '2026-09-20T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/framework-health/plan.md
date: '2026-09-20T00:00:00.000Z'
---
A plan behavior now states who observes it, through which shipped entry point, and what they observe. It must not name source files, functions, test files or test titles, and there is no one-behavior-one-test rule: test design belongs to whoever has seen the code. The old format required a Seam, a named Test and a `@cosmo-behavior` Marker, and the only enforced obligation was that the marker string existed. That rewarded code shaped like the sentence and a test shaped like the sentence. One archived behavior ordered an unwired function plus a test of it and got exactly that, and a green suite could not tell. The fields were removed outright rather than made optional, because an optional field that a planner prompt mentions gets filled every time. About 546 markers were stripped from tests. A one-behavior trial of the new shape killed 11 of 11 mutants, including the wiring mutant, before any code was deleted. Watch for skill bundles exported to other harnesses that still ask for Seam/Test/Marker: they are stale copies, and the live contract is the work-artifacts plan-format reference.
