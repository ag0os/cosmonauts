---
type: convention
title: Domain prompt directories contain personas only
description: >-
  Framework base and runtime templates belong to framework-owned paths, separate
  from domain-authored personas.
resource: >-
  knowledge/domain-authoring/convention-domain-prompt-directories-contain-personas-only-da50fed4900e.md
tags:
  - authoring-convention
  - domains
  - ownership
  - prompts
timestamp: '2026-06-23T21:05:57.000Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/domain-authoring/plan.md
date: '2026-06-23T21:05:57.000Z'
---
Reserve each domain's prompt directory for persona files named in parallel with agent definitions. Load universal base prompts and runtime overlays from explicit framework-owned locations, with an injectable framework prompt root for tests and embeddings. This keeps domain content intrinsic and portable, prevents a shared fallback domain from owning framework behavior, and makes a missing persona diagnostic able to name one predictable expected path.
