---
type: convention
title: Skill-pack QA must verify boundaries and navigation
description: >-
  Review adapted skill packs as a semantic dependency graph, not merely as a set
  of present files.
resource: >-
  knowledge/ruby-rails-skills/convention-skill-pack-qa-must-verify-boundaries-and-navigation-76692eb11015.md
tags:
  - boundaries
  - link-integrity
  - negative-checks
  - qa
  - skills
timestamp: '2026-08-21T15:01:50.729Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/spec.md
date: '2026-08-21T15:01:50.729Z'
---
For every adapted entry, verify normalized frontmatter, final public IDs, opener consistency, subordinate reference existence, and the Related Skills graph. Add targeted negative checks for forbidden framework leakage into base-language skills and spot-check every explicit redistribution edge at both its source and destination. Repository tests alone are insufficient because content-only defects often appear as broken navigation, duplicated ownership, or missing guidance rather than executable failures.
