---
type: convention
title: 'Remediation scopes close a defect class, not named instances'
description: >-
  A remediation task must enumerate every site in the reported class and record
  a fix or safety justification for each.
resource: >-
  knowledge/living-memory-fidelity/convention-remediation-scopes-close-a-defect-class-not-named-instances-f7ae5aed2ef4.md
tags:
  - acceptance-criteria
  - defect-classes
  - remediation
  - review
timestamp: '2026-09-09T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/reviews/improvements/living-memory-fidelity.md
date: '2026-09-09T00:00:00.000Z'
---
Write remediation acceptance criteria around the invariant or failure shape rather than a list of reported lines. Require an independent site inventory across relevant modules, with each site either changed or justified as safe, and check the inverse defect that the fix could introduce. Named findings seed the search; they are not the scope boundary. This practice consistently finds sibling sites omitted by the original report and is more likely to terminate iterative remediation.
