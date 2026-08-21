---
type: decision
title: Agent-independent commands remain usable without installed domains
description: >-
  An empty domain store is a supported bootstrap state in which
  package-management commands work and agent modes provide installation
  guidance.
resource: >-
  knowledge/framework-extraction/decision-agent-independent-commands-remain-usable-without-installed-domains-7d2b546acb2f.md
tags:
  - bootstrap
  - cli
  - error-handling
  - first-run
timestamp: '2026-04-01T03:32:49.715Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/framework-extraction/plan.md
date: '2026-04-01T03:32:49.715Z'
---
Treat the absence of functional domains as a valid first-run state, not as runtime corruption. Commands that install, remove, list, create, or update packages must initialize without an agent domain. Modes that require agents should stop before dispatch, explain what is missing, and provide concrete installation choices. This preserves the only recovery path from an empty installation.
