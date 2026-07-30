---
name: analysis
description: Use generic codebase-analysis capabilities for structural audits, investigation, and safe remediation when those tools are available to the current role.
---

# Analysis

## Availability check

Call `analysis_status` first. If the tool is not registered in this session, state that analysis is not part of this role's surface and proceed without it. Do not retry or attempt a substitute invocation.

## Interpret outcomes

- **Completed:** use the structured result and its verdict or evidence. Do not infer findings that are absent from the result.
- **Unbound:** record that analysis evidence is unavailable, then continue with the other evidence required by the task.
- **Unsupported:** degrade only the unsupported metric or scope. Never widen the request silently or treat unsupported analysis as a clean result.
- **Failed:** report analysis as failed to run. A failed binding or invocation is blocking when the task depends on that evidence.

## Scope requests explicitly

Changed-scope analysis requires an explicit base. Supply the exact base required by the active work contract; never omit it, replace it with a symbolic guess, or silently widen the scope.

## Investigate and remediate safely

- **Trace first:** trace reachability and references before removing a file, export, type, dependency, or other structural element.
- **Preview only:** treat suggested changes as proposals for review, never as authorization to edit.
- **Rerun before editing:** rerun the same capability request immediately before remediation and use the fresh structured result as ground truth. If the finding no longer reproduces, report it as unresolved instead of guessing.
- Make only narrow, ordinary edits justified by the fresh evidence, preserve existing suppressions unless the underlying issue is fixed, and rerun the relevant analysis afterward.
