---
id: TASK-815
title: 'Quality Manager: bind analysis_audit in the private review clone'
status: To Do
priority: medium
labels:
  - follow-up
  - quality-manager
  - analysis
dependencies: []
createdAt: '2026-09-30T11:41:40.502Z'
updatedAt: '2026-09-30T11:41:40.502Z'
---

## Description

Post-plan follow-up from driver-hardening (final report human item 5) and every earlier QM run: in the QM's private clone Fallow reports `execution-not-consented` for `analysis_audit` and all seven capabilities, so every QM verdict carries 'unavailable evidence, not a clean result' and a standing human-decision item. Decide and implement how the review workspace obtains provider execution consent (inherit the base revision's consent record, or an explicit reviewer-side consent step), without letting the reviewed change authorize its own audit (INV: the measured party never owns the measurement).

<!-- AC:BEGIN -->
- [ ] #1 A QM run from a plain clone of a branch whose base revision has consent produces a bound changed-scope analysis_audit result; the private-workspace preparation is the only path that grants it.
- [ ] #2 A test pins that a same-change consent edit cannot bind the audit; docs/ and the drive/analysis skills describe the mechanism.
<!-- AC:END -->
