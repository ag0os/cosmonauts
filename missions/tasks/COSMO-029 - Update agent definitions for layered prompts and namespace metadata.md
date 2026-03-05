---
id: COSMO-029
title: Update agent definitions for layered prompts and namespace metadata
status: To Do
priority: high
labels:
  - forge
  - backend
  - 'plan:prompt-architecture'
dependencies:
  - COSMO-027
  - COSMO-028
createdAt: '2026-02-26T20:57:35.811Z'
updatedAt: '2026-02-26T20:57:35.811Z'
---

## Description

Update agent configuration types and built-in definitions to use the explicit layered prompt order and namespace metadata. Add optional namespace to AgentDefinition with backward-compatible default handling and wire built-ins to namespace 'coding'.

<!-- AC:BEGIN -->
- [ ] #1 AgentDefinition includes optional namespace metadata for migration compatibility
- [ ] #2 All built-in definitions set namespace to 'coding'
- [ ] #3 Built-in prompt arrays follow ordered layering: base then capabilities then persona
- [ ] #4 Existing code paths remain compatible when namespace is omitted on external/custom definitions
- [ ] #5 No agent is configured with prompt layers that conflict with its tool surface
<!-- AC:END -->
