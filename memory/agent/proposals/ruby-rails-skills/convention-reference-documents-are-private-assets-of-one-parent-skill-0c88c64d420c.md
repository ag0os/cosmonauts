---
type: convention
title: Reference documents are private assets of one parent skill
description: >-
  Store deep-dive documents under the parent skill's references directory and
  preserve stable filenames where possible.
resource: >-
  knowledge/ruby-rails-skills/convention-reference-documents-are-private-assets-of-one-parent-skill-0c88c64d420c.md
tags:
  - organization
  - portability
  - references
  - skills
timestamp: '2026-08-21T15:01:50.727Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/spec.md
date: '2026-08-21T15:01:50.727Z'
---
A supporting document belongs to exactly one parent skill and should be reached through a relative link from that skill's entry file. Place such documents under a local references directory, preserve recognizable filenames to minimize rewrite churn, and rely on whole-directory export to keep them portable. Keep distinct deep dives separate when they serve different loading or troubleshooting needs rather than merging them merely to reduce file count.
