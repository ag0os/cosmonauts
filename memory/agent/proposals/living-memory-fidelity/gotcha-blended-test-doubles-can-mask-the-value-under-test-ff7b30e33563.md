---
type: gotcha
title: Blended test doubles can mask the value under test
description: >-
  A mutation-style regression may pass for the wrong reason when an unrelated
  double supplies the same boolean or state being asserted.
resource: >-
  knowledge/living-memory-fidelity/gotcha-blended-test-doubles-can-mask-the-value-under-test-ff7b30e33563.md
tags:
  - false-positives
  - mutation-testing
  - test-doubles
  - testing
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-664 - CDX16 round Carry the confirmation-write
  commit fact and pin the consumers.md
date: '2026-09-09T00:00:00.000Z'
---
Before trusting a seam-level regression, inventory every test double that can contribute to the asserted value. Configure all unrelated contributors to neutral, non-committing behavior so exactly one producer can make the value true. Then mutate the targeted consumer alone. If a default persistence, materialization, or recovery double can independently supply the bit, the test is blended and cannot prove the intended propagation path.
