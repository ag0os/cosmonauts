---
name: analysis
description: Use generic codebase-analysis capabilities for structural audits, investigation, and safe remediation when those tools are available to the current role.
---

# Analysis

## Availability check

Call `analysis_status` first. If the tool is not registered in this session, state that analysis is not part of this role's surface and proceed without it. Do not retry or attempt a substitute invocation.

## Interpret outcomes

- **Completed:** use the structured result and its verdict or evidence. The model-facing text is capped at 32,768 UTF-8 bytes, starts with capability/provider/scope/verdict/coverage/metric, and marks omitted rows or truncated fields. Read complete typed and native evidence in `details` without rerunning the provider; do not infer findings that are absent from the result.
- **Unbound:** record that analysis evidence is unavailable, then continue with the other evidence required by the task.
- **Unsupported:** degrade only the unsupported metric or scope. Never widen the request silently or treat unsupported analysis as a clean result.
- **Failed:** report analysis as failed to run. A failed binding or invocation is blocking when the task depends on that evidence.

## Scope requests explicitly

Changed-scope analysis requires an explicit base. Supply the exact base required by the active work contract; never omit it, replace it with a symbolic guess, or silently widen the scope.

For clone-extraction work, call `analysis_duplication({ paths: [<owned project-relative files>] })` after the edit. The result includes clone groups when **any** instance belongs to the requested files; quote every surviving scoped group (with its locations), or quote the explicit empty result, in the verdict. A clean subset says nothing about groups outside those paths. If analysis is unbound or fails, say the residue is unknown; never claim zero clones from missing evidence. Use the result's complete details when the model-facing text omits rows.

## Investigate and remediate safely

- **Trace first:** trace reachability and references before removing a file, export, type, dependency, or other structural element. Some providers trace exported symbols only, not non-exported functions. When the adapter confirms a symbol is internal, `analysis_trace` returns an unsupported-target provider constraint and suggests a file target without running the provider. For re-exports, unreadable or non-JS/TS sources, and uncertain export status it defers to the provider; do not read that as proof the symbol is exported. Use a file trace for internal reachability context, not as a symbol-level proof.
- **Preview only:** treat suggested changes as proposals for review, never as authorization to edit.
- **Rerun before editing:** rerun the same capability request immediately before remediation and use the fresh structured result as ground truth. If the finding no longer reproduces, report it as unresolved instead of guessing.
- Make only narrow, ordinary edits justified by the fresh evidence, preserve existing suppressions unless the underlying issue is fixed, and rerun the relevant analysis afterward.
