---
type: convention
title: Use minimal synthetic installable domains in framework tests
description: >-
  Framework tests needing package realism should create minimal synthetic domain
  packages and load them through production scanner and loader seams.
resource: >-
  knowledge/coding-agnostic-framework/convention-use-minimal-synthetic-installable-domains-in-framework-tests-175081e06afa.md
tags:
  - domains
  - fixtures
  - packages
  - testing
timestamp: '2026-06-29T20:14:59.444Z'
scope: project
kind: semantic
writer: coding/distiller
source: missions/archive/plans/coding-agnostic-framework/plan.md
date: '2026-06-29T20:14:59.444Z'
---
Provide a small function-based fixture that writes the actual package manifest, domain definition, agents, prompts, capabilities, skills, and optional chains needed by current tests. Keep generic fixtures neutral, and use a synthetic package with a production domain id only when the behavior explicitly concerns that user-facing id. Loading fixtures through real package discovery catches integration errors without coupling framework tests to a bundled domain's content.
