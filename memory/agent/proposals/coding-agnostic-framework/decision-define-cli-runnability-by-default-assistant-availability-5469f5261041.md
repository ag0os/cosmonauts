---
type: decision
title: Define CLI runnability by default-assistant availability
description: >-
  CLI guards and mode selection should test whether a runnable default assistant
  exists, not whether an optional domain is installed.
resource: >-
  knowledge/coding-agnostic-framework/decision-define-cli-runnability-by-default-assistant-availability-5469f5261041.md
tags:
  - cli
  - defaults
  - domains
  - guards
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
Use one pure runnability predicate for interactive mode, print mode, initialization, and no-domain guards. A runtime containing the shared substrate plus the domain that owns the default assistant is runnable; a shared-only or empty runtime is not. Keep guard messages domain-neutral and actionable. Reusing one predicate prevents mode selection and initialization from disagreeing about whether the installation can run.
