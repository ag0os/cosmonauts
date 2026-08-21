---
type: convention
title: Base-language guidance must remain framework-agnostic
description: >-
  Keep language skills independent of framework implementation details and allow
  framework skills to depend on language skills only through explicit links.
resource: >-
  knowledge/ruby-rails-skills/convention-base-language-guidance-must-remain-framework-agnostic-c75c76be4755.md
tags:
  - boundaries
  - dependency-direction
  - framework
  - language
  - skills
timestamp: '2026-08-21T15:01:50.723Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/ruby-rails-skills/spec.md
date: '2026-08-21T15:01:50.723Z'
---
Enforce one-way dependency direction: base-language skills own construct selection and language-specific refactoring, while framework skills own persistence, lifecycle, and framework integration. A base-language skill may point users to a framework skill after detecting the framework, but it must not embed framework implementation advice. Conversely, framework skills should link to language guidance rather than reteach language-level choices.
