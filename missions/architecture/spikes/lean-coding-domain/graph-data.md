> Checked 2026-09-30 by an independent pass; corrections and omissions are in `check.md` and folded into `README.md`.

# Spike: architecture-map graph data for WP3/WP5

Scratch scripts and outputs: `/private/tmp/graph-spike/` (`analyze.ts`, `probe.ts`, `elide.ts`, `gen.ts`, `skeletons.json`, `slice.txt`). The repo was not modified; generation ran on an rsync copy.

## 1. Data model today (verified)

- **Nothing is generated in this repo.** `memory/architecture/` does not exist and has no git history (`git log --all -- 'memory/architecture/*'` = 0). The brief's "sharded OKF under `memory/architecture/`" describes the design, not current state.
- **Nodes are modules, not files or symbols.** A module is a directory root (`lib/driver`, 38 files) (`analyzer.ts:163-191`). 47 modules, 325 files. Defect: the source roots themselves become modules that contain every file beneath them (`lib` = 227 files and 484 exports, `cli` = 45 files), so `lib` shows up as a false dependent of everything.
- **Edges are module→module import edges, with the importing files attached** (`ModuleDependency {resource, importedBy[]}`, `types.ts:131`). Imported names are not recorded. **Imports within a module are dropped** (`analyzer.ts:402`: `targetModule !== sourceModule`). The target side stays module-level, so it cannot say *which file* in `lib/driver` a dependent imports. There are no reference-level edges.
- **Signatures are stored only for public exports.** When a module has a barrel, only the barrel's exports are stored; otherwise every non-test file's exports are (`analyzer.ts:84-86`). Functions come from `checker.signatureToString`. Interfaces and types store the **full declaration text** (`analyzer.ts:329`).
- **There is no canonical JSON.** The output is markdown only: `index.md` plus one shard per module (`generator.ts:273-322`). The in-memory `AnalysisResult` is the only structured form. Programmatic access is `createProjectSnapshot` → `typescriptSourceAnalyzer.analyze` (both in `lib/architecture-map/index.ts`, and both read-only), or the markdown shards through `retrieval.ts`.
- **Freshness is cache-on-hash** (the sha256 of config plus source contents, stored as `projectHash` in the index frontmatter, `freshness.ts:37`). The generator always re-analyzes and skips the write when nothing changed. There is no incremental analysis.

Real sample (`modules/lib/driver.md`, generated on the copy):
```
## Dependencies
- `lib/agents` (imported by: `lib/driver/drive-finalization.ts`, `lib/driver/drive-scheduler-backend.ts`, `lib/driver/run-one-task.ts`)
- `lib/fs` (imported by: `lib/driver/atomic-file.ts`, `lib/driver/lock.ts`, `lib/driver/run-state.ts`)
```

## 2. Tests (verified)

Tests are **not in the graph**: `tests/` is outside the default source roots (`config.ts:34`), so there are no test→source edges. Imports alone would give a usable mapping. In my scratch file graph, 277 of 295 test files import a source file directly, covering 219 of 325 source files. `fallow dead-code --trace-file` also returns `imported_by` with tests, in 0.23 s per file.

## 3–5. Have / need

| Function | Have | Missing |
|---|---|---|
| `repoMapSlice` | Module deps; public signatures (barrel-only in some modules); a `ts.Program` and `resolveModuleName` for every import (`analyzer.ts:389`) | File nodes; intra-module edges; imported-name edge weights; exports for non-barrel files; elided type bodies; PageRank; token budget; JSON |
| `blastRadius` | Module-level dependents | Diff parser (none exists in `lib/`); hunk → enclosing function; file-level reverse closure; test nodes |
| `planVersusActual` | Nothing specific | Parse `Touches` paths from the plan; `git diff --name-only`; set difference (trivial) |

**Changed-function resolution does not exist today.** Fallow's `health` findings do carry `name/line/line_count`, but only for functions over a threshold (sample: `exportedNames` in `fallow-provider.ts:2136`). `--diff-file` narrows findings to hunks. It does not list every changed function.

## 4. Acceptance probe: `lib/driver/run-one-task.ts` (verified numbers)

**From today's data (module level):** it can attribute only the cross-module deps `lib/agents` and `lib/tasks`. Its 8 intra-driver deps are invisible. Dependents are only "modules `cli`, `cli/drive`, `domains/shared`, `lib`", covering 33 files that import *something* in `lib/driver`. A naive module slice costs 7,705 tokens for lib/driver's exports alone, and about 38.6k with neighbours. **Today's data fails the probe.**

**From a file-level import graph (scratch, TS parse only, 637 files, 2,373 edges, 393 ms):**
- 10 direct deps, for example `runtime-helpers.ts` (16 names), `types.ts` (9 names), `drive-finalization.ts`, `report-parser.ts`, `tasks/task-manager.ts`.
- 4 source dependents: `drive-scheduler-backend.ts`, `drive-graph-runner.ts`, `cli/drive/subcommand.ts`, `orchestration/driver-tool.ts`.
- 4 test dependents: `run-one-task.test.ts`, `contradicted-block-retry.test.ts`, `worktree-snapshot-timeout.test.ts`, `cli/drive/run.test.ts`. This matches `fallow --trace-file` exactly.
- Slice size, using the target's own exports, each imported symbol's stored signature, and dependents with the names they use: **2,823 tokens** with full type bodies (`DriverEvent` alone is 705). **With interface/type bodies elided to headers: 1,411 tokens** (chars/4; about 1,710 at chars/3.3). It fits, but only barely. PageRank would have to drop low-rank lines, and `runtime-helpers.ts` (16 imported names) should be ranked, not listed wholesale.
- One imported symbol (`probeJournalBlockReason`) has **no stored signature** because the `lib/agents` barrel does not re-export it.

Inference (not measured): Aider's intra-file def/ref weighting adds little here. Imported names are already symbol-level references across files, and those are the edges PageRank needs.

## 6. Cost (verified, on a copy, no narrative)

Analyzer: 1.57 s wall, 1.83 s process, **~890 MB peak RSS**. Full generate: 1.49 s cold, 1.04 s warm/unchanged (it re-analyzes every time). Output: 46 files, 464 KB (`index.md` 7 KB, `lib/driver.md` 36 KB). Skeleton JSON: 546 KB. Narratives would add model calls, at most 20 modules per run.

## Recommendation

Extend the existing analyzer rather than adding a second graph. It already resolves every import, then throws away the file target, the intra-module edges, and the imported names. Add a file-graph pass (new `lib/architecture-map/file-graph.ts`):

- **Nodes:** every file, with tests as graph-only nodes.
- **Edges:** file→file, weighted by imported-name count, with a type-only flag.
- **Exports:** per file, not only barrels. Types and interfaces get an elided header form.

Emit it as canonical `memory/architecture/graph.json` in the same bundle and hash, and build the three functions on top of it.

Size estimate (inferred): about 670 lines plus tests.
- File graph: about 180.
- JSON emit and load: about 60.
- `repoMapSlice`: about 150.
- `blastRadius` (diff parser, hunk→function via `ts.createSourceFile`, closure): about 160.
- `planVersusActual` plus Mermaid: about 120.

Use fallow `--trace-file` as a test oracle, not as the substrate.

## Open decisions for the human

1. Should the lean domain commit `graph.json` to the repo, generate it on demand (about 1.5 s), or cache it outside git? No map is committed today.
2. Should `blastRadius` tests be direct importers only, or the transitive reverse closure until the first test? Transitive is safer but can explode on `types.ts`-style hubs.
3. Should the `lib` and `cli` super-modules be fixed in the module view (it affects the existing shards and viewer), or ignored by the file-level functions?
4. Is chars/4 an acceptable token estimator for the budget, or must the budget match a real tokenizer? None is installed.
