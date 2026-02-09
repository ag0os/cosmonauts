---
id: COSMO-017
title: Simplify chain DSL parser
status: Done
priority: high
labels:
  - orchestration
dependencies:
  - COSMO-016
createdAt: '2026-02-09T19:30:27.692Z'
updatedAt: '2026-02-09T19:31:37.408Z'
---

## Description

Remove :N iteration parsing. Parser just splits on -> and returns stage names. Loop behavior is determined by role lifecycle, not DSL syntax. Parser no longer needs to handle colons or numbers.

<!-- AC:BEGIN -->
- [x] #1 parseChain returns stages with name only (loop set by role lifecycle)
- [x] #2 No colon/number parsing
- [x] #3 Whitespace and arrow splitting still works
- [x] #4 Error cases still covered (empty, malformed)
<!-- AC:END -->
