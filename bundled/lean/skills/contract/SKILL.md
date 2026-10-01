---
name: contract
description: The two lean contract documents — spec.md (non-technical, the change from the user's point of view) and plan.md (technical approach, touched modules, reuses, behaviors, risks, one Mermaid diagram) — with their templates and where they live. Use when writing or editing a lean spec or plan. Do NOT load for direct fixes that need no document.
---

# Contract documents

Two optional documents, each fitting on one screen. The lead fills them; the human edits them; the host reads their headings, plus the two plan lines noted in the template.

They live at `missions/lean/<slug>/spec.md` and `missions/lean/<slug>/plan.md`, where `<slug>` names the change.

## Spec (`spec.md`)

```
# <title>
## Intent        — one paragraph, user's point of view
## Users         — who, and what they do today
## Outcomes      — observable results, bullet list
## Out of scope  — bullet list
## Mockups       — optional links or ASCII/Mermaid
```

## Plan (`plan.md`)

```
# <title>
## Approach      — one paragraph
## Touches       — modules/files to change, with the reason each is touched
                   (one bullet per path; the host reads its first `backticked` path, else its first word with a / or an extension)
## Reuses        — existing helpers/modules the change must use (from the map; same bullets as Touches)
## Behaviors     — B-1..n: observer / entry point / outcome
                   (one line per behavior, `B-n: observer / entry point / outcome`, parts separated by " / ")
## Risks         — bullet list
## Diagram       — one Mermaid graph: touched modules, new edges
```
