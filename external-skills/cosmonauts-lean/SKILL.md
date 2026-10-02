---
name: cosmonauts-lean
description: Write a lean spec and plan for a change in a project that uses cosmonauts, check the plan, and hand it to `cosmonauts lean build` to implement. Use when the human wants the spec or plan written here and the building done by cosmonauts.
---

# Lean spec, plan, and handoff

Use this when the human wants to shape a change here and have cosmonauts build it.

## 1. Write the documents

Pick a short `<slug>` for the change, then write:

- `missions/lean/<slug>/spec.md`: only when the change has behavior a user can see;
- `missions/lean/<slug>/plan.md`: always.

The templates are in [contract.md](contract.md). Keep their headings.

## 2. Fill Touches and Reuses from the code

Open the files. Name the paths and helpers that are there, not the ones you remember.

## 3. Check the plan

```
cosmonauts lean check missions/lean/<slug>/plan.md --json
```

It prints `{"plan","ok","title","emptySections","pathWarnings","behaviorProblems","graph"}` and exits 0 when `ok` is true. Fix what `emptySections`, `pathWarnings` and `behaviorProblems` list, and check again. A path warning ending `(new file?)` is fine for a file the change creates. `graph` is `available` or `unavailable: <reason>`.

## 4. Show the human

Stop and show the human the plan (and the spec). Wait for their go-ahead or edits.

## 5. Hand off

```
cosmonauts lean build --plan missions/lean/<slug>/plan.md [--spec missions/lean/<slug>/spec.md] [--backend pi|claude-cli|codex-cli] --json
```

It runs the builder, the host checks and the reviewer, and takes a long time: give it a long timeout or run it in the background.

## 6. Read the result

It prints `{"runId","status","reason","summary","runDir"}`.

- `done`: the change is in the working tree, unstaged. Nothing is committed.
- anything else: nothing was applied; `reason` says why.

The run's record is in `runDir` (`missions/sessions/lean/runs/<runId>/`); `run.json` is the main file. Tell the human the status, the reason and the summary.
