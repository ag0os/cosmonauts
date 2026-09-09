---
type: trade-off
title: Declared but unbound structural gates remain conventional controls
description: >-
  Listing bindable structural gates improves honesty about desired checks but
  provides no prevention until a real provider is bound and challenged with a
  known defect.
resource: >-
  knowledge/living-memory-fidelity/trade-off-declared-but-unbound-structural-gates-remain-conventional-controls-1c25ba9c6625.md
tags:
  - quality-gates
  - structural-analysis
  - technical-debt
  - trade-offs
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/plans/living-memory-structural-hardening/spec.md
date: '2026-09-09T00:00:00.000Z'
---
Treat an unbound gate as degraded evidence, never as a clean result. Manual review and targeted mutations can reduce immediate risk but do not turn mutation, duplication, complexity, boundary, or dead-code criteria into enforcement. Binding should include a negative demonstration against a reconstructed historical defect; a green run on unchanged code only proves the tool can return success. Until binding lands, state explicitly that recurrence prevention remains conventional and carry the work in a dedicated hardening plan.
