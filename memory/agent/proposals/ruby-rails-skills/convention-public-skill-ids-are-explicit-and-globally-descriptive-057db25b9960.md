---
type: convention
title: Public skill IDs are explicit and globally descriptive
description: >-
  Treat frontmatter IDs as the public API rather than deriving identity from a
  nested leaf directory name.
resource: >-
  knowledge/ruby-rails-skills/convention-public-skill-ids-are-explicit-and-globally-descriptive-057db25b9960.md
tags:
  - frontmatter
  - naming
  - public-api
  - skills
timestamp: '2026-08-21T15:01:50.717Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/spec.md
date: '2026-08-21T15:01:50.717Z'
---
Every nested skill entry must declare an explicit, globally descriptive public ID that includes enough domain context to avoid collisions. Directory paths organize content; they do not define the invocation contract. Keep frontmatter minimal and behavioral: an ID plus a concise description stating both positive triggers and when not to load the skill. Do not carry source-specific tool grants into an adapted pack.
