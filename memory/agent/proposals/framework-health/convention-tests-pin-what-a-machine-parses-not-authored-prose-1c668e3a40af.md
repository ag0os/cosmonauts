---
type: convention
title: 'Tests pin what a machine parses, not authored prose'
description: >-
  Prompt, persona and skill wording is verified by a reviewer reading the diff;
  tests may assert only what code resolves.
resource: >-
  knowledge/framework-health/convention-tests-pin-what-a-machine-parses-not-authored-prose-1c668e3a40af.md
tags:
  - conventions
  - prompts
  - prose
  - testing
timestamp: '2026-09-21T00:00:00.000Z'
scope: project
kind: semantic
writer: claude-code/archivist
source: missions/archive/plans/framework-health/plan.md
date: '2026-09-21T00:00:00.000Z'
---
A `toContain` on a prose sentence goes red on a harmless reword and stays green on an incoherent rewrite, so it protects nothing. Tests may pin frontmatter keys, tool or capability names that code resolves, and file existence a loader depends on. Anything whose subject is a prompt, persona or skill body is verified by the plan-reviewer or an independent reviewer reading the diff. When a rewrite turns such tests red, delete them in the same commit; rewording the assertion to the new sentence repeats the defect. Absence guards survive only when the absent token is something production code would resolve if it were present, such as a tool name offered to a read-only role. One human-ratified exception: a test may assert that shipped guidance does not name a provider, toolchain, language or framework, because that absence is a project rule rather than wording. Tests also do not compare documentation tables with code constants, and whole-file hash pins of shipped prompts were removed, because their only possible failure is "someone edited a prompt".
