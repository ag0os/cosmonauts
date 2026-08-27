---
type: decision
title: Repository detection belongs in foundational meta skills
description: >-
  Centralize convention and stack-profile detection in foundational skills
  instead of repeating preflight instructions across every domain skill.
resource: >-
  knowledge/ruby-rails-skills/decision-repository-detection-belongs-in-foundational-meta-skills-46d85c49865f.md
tags:
  - deduplication
  - dependencies
  - profiles
  - repository-detection
  - skills
timestamp: '2026-04-23T00:00:00.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/plan.md
date: '2026-04-23T00:00:00.000Z'
---
Create dedicated meta skills for repository convention fingerprinting and stack/profile classification, then make domain skills depend conceptually on those stable public IDs. Each domain skill should use a short standard preamble that points to the meta skills rather than copying a full detection checklist. This keeps recommendations profile-aware while preventing duplicated preflight text from drifting across the pack.
