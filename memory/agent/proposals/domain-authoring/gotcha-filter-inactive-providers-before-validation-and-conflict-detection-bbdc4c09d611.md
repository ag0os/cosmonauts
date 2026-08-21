---
type: gotcha
title: Filter inactive providers before validation and conflict detection
description: >-
  Inactive domains must not be allowed to fail startup through malformed content
  or duplicate identifiers.
resource: >-
  knowledge/domain-authoring/gotcha-filter-inactive-providers-before-validation-and-conflict-detection-bbdc4c09d611.md
tags:
  - active-set
  - conflicts
  - domains
  - loading
  - validation
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Apply the active-domain set to provider records before domain validation, same-precedence conflict detection, merging, registry construction, and binding validation. Filtering only the final merged registry is too late: an inactive malformed provider or duplicate identifier can still abort startup. Automatically retained framework fallback domains should be added to the active set before this filtering step.
