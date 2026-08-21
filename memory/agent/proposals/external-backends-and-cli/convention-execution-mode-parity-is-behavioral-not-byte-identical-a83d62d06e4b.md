---
type: convention
title: 'Execution-mode parity is behavioral, not byte-identical'
description: >-
  Inline and detached modes should be compared through normalized behavior
  rather than unstable identifiers such as commit hashes.
resource: >-
  knowledge/external-backends-and-cli/convention-execution-mode-parity-is-behavioral-not-byte-identical-a83d62d06e4b.md
tags:
  - behavioral-equivalence
  - detached-execution
  - git
  - testing
timestamp: '2026-05-05T16:24:56.227Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-backends-and-cli/plan.md
date: '2026-05-05T16:24:56.227Z'
---
Parity tests between execution transports should assert the same normalized event sequence, task-state transitions, commit subjects, and resulting tree contents. Exclude timestamps, acceptable lifecycle-ordering differences, and commit hashes when those depend on nondeterministic metadata. Requiring identical hashes would test incidental timing rather than equivalent user-visible behavior.
