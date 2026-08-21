---
type: convention
title: 'Qualify cross-domain agent references, not same-domain references'
description: >-
  Agent references crossing a domain boundary use slash-qualified IDs, while
  same-domain allowlists use local unqualified IDs.
resource: >-
  knowledge/main-domain-and-cosmo-rename/convention-qualify-cross-domain-agent-references-not-same-domain-references-b3881bcd6a72.md
tags:
  - agents
  - convention
  - domains
  - identifiers
timestamp: '2026-05-04T21:09:14.040Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/main-domain-and-cosmo-rename/plan.md
date: '2026-05-04T21:09:14.040Z'
---
Use `<domain>/<agent>` whenever an agent refers to a specialist in another domain. Within a domain, keep allowlist entries unqualified when the resolver already has domain context. This preserves local manifests as domain-internal declarations while making cross-domain routing unambiguous; tests should assert both sides of the convention.
