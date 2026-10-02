---
name: cosmonauts-lean
description: Write a lean spec and plan for a change in a project that uses cosmonauts, check the plan, and hand it to `cosmonauts lean build` to implement. Use when the human wants a lean spec or plan under `missions/lean/` written here and built by `cosmonauts lean build`, not a Drive plan.
---

# Lean spec, plan, and handoff

Use this when the human wants to shape a change here and have cosmonauts build it. Run the commands from the project root. Under `--json`, an error prints `{"error": ...}` and exits 1.

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

It prints `{"plan","ok","title","emptySections","pathWarnings","behaviorProblems","graph"}` and exits 0 when `ok` is true. Fix what `emptySections` and `behaviorProblems` list, and check again. `pathWarnings` do not affect `ok`: `plan path not found (new file?): <path>` is fine for a file the change creates, and `plan path is not in the file graph: <path>` names a real file the map does not analyze, so keep it if the path is right. `graph` is `available` or `unavailable: <reason>`.

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
