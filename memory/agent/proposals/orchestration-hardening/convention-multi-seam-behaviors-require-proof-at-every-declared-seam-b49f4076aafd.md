---
type: convention
title: Multi-seam behaviors require proof at every declared seam
description: >-
  A behavior naming multiple integration seams is conformant only when each seam
  is implemented and independently exercised.
resource: >-
  knowledge/orchestration-hardening/convention-multi-seam-behaviors-require-proof-at-every-declared-seam-b49f4076aafd.md
tags:
  - acceptance-criteria
  - behavior-spine
  - seams
  - verification
timestamp: '2026-06-24T17:57:29.950Z'
scope: project
kind: semantic
writer: coding/distiller
source: >-
  missions/archive/tasks/TASK-408 - Verifier must confirm EVERY seam a behavior
  declares is implemented and tested.md
date: '2026-06-24T17:57:29.950Z'
---
Do not accept one passing implementation site as proof of a behavior whose design names several modules or boundaries. Acceptance criteria should enumerate every seam or split the behavior into one assertion per seam, and verification should map each declared seam to implementation evidence and an executable test. Treat any missing seam as partial implementation even when the narrowest criterion can pass.
