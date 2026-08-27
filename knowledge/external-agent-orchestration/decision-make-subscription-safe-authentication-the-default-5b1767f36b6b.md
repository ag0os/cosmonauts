---
type: decision
title: Make subscription-safe authentication the default
description: >-
  External CLI wrappers remove API-billing credentials unless the user
  explicitly opts into API billing.
resource: >-
  knowledge/external-agent-orchestration/decision-make-subscription-safe-authentication-the-default-5b1767f36b6b.md
tags:
  - authentication
  - billing
  - claude-cli
  - security
timestamp: '2026-05-12T14:49:53.204Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/external-agent-orchestration/plan.md
date: '2026-05-12T14:49:53.204Z'
---
Build the child environment from the caller's environment but omit the API credential by default, preserve unrelated variables, and emit a structured warning explaining the removal and opt-in flag. Preserve the credential only after explicit runtime consent. Environment filtering is safer than merely warning because it prevents a configured credential from silently changing the billing path.
