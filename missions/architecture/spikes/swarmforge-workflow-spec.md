# SwarmForge — Agent-Orchestration Workflow Spec

Replication reference for engineers reproducing these procedures in a **different agent harness**.
Source: `/Users/cosmos/Projects/swarm-forge` @ branch `main` (commit `9acd54d`).

> **Branch caveat, applies to the whole document.** `main` is documentary. It carries the shared scripts,
> the three default constitution articles, `bb.edn`, the test suite (`test/swarmforge/handoff_test.clj`,
> `test/swarmforge/script_test.clj`), `.gitignore`, `close-swarm`, and the docs. It does **not** contain
> `./swarm`, `swarmforge/swarmforge.conf`, `swarmforge/constitution.prompt`, or `swarmforge/roles/*.prompt`.
> Those live on the runnable branches (`two-pack`, `four-pack`, `six-pack`). Anything below sourced from
> README prose rather than code is marked **[README-only]**.
>
> **The install URL is unverified.** README points at `github.com/unclebob/swarm-forge`; this clone's origin
> is `git@github.com:ag0os/swarm-forge.git`, and the runnable branches exist on neither remote as far as this
> document can establish. Treat every pack-specific detail (§4.7 chains, batch modes, priority conventions,
> role prompt text) as unverified secondhand description.

---

## 1. What the system is

SwarmForge is a config-driven launcher that turns one text file into N parallel AI coding agents, each pinned
to its own git worktree/branch, each driven by a role prompt plus a layered "constitution", and each
communicating **only** through validated files delivered by a daemon. A "swarm" is exactly the set of `window`
lines in `swarmforge/swarmforge.conf`: one line = one role = one tmux session = one terminal surface = one
worktree = one mailbox. The launcher is single-shot — it validates, materializes state, starts a daemon, types
agent commands into tmux panes, and exits. The architecture's defining constraint is that **the orchestrator
cannot call into a running agent; it can only type characters at its terminal** — most of the odd machinery
below exists to work around that, and disappears in a harness that owns the agent loop.

```
  swarmforge.conf ──parse──> roles table ──┬─> .worktrees/<name>  (git worktree, branch swarmforge-<name>)
  (window <role> <agent>                   ├─> tmux session swarmforge-<role>  (detached)
   <worktree> [task|batch] [args])         ├─> <worktree>/.swarmforge/handoffs/{outbox,inbox/...}
                                           │      (mailbox, per role)
                                           └─> <project-root>/.swarmforge/prompts/<role>.md
                                                  (2-line pointer prompt, referenced absolutely)
                                                        │
        ┌───────────────────────────────────────────────┴──────────────────────────────┐
        v                                                                              v
  ┌───────────┐  swarm_handoff.sh   ┌──────────┐   1s poll    ┌───────────┐  send-keys  ┌───────────┐
  │  AGENT A  │ ──validate+queue──> │  outbox/ │ ───────────> │ handoffd  │ ──wake────> │  AGENT B  │
  │ worktree  │                     └──────────┘   copy+hdrs  │  (daemon) │             │ worktree  │
  └───────────┘                          │                    └───────────┘             └─────┬─────┘
        ^                                v                          │                         │
        │                             sent/ | failed/               └──> inbox/new/ ──────────┘
        │                                                                     │
        └──── merge_and_process <sender> <commit> ────────────  ready_for_next.sh (new→in_process)
                                                                done_with_current.sh (→completed, chains)

  side rails:  swarm-window-watchdog (reopens GUI windows, cascades teardown)
               swarm-cleanup.sh / close-swarm (stop daemon → kill sessions → close windows)
               terminal-adapters/{terminal-app,iterm2,ghostty,windows-terminal,none}.sh
```

> ### ⛔ Five things the source does not define — a port must decide them before writing code
>
> 1. **The receive half of the protocol** (`merge_and_process`) has no implementation. See §8.1 #9.
> 2. **Work ingress** — how a human request enters the swarm — has no protocol message type. See step 25b.
> 3. **Liveness in a driver-owned harness.** Deleting tmux notification removes the only mechanism for
>    re-entering a stopped agent, and the completion chain does not replace it. See §8.1 #10.
> 4. **Routing.** The manifest carries no edges; every chain in §4.7 lives in prose only. See §4.7.
> 5. **Convergence.** Nothing merges any role branch back to `master`. See §8.1 #11.

---

## 2. The lifecycle, step by step

### Phase A — install & start

| # | Actor | Trigger | What happens | Written where |
|---|---|---|---|---|
| 1 | human | first run on a machine | Install `zsh`, `git`, `tmux`, Babashka (`bb`), and ≥1 agent CLI (`claude`/`codex`/`copilot`/`grok`). Local-only, no server. | — |
| 2 | human | first setup in target project | `BRANCH=four-pack` then `curl -L "https://github.com/unclebob/swarm-forge/archive/refs/heads/${BRANCH}.tar.gz" \| tar -xz --strip-components=1`. Valid: `two-pack`, `four-pack`, `six-pack`. **Never `main`.** URL unverified — see caveat. | project root |
| 3 | human | ready to run | `./swarm` from project root. Env overrides: `SWARMFORGE_TERMINAL=ghostty\|terminal-app\|windows-terminal\|none`, `SWARMFORGE_PREVENT_SLEEP=0`, `SWARMFORGE_AGENT_START_DELAY_MS=<ms>`. | — |
| 4 | `./swarm` wrapper | `swarmforge/scripts/` missing | **[README-only]** Downloads `main`, copies shared scripts, stages shared constitution articles, then execs `swarmforge/scripts/swarmforge.sh`. Later runs reuse the local scripts dir. ⚠️ *No code on `main` implements the article staging — see Unresolved #3.* | `swarmforge/scripts/`, `swarmforge/constitution/articles/` |
| 5 | shim | `swarmforge.sh` runs | 5 lines: `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"` → `exec bb "$SCRIPT_DIR/swarmforge.bb" "$@"`. All logic is in the `.bb`. | — |

### Phase B — launcher (`swarmforge.bb`, 591 lines, single-shot)

| # | Step | What happens | Written where |
|---|---|---|---|
| 6 | CLI dispatch | `-main` cases on `(first args)`. Flags: `--test-parse [root]`, `--test-terminal-bridge <root> <backend>`, `--test-launch-command <root> <agent> [args]`, `--test-agent-start-delay`, `--test-sleep-inhibitor-prefix`, `--test-tmux-base-indexes <socket>`. Only `--test-parse` truly defaults its root to `user.dir`; the other two consume the second arg as root **positionally** and misparse if it is omitted — `--test-terminal-bridge` reads the backend from `(nth args 2)` and throws `IndexOutOfBounds`, `--test-launch-command` reads the agent from `(drop 2 args)` and yields a nil agent whose `case` returns nil. Any other first arg = project root; no args → `user.dir`. No `--help`. | — |
| 7 | Hard preflight | `command -v` for `tmux`, `git`, `bb`. Missing → stderr + `exit 1`. | — |
| 8 | Build context | Absolutize working dir; `script-dir = (fs/parent *file*)`. Socket path = `/tmp/swarmforge-<$UID or user.name>/<CRC32 of abs working-dir>.sock`. | in-memory |
| 9 | Probe tmux indexes | Create socket dir; if no server, spawn throwaway `swarmforge-probe-<pid>` running `sleep 60`; read `show-options -gqv base-index` and `-gwqv pane-base-index`; kill probe. Non-numeric → 0. | in-memory |
| 10 | Git init *(only if no `.git`)* | `git init <dir>` (positional, not `-C`) → `git branch -M master` → write `.gitignore` with `.swarmforge/` + `.worktrees/` → `git add .` → `git commit -m "Initial swarmforge repository"`. | `.gitignore` |
| 11 | Git excludes *(always)* | Append `.swarmforge/` and `.worktrees/` to `git rev-parse --git-path info/exclude`. ⚠️ The call **is** `-C`-anchored, but `--git-path` prints relative to git's own CWD regardless of `-C` (verified: `.git/info/exclude`), and the result is wrapped in `fs/path` with no absolutization — so `create-dirs` + `ensure-in-file!` land under the *process* CWD. Adding `-C` does not help; absolutize against `:working-dir`. All remaining git calls are `-C`-anchored. | `.git/info/exclude` |
| 12 | Parse config | Require `swarmforge/swarmforge.conf` + `swarmforge/constitution.prompt` to exist. Skip blanks and `#`. ≥4 whitespace fields; field 1 must be `window`; field 3 lower-cased. Field 5 is receive-mode **only** if literally `task`/`batch` (default `task`); everything after is joined with spaces → `extra-args`. Derives `session = swarmforge-<role>`, `display-name` = role with `-`/`_`→space, title-cased. **Agent count = number of accepted lines. Role assignment is positional. Nothing is hardcoded — and no edge, successor, or priority is stored (see §4.7).** | in-memory |
| 13 | Backend preflight | `command -v <agent>` for every configured agent. | — |
| 14 | `prepare-workspace!` | Create `.swarmforge/{,notify,prompts,daemon}`, `.worktrees/`, socket dir. Write `.swarmforge/tmux-socket`. Verify **24 helper scripts + 5 terminal adapters** all exist AND are executable (the literal `required-helpers` vector has 24 entries; there is no `handoffd.sh` — `handoffd.bb` is spawned by path and relies on its shebang plus the executable bit). Write `sessions.tsv` and `roles.tsv`. | `.swarmforge/*` |
| 15 | `prepare-worktrees!` | For each role whose worktree name ∉ `{none, master}` **and** whose `<path>/.git` does not exist: `git -C <root> worktree add --force -B swarmforge-<worktree-name> <path> HEAD`. **Skip-if-present — a second `./swarm` leaves each worktree and branch exactly where the agent left it; nothing is ever reset or rebased.** | `.worktrees/<name>` |
| 16 | `prepare-handoff-dirs!` | Per role: create `<worktree>/.swarmforge/handoffs/{outbox/tmp,sent,failed,inbox/new,inbox/in_process,inbox/completed}`. Create-only — **never drains stale queue state from a previous run.** | mailbox tree |
| 17 | Kill stale | `bb stop_handoff_daemon.bb <root>`; then per role, `tmux has-session` → `kill-session`, printing `Existing SwarmForge session found: <s>. Killing it...`. | — |
| 18 | Create sessions | Banner `SwarmForge v1.0 Starting`. Per role: `tmux -S <sock> new-session -d -s <session> -n swarm` → `rename-window` to display name → `set-window-option allow-rename off`. | tmux |
| 19 | Record tmux env | `display-message -p '#{socket_path},#{pid},#{pane_id}'`. **No reader exists on `main`.** | `.swarmforge/tmux-env` |
| 20 | `sync-worktree-scripts!` | For each worktree ≠ main dir: copy the entire launcher `script-dir` (incl. `terminal-adapters/`) into `<worktree>/swarmforge/scripts/`; create `<worktree>/.swarmforge/notify/`; copy `sessions.tsv`, `roles.tsv`, `tmux-socket`, `tmux-env`. **Snapshot, not a link.** ⚠️ **Note what is NOT synced: the constitution, the articles, and the role prompts.** They reach each worktree only as git-tracked files in the branch checkout — which means the shared `main` articles must already be **staged and committed** to the runnable branch *before* `git worktree add` ran. Any port whose workspaces are not git checkouts of a branch containing the prompts (containers, separate dirs, plain directories) must copy the prompt tree explicitly, or every agent boots with two lines pointing at nothing. | worktrees |
| 21 | Start daemon | Delete `daemon/stop`; spawn `[<inhibitor>...] handoffd.bb <root>` with stdout+stderr → `daemon/handoffd.log`. Inhibitor = `caffeinate -dims` (Darwin, **only if `caffeinate` is on PATH**) or `systemd-inhibit --what=sleep:idle --who=SwarmForge --why=SwarmForge swarm is active` (Linux, **only if both `systemd-inhibit` and `systemctl` are on PATH and `systemctl is-system-running` prints `running` or `degraded`**); the whole prefix is suppressed by `SWARMFORGE_PREVENT_SLEEP=0`. `--why=…` is **one argv element** — there are no shell quotes. Prints `Started handoff daemon` + `" with OS sleep prevention"` only when an inhibitor was actually prepended (`(when (> (count command) 2))`). | `daemon/` |
| 22 | Write prompt file | Per role, inside `launch-command`: `<project-root>/.swarmforge/prompts/<role>.md` gets **exactly** two lines:<br>`Read swarmforge/constitution.prompt, then read every file it refers to recursively, and obey all of those instructions.`<br>`Read swarmforge/roles/<role>.prompt, then read every file it refers to recursively, and follow all of those instructions.`<br>**Nothing is concatenated or inlined.** | `.swarmforge/prompts/<role>.md` |
| 23 | Launch agents | Sequential, `SWARMFORGE_AGENT_START_DELAY_MS` (default 1500) between each. One `tmux send-keys -t "<session>:<Display>.<pane-base-index>" "<cmd>" Enter` per role. Command runs in the pane's **login shell** — the agent is not exec'd by the orchestrator. | tmux |
| 24 | Cleanup trailer (index 0 only) | The **first** config line's command gets suffixed: `; exit_code=$?; SWARMFORGE_TERMINAL_BACKEND='<b>' nohup '<dir>/swarm-cleanup.sh' '<sock>' '<window-ids>' '<s1>' '<s2>'... >/dev/null 2>&1 &!; exit $exit_code`. This is what makes the first window the cleanup window. `&!` is **zsh-only**. | — |
| 25 | Open surfaces | If `terminal_backend_can_open_sessions`: **and only if `terminal_backend_tracks_windows` also passes**, truncate `window-ids`+`windows.tsv`. Then per role `terminal_open_session <session> "SwarmForge <Display>" <previous-window-id>`; the returned id is appended to both files and becomes the next role's sibling **only under `terminal_backend_tracks_windows`** — launch-only backends (`windows-terminal`) never write either file, always pass an empty sibling id, and leave stale `window-ids`/`windows.tsv` from a previous run on disk. If it tracks windows: spawn the watchdog. If it tracks nothing: yellow warning, no watchdog. If it can't open at all: attach current shell to the first session. Launcher then **exits**. | `.swarmforge/window-ids`, `windows.tsv` |
| 25b | ⛔ **Work ingress — undocumented and implicit** | Nothing in the code, README, or `handoff-protocol.md` says how a human feature request enters the swarm. In tmux the implicit answer is that the human types into the first (or specifier) role's pane after launch; there is **no protocol message type for user intent** — `note` is explicitly reserved for system-directed messages and `git_handoff` requires a commit. A port must add an explicit ingress: inject the user request as the first user-turn message to a designated entry role, or synthesize an inbox item for it. **Name the entry role in the manifest.** | — |

**Agent launch command lines (verbatim).** Common prefix:
`export SWARMFORGE_ROLE='<role>' && export PATH='<role-script-dir>':$PATH && cd '<role-worktree>' && `

| Agent | Suffix |
|---|---|
| claude | `claude --append-system-prompt-file '<p>' --permission-mode acceptEdits -n 'SwarmForge <Display>' <extra> "$(cat '<p>')"` |
| codex | `codex -C '<worktree>' <extra> "$(cat '<p>')"` |
| copilot | `copilot -C '<worktree>' --name 'SwarmForge <Display>' <extra> -i "$(cat '<p>')"` |
| grok | `grok --cwd '<worktree>' --permission-mode <acceptEdits\|bypassPermissions> <extra> --rules "$(cat '<p>')" --verbatim "$(cat '<p>')"` |

`<p>` = `<root>/.swarmforge/prompts/<role>.md` — an **absolute** path, referenced after the agent has `cd`'d
into its worktree. Note claude and grok each receive the same file **twice** (system slot + initial-message
slot) — redundancy against unreliable CLI system-prompt handling, not emphasis. Grok escalates to
`bypassPermissions` iff extra-args contain `--always-approve`, `--yolo`, or `--permission-mode bypassPermissions`.

### Phase C — steady state (loop)

| # | Actor | Trigger | What happens |
|---|---|---|---|
| 26 | agent | finished a slice, committed | Writes a **headers-only** draft in `./tmp/` of its worktree, runs `swarm_handoff.sh <draft>`. |
| 27 | `swarm_handoff.bb` | invoked | Validate (**all errors accumulated and reported together, not fail-fast**; commit canonicalization shells out to `git` even when other errors are already present, so the error path is not side-effect-free) → canonicalize → allocate sequence → write `outbox/tmp/<f>.tmp` → **rename** into `outbox/<f>.handoff` → delete draft → print `HANDOFF QUEUED: <path>`. Failure: `HANDOFF INVALID: <draft>` + the full itemized error list in one round trip, exit 2, **draft left on disk**. |
| 28 | `handoffd` | 1000 ms poll | Re-read `roles.tsv` + `tmux-socket` **every poll**. Per role, list `outbox/*.handoff` (regular files only, sorted by filename) → per recipient: add `recipient` + `enqueued_at`, write into `<recipient-worktree>/.swarmforge/handoffs/inbox/new/<same-name>` → `notify!` → move original to sender's `sent/`. Exception → `failed/` + `.error` sidecar. |
| 29 | `handoffd notify!` | after each recipient copy | `tmux -S <sock> send-keys -t <session> -l "You have new handoff mail. If idle, run ready_for_next.sh."` → sleep 150 ms → `send-keys C-m` → sleep 50 ms → `send-keys C-j`. Targets the **session only** — tmux routes to whatever pane is active. |
| 30 | agent | woken, or restarted | `ready_for_next.sh` (no args). Reads `SWARMFORGE_ROLE`, looks up `roles.tsv` field 7, execs `ready_for_next_task.sh` or `..._batch.sh`. |
| 31 | queue helper | — | **task**: resume the single in-process file if present, else move the first sorted `inbox/new/*.handoff` → `in_process/`, stamp `dequeued_at`, print the task block. **batch**: read the *first sorted file's* priority; move every `new/` file with **that exact priority** into `in_process/batch_<yyyyMMddTHHmmssZ>_<NNNNNN>/`, where `NNNNNN` starts at `000001` and increments **only to avoid an already-existing directory name** (it is a local collision counter, *not* a send sequence); stamp `dequeued_at` on each; print `BATCH`/`COUNT`/`PRIORITY` (taken from the first file) + numbered items. Files of other priorities **remain in `new/`** and are deferred by nothing but the next dequeue. Empty → `NO_TASK`. |
| 32 | agent | work done (incl. after merely reading a `note`) | `done_with_current.sh` → stamps `completed_at`, moves to `completed/`, prints `COMPLETED:` (+ `COMPLETED_BATCH:`), then **`process/exec`s the matching `ready_for_next_*`** so the next `TASK:`/`BATCH:`/`NO_TASK` appears in the same output and exit code. |

### Phase D — shutdown

| Path | Trigger | What happens |
|---|---|---|
| **Agent exit** | index-0 agent's *process* exits in its pane | Trailer fires `swarm-cleanup.sh <sock> <window-ids> <sessions...>`: source adapter → `bb stop_handoff_daemon.bb <root>` (fallback: `kill -TERM` on the pid file) → `tmux kill-session` per session → `sleep 1` → `terminal_close_window` per id. |
| **Window closed** | first *terminal window* closed | ⚠️ Does **not** run `swarm-cleanup.sh`, and there is no shell trap — the trailer is a command *suffix*. Closing a window only detaches a tmux client; it does not end the agent process. The **watchdog** notices the cleanup-owner window missing on 3 consecutive polls and runs its own inlined `kill-all-sessions!`: stop daemon → `tmux kill-session` per row → `terminal_close_window` per row. On backends that don't track windows, no watchdog is started and closing a window tears down nothing. |
| **Explicit** | `close-swarm [project-root]` | Requires `<root>/.swarmforge/` and non-empty `tmux-socket`. Resolves `swarm-cleanup.sh` from `<self>/swarmforge/scripts/`, `<self>/`, then `<root>/swarmforge/scripts/`. Discovers sessions from `sessions.tsv` → `windows.tsv` → live `tmux list-sessions`. Maps `SWARMFORGE_TERMINAL` → `SWARMFORGE_TERMINAL_BACKEND` **without normalization** (see §9). Then delegates to `swarm-cleanup.sh`. |
| **Daemon stop** | either path | `stop_handoff_daemon.bb`: create `daemon/stop` → `kill -TERM` → poll `kill -0` every 100 ms up to 5000 ms → `kill -KILL` → delete pid file → delete stop file. |

---

## 3. The agent contract

Delivered via the 2-line pointer prompt → `constitution.prompt` → articles + `roles/<role>.prompt`, all resolved
**relative to the agent's CWD** (its worktree). Shared articles on `main`: `workflow.prompt` (27 lines),
`engineering.prompt` (44), `handoffs.prompt` (69). Packs add `project.prompt`, `local-engineering.prompt`,
`local-workflow.prompt` **[README-only]**: same filename = full override, `local-*` = additive.

> ⛔ **The prompt graph cannot be reconstructed from `main`.** `constitution.prompt` is the root of the whole
> graph and is not on this branch, so no agent's system prompt can be assembled from this repo alone. What
> *is* determinate: the pointer prompt is exactly the two lines in step 22; line 1 resolves to
> `swarmforge/constitution.prompt`, whose only observed function (per README l.130) is to instruct the agent to
> read every file in `swarmforge/constitution/articles/`. **Article order is unspecified and appears not to
> matter.** For a port without a file-read tool, concatenate in this order: `constitution.prompt`, then all
> articles in lexicographic filename order, then `roles/<role>.prompt` — and prepend a literal instruction to
> re-read this block whenever a handoff payload says to (otherwise "Re-read your role and constitution."
> silently becomes a no-op). The `local-*` additive vs. same-name override precedence is **[README-only]** with
> no implementation anywhere on `main`.

### Workflow article — worktree, commits, temp files

| Rule (quoted) | Enforcement |
|---|---|
| "At startup, discover and remember the branch or worktree assigned to your role." | prompt only |
| "If your assigned worktree is `master`, work in the main project checkout on its current branch; do not expect or create a `.worktrees/<role>` directory for that role." | prompt + launcher skips those worktrees |
| "Work only in your assigned branch or worktree." | **prompt only** — the agent is merely `cd`'d there; nothing sandboxes it |
| "Do not inspect, diff, merge, or base work on another branch unless that branch is specifically named in a handoff or explicit user instruction." | prompt only |
| "Do not run `./swarm` from an agent worktree to repair helper scripts. If handoff helper scripts are missing from PATH, stop and report the startup failure." | prompt only |
| "Do not add role bylines to announcements or check-in comments." | prompt only. *Reversal:* commit `582f66c` required a `By <role>.` prefix on check-ins; `a9a3ffa` deleted that and moved the byline to commits. |
| "Include your role byline in every git commit message in this form: `By <role>.`" — example: `Implement handoff validation\n\nBy coder.` | prompt only, no hook |
| "Use `./tmp/` in your assigned worktree for temporary files; do not use `/tmp`." | prompt only |
| "If the expected git layout or assigned worktree is missing, stop and report instead of silently working in the wrong place." | prompt only |

### Handoffs article — the coordination rules that matter

| Rule (quoted) | Enforcement |
|---|---|
| "Write a draft handoff file with only structured headers, then run `swarm_handoff.sh <draft-file>`." | **script** — any non-blank line after the header block is a validation error |
| "Use only these message types: `git_handoff` / `note`" | **script** |
| "Do not send `note` handoffs unless the user, role prompt, or constitution explicitly directs you to send one." | prompt only |
| "When blocked by ambiguity, contradiction, or test/specification conflict, stop and ask for clarification" | prompt only |
| "When your role is an intermediate step in the pack pipeline, always forward a `git_handoff` to the next role in the chain after completing the inbound task, **regardless of what changed**. Formatting-only, manifest-only, audit-only, generated metadata, and other non-functional churn still require a forward down the chain." | **prompt only** — highest-value candidate for machine enforcement in a port |
| "When your role sends the end-of-chain handoff to multiple recipients, those recipients merge only (`merge_and_process`). They do not forward that handoff further. Only this terminal broadcast is merge-only without re-forwarding." | prompt only |
| "Preserve the received task name when forwarding work for the same task. If the handoff starts new work, invent a short stable task name." | prompt only; `TASK_NAME:` is surfaced by the helper |
| "Do not write long handoff bodies. The helper generates the delivered payload." | **script** |
| "Do not send tmux notifications directly." | architecture — only the daemon holds the socket |
| "Do not hand-edit, merge, stage, or commit handoff runtime state." | prompt + `.swarmforge/` is git-excluded |
| "Use only the task information printed by the helper scripts." | prompt only — effectively forbids reading inbox files |
| "If a tmux wake-up arrives while already working on a task, ignore it." | prompt only — wake-ups are **lossy by design** |
| "`note` handoffs are tasks too; after reading or acting on a note, run `done_with_current.sh` before accepting any other handoff." | prompt only |
| "On restart, run `ready_for_next.sh` and follow its output." | prompt only |

### Engineering article — the author's methodology, *not* orchestration

It pins language-specific CRAP/mutation/DRY tooling (Go, Clojure and Java **only** — no mapping exists for any
other language) and verification sequencing. SwarmForge runs identically with any other engineering article; a
port should substitute its own and skip this file.

---

## 4. Handoff protocol

### 4.0 File grammar (applies to drafts, queued files, and delivered copies)

Line format is exactly `<field>: <value>` — the separator is the **literal two characters colon-space**, not
`:`. The split limit is **2**, so values may legally contain `: ` (`message: fix: the parser` is valid and
means field `message`, value `fix: the parser`). Both field and value must be non-empty. The header block
**terminates at the first blank line**; readers take headers via take-while-not-blank, and the body is
everything after the first `\n\n` in the whole file. Files end with a trailing newline. A parser that splits on
`:` or on the *last* blank line is incompatible and will silently corrupt colon-bearing values.

### 4.1 Draft (what the agent writes)

```text
type: git_handoff          |  type: note
to: <role>[,<role>...]     |  to: <role>[,<role>...]
priority: NN               |  priority: NN
task: <short-stable-name>  |  message: <one line, max 80 chars>
commit: <10-char-abbrev>   |
```

Agent-writable headers: `type to priority task commit message`. Reserved (rejected):
`id from role recipient created_at enqueued_at dequeued_at completed_at`.

The `to` list is split on commas with **empty segments preserved** (`split #"," -1`): a leading or trailing
comma (`to contains an empty recipient`), a duplicate recipient, an unknown recipient, or an underscore in any
recipient name is a validation error — the underscore rule is re-checked per-send in addition to the startup
check. **Self-addressing is permitted**: `to:` may include the sender and validation does not object; the
message is delivered to the sender's own inbox. The "all *other* roles" phrasing in §4.7 is convention
enforced only by role prompts.

### 4.2 Queued file

Path: `<worktree>/.swarmforge/handoffs/outbox/<priority>_<yyyyMMdd'T'HHmmss'Z'>_<6-digit-seq>_from_<sender>_to_<r1>_<r2>.handoff`

**Lexicographic ascending filename order IS queue order**, therefore **`00` is the highest priority and `99`
the lowest** (priority → UTC timestamp → per-worktree sequence). Every porter's intuition is the opposite;
getting it backwards inverts the entire queue and silently changes which items batch together.

The `_to_<r1>_<r2>` suffix is audit only; headers are authoritative. The `from_<sender>` component is
**load-bearing** — the sequence counter is per-workspace, so it is the only thing preventing two senders from
colliding on an inbox filename in the same second.

```text
id: 20260615T140531Z_000042_from_architect
from: architect
to: coder,cleaner
priority: 00
type: git_handoff
role: architect
task: handoff-validation
commit: a1b2c3d9e8
created_at: 2026-06-15T14:05:31.482913Z

Re-read your role and constitution.

merge_and_process architect a1b2c3d9e8
```

Body is generated, never authored — `git_handoff` → `"Re-read your role and constitution.\n\nmerge_and_process <sender> <canonical-commit>"`; `note` → `"Re-read your role and constitution.\n\n<message>"`.

### 4.3 Delivered copy (`inbox/new/`, same filename)

`handoffd` adds `recipient` + `enqueued_at` and re-renders headers in a fixed preferred order
`[id from to recipient priority type role commit message created_at enqueued_at dequeued_at completed_at]`,
then any remaining keys alphabetically. `task` is **not** in the preferred list, so it lands last:

```text
id: 20260615T140531Z_000042_from_architect
from: architect
to: coder,cleaner
recipient: coder
priority: 00
type: git_handoff
role: architect
commit: a1b2c3d9e8
created_at: 2026-06-15T14:05:31.482913Z
enqueued_at: 2026-06-15T14:05:32.117440Z
task: handoff-validation

Re-read your role and constitution.

merge_and_process architect a1b2c3d9e8
```

### 4.4 What the agent actually sees

```text
TASK: /proj/.worktrees/coder/.swarmforge/handoffs/inbox/in_process/00_20260615T140531Z_000042_from_architect_to_coder_cleaner.handoff
FROM: architect
TYPE: git_handoff
PRIORITY: 00
TASK_NAME: handoff-validation
PAYLOAD:
Re-read your role and constitution.

merge_and_process architect a1b2c3d9e8
```

Batch form: `BATCH: <dir>` / `COUNT: <n>` / `PRIORITY: <p>` (from the first file), then per file a blank line,
`BATCH_ITEM: <1-based>`, and the full task block. Empty queue: `NO_TASK`. Missing-header defaults:
`FROM: unknown`, `TYPE: unknown`, `PRIORITY: 50`. **`TASK_NAME:` is omitted entirely when the `task` header is
absent — i.e. always for `note`.** `PAYLOAD:` is followed by the raw body with no added trailing newline.

### 4.5 Header lifecycle ownership

| Header | Written by |
|---|---|
| `id from to priority type role task commit message created_at` | `swarm_handoff.sh` |
| `recipient enqueued_at` | `handoffd` |
| `dequeued_at` | `ready_for_next_{task,batch}.sh` |
| `completed_at` | `done_with_current_{task,batch}.sh` |

**Two distinct time formats.** Lifecycle headers (`created_at`, `enqueued_at`, `dequeued_at`, `completed_at`)
use Java `DateTimeFormatter/ISO_INSTANT` on `Instant.now()` — an ISO-8601 instant with **variable sub-second
precision**, i.e. essentially always fractional on JDK 9+ (`2026-06-15T14:05:31.482913Z`). The id/filename
timestamp is second-precision UTC `yyyyMMdd'T'HHmmss'Z'`; the 6-digit sequence exists **solely** to break
same-second ties. Do not conclude second precision is sufficient for ordering.

Header rewrites are crash-safe: write a `.headers.*` temp file in the same dir, then `move :replace-existing true`. A missing header is inserted immediately before the blank line.

### 4.6 Queue state machine

State **is** file location. `new/` → `in_process/` (or `in_process/batch_<ts>_<NNNNNN>/`) → `completed/`.
At most one unit of work per agent. Task helpers refuse batch-shaped state and vice versa. **No recovery mode
exists** — refusal over repair is deliberate.

**Exit 0** — `NO_TASK` (queue empty).

**Exit 1 — environment / identity failures** (map these to tool errors in a port):

| Token / message | Cause |
|---|---|
| `Set SWARMFORGE_ROLE.` | env var unset or empty |
| `Cannot find SwarmForge project root` | no git root, or no `.swarmforge/roles.tsv` at root or at `--git-common-dir`'s parent |
| `Unknown sender role: <r>` | `SWARMFORGE_ROLE` not a first field in `roles.tsv` |
| `Unknown role: <r>` | role lookup miss — **including a *blank* field 7**, because `not-empty` yields nil and the row match fails |
| `Draft file not found: <p>` | draft path is not a regular file |
| usage text | wrong argument count |
| `NO_CURRENT_TASK` / `NO_CURRENT_BATCH` | nothing in process |

**Exit 2 — queue-state and validation failures:**

| Token | Meaning |
|---|---|
| `AMBIGUOUS_TASK_STATE` | >1 in-process item, empty batch dir, or a move target that already exists |
| `TASK_IN_PROCESS_IS_BATCH` / `TASK_IN_PROCESS_IS_SINGLE` | shape mismatch on accept |
| `CURRENT_WORK_IS_BATCH` / `CURRENT_WORK_IS_SINGLE_TASK` | shape mismatch on complete |
| `INVALID_RECEIVE_MODE: <m> for role <r>` | `roles.tsv` field 7 **present but** not `task`/`batch` |
| `HANDOFF INVALID: <draft>` + error list | any send-validation failure |

> A **blank** field 7 yields exit 1 `Unknown role`, not exit 2 `INVALID_RECEIVE_MODE`. Only a
> present-but-invalid value like `foo` reaches exit 2.

**Resume always beats dequeue** — an existing in-process item is re-printed (and `dequeued_at` is *not* re-stamped) even when a higher-priority item is queued.

### 4.7 Chain vs broadcast

*Source: `swarmforge/handoff-protocol.md` §Role Receive Mode (l.57-59), §Chain forwarding (l.157-173),
§Terminal broadcast (l.175-188); README §Branches (l.28, 39, 52). These facts **are** on `main`.*

| Pack | Chain | Terminal broadcast |
|---|---|---|
| two-pack | `coder → cleaner → coder` | `cleaner → coder` |
| four-pack | `specifier → coder → refactorer → architect → specifier` | `architect → specifier` |
| six-pack | `specifier → coder → cleaner → architect → hardender → QA` | `QA →` all other roles |

Batch-mode roles: six-pack `cleaner`, `architect`, `hardender`, `QA`; four-pack `architect`. Intermediates
**always** forward; only the terminal multi-recipient broadcast is merge-only.

> ⛔ **Routing is not configured.** The manifest grammar `window <role> <agent> <worktree> [task|batch] [args]`
> carries **no edges whatsoever** — `parse-config` stores no successor, no priority, and no terminal flag.
> Every edge in this table is asserted only in prose (in `handoff-protocol.md` and in the unavailable role
> prompts) and is enforced by nothing. A port must either **(a)** reproduce this by writing the successor into
> each role prompt, or **(b)** upgrade it by adding a `next:` field to the manifest and validating forwards
> against it — option (b) is the machine enforcement §3 calls the highest-value candidate. **Priority values
> are pure convention**: the script enforces only two digits; there is no defined vocabulary for what `00`
> versus `50` means.

---

## 5. Constraints & gates

Protocol-level constraints (10-hex commit rule, two-digit priority, atomic publish, exactly two message
types, headers-only drafts, at-most-one-unit-of-work, first-window-is-cleanup, `.swarmforge/` exclusion) are
stated with equal precision in §2 and §4 and are enforced solely by `swarm_handoff.sh` and the queue helpers.
This table carries only what is not stated elsewhere.

| Constraint | Enforced by | What breaks without it |
|---|---|---|
| `swarmforge.conf` + `constitution.prompt` must exist | script, `exit 1` | launcher can't know topology / agents get no rules |
| Line grammar ≥4 fields, field 1 = `window` | script | silent misparse of roles/args |
| Role names contain no `_` | script (startup + per-recipient at send) | `_` is the structural separator in audit filenames |
| Role names unique; worktree names unique except `master`/`none`; no `/`, not `.`/`..` | script | colliding sessions/worktrees/mailboxes |
| `none` and `master` are **synonyms** in the parser — both map the role to the main checkout and both bypass the duplicate-worktree check. There is no behavioral difference; `none` reads as "no dedicated worktree". | script | — |
| Agent ∈ `{claude, codex, copilot, grok}` | script | unbuildable launch line |
| **Receive mode ∈ `{task, batch}` — *not validated*.** Field 5 is taken as the mode only when it is literally `task`/`batch`; anything else defaults the mode to `task` and folds the field into `extra-args`, making the `Invalid receive mode` branch **unreachable dead code**. `window coder codex wt bacth` silently passes `bacth` to the agent CLI. | nothing | a port should reject unknown modes explicitly |
| `swarmforge/roles/<role>.prompt` exists for every role | script | agent has no role behavior |
| 24 helper scripts + 5 adapters exist **and are executable** | script | agents can't call handoff tools off PATH |
| `tmux`, `git`, `bb`, every configured agent binary on PATH | script | — |
| Reserved headers rejected; unknown/duplicate headers rejected | script | agents forge identity/timestamps |
| `task` required+≤80 for `git_handoff`; `message` required+≤80+one-line for `note`; each illegal for the other type | script | — |
| Per-worktree sequence serialized by lock **directory** `sequence.lock` (mkdir as test-and-set, 50 ms retry) | filesystem | same-second filename collisions |
| Daemon does **no** second validation — `swarm_handoff.sh` is the sole boundary | design | double/divergent validation |
| Delivery is at-most-once per file (`when-not (fs/exists? target)`) but **notification is unconditional** | script | duplicate inbox copies on retry |
| Wake-ups are generic (never name a file) and lossy | daemon design + prompt | agents would cherry-pick out of queue order |
| `.swarmforge/` + `.worktrees/` excluded via `info/exclude` **on every startup**; `.gitignore` **only on fresh repo init** (`ensure-initial-gitignore!` is called only from `initialize-git-repo!`, which no-ops when `.git` exists) | script | runtime state pollutes every agent's `git status` |
| Intermediate roles always forward; only terminal broadcast is merge-only | **prompt only** | pipeline stalls on no-op changes |
| Agents work only in their own worktree | **prompt only** | cross-worktree corruption |

---

## 6. Tool inventory

| Step | Tool / command | Purpose | Portable substitute |
|---|---|---|---|
| Install | `curl -L .../archive/refs/heads/${BRANCH}.tar.gz \| tar -xz --strip-components=1` | pull a runnable topology without a remote | template dir / package / OCI image, **pinned** |
| Entry | `./swarm` → `swarmforge.sh` → `bb swarmforge.bb [root]` | launcher | any runtime |
| Config | `swarmforge/swarmforge.conf` | topology | YAML/JSON manifest rows |
| Isolation | `git worktree add --force -B swarmforge-<n> <path> HEAD` | per-role checkout + branch | separate clones, containers, per-agent workspaces — must stay independent histories **and must share an object store, or the port must add an explicit fetch/push before every merge. Commit-SHA passing (§8.3 #3) works only because all worktrees share one object database; in separate clones the recipient cannot resolve the SHA at all.** |
| Repo bootstrap | `git init` / `branch -M master` / `add .` / `commit -m "Initial swarmforge repository"` | fresh-dir setup | don't rename the user's default branch |
| Sessions | `tmux -S <sock> new-session -d -s <s> -n swarm` / `rename-window` / `set-window-option allow-rename off` | detached agent containers | process supervisor, systemd, compose, k8s pods |
| Launch | `tmux send-keys -t <s>:<Display>.<pane-base> "<cmd>" Enter` | start the agent CLI | spawn the process directly |
| Wake | `send-keys -l "<msg>"` → `C-m` → `C-j` (150/50 ms pauses) | **the only channel into a running agent** | inject next user message, write stdin, or **drop notification entirely and drive an outer scheduler loop (§8.1 #10)** |
| Send | `swarm_handoff.sh <draft>` | validate + canonicalize + atomically queue | typed tool with closed schema + server-side body templating |
| Commit check | `git rev-parse --disambiguate=<a>` / `git cat-file -t` / `git rev-parse --short=10` | prove the SHA is one real commit | keep verbatim; add an explicit blank-output check (verified: `git rev-parse --disambiguate=0000000000` exits 0 with empty stdout) |
| Deliver | `handoffd.bb <root>` (1 s poll) | fan-out + wake | queue subscription / per-recipient delivery records |
| Accept | `ready_for_next.sh` → `_task` / `_batch` | dequeue by receive mode | tool returning structured task |
| Complete | `done_with_current.sh` → `_task` / `_batch` | complete + **chain into next** | one tool returning `{completed, next}` |
| Dispatch | `babashka.process/exec` | replace process image so child's stdout+exit become the caller's | single return value |
| Root discovery | `git rev-parse --show-toplevel`, `--git-common-dir` | find `roles.tsv` from inside a linked worktree | **pass the root explicitly** |
| Sequence | `fs/create-dir` on `sequence.lock` as mutex | serialize per-worktree counter | DB sequence / atomic counter / `<clock>_<uuid>` |
| Surfaces | `swarm-terminal-adapter.sh` + `terminal-adapters/*.sh` | 6-function contract, `zsh -c` bridge | implement the `none.sh` shape; drop the layer |
| GUI drivers / revival / sleep inhibition | `osascript`, `wt.exe`, `swarm-window-watchdog.sh`, `caffeinate`, `systemd-inhibit` | GUI observability, reopen closed windows, keep a laptop awake overnight | **no substitute — delete on any headless host.** Keep only the watchdog's *semantic*: closing the designated primary surface = shut down everything. |
| Teardown | `swarm-cleanup.sh <sock> <window-ids> [session...]`, `close-swarm [root]`, `stop_handoff_daemon.sh <root>` | stop daemon, kill sessions, close windows | explicit stop command + SIGTERM handler |
| Tests | `bb test` (runs `swarmforge.handoff-test`, `swarmforge.script-test`, exits with fail+error) | helper suite | must run from repo root; needs real `git` **and** `tmux` |

Terminal adapter contract (6 zsh functions, exit 0 = true): `terminal_backend_label`,
`terminal_backend_can_open_sessions`, `terminal_backend_tracks_windows`,
`terminal_open_session <session> <title> [sibling_id]`, `terminal_window_exists <id>`,
`terminal_close_window <id>`. `none.sh` implements the whole contract in 25 lines: it returns **false** for
both capability probes and for `terminal_window_exists`/`terminal_open_session`, **true** for
`terminal_close_window`, and `terminal_backend_label` returns 0 while echoing `current shell` — proving the
GUI layer is observability, not mechanism.

---

## 7. State model

### Config / prompt inputs (human-authored, version-controlled)

| Path | Written by | Read by |
|---|---|---|
| `swarmforge/swarmforge.conf` | human, runnable branch | `parse-config` at startup only |
| `swarmforge/constitution.prompt` | runnable branch | agent (existence checked by launcher; content never inspected) |
| `swarmforge/constitution/articles/{engineering,handoffs,workflow}.prompt` | `main` | agent, recursively |
| `swarmforge/constitution/articles/{project,local-engineering,local-workflow}.prompt` | runnable branch | agent |
| `swarmforge/roles/<role>.prompt` | runnable branch | that role's agent |
| `swarmforge/scripts/**` (24 helpers + 5 adapters) | `main` | launcher validation; agents via PATH; watchdog; cleanup |

### Runtime state — project root `.swarmforge/`

| Path | Contents | Written by | Read by |
|---|---|---|---|
| `roles.tsv` | 7 tab fields: `role, worktree-name, worktree-path, session, display-name, agent, receive-mode` | `write-roles-file!`, copied to each worktree | `handoffd` re-slurps the **project-root** copy every poll; `ready_for_next.bb`, `done_with_current.bb`, `swarm_handoff.bb`, `handoff_lib.bb` resolve `--show-toplevel` first, which inside a linked worktree returns the worktree — whose synced `roles.tsv` exists, so the git-common-dir fallback never fires. **Editing `roles.tsv` on a live swarm changes routing immediately but leaves agents on a startup snapshot.** |
| `sessions.tsv` | `index, role, session, display-name, agent` (1-based) | `write-sessions-file!` | `close-swarm` session discovery |
| `tmux-socket` | `/tmp/swarmforge-<uid\|user>/<CRC32>.sock` | `prepare-workspace!` | `handoffd` (every poll), `close-swarm` |
| `tmux-env` | `<socket_path>,<pid>,<pane_id>` | `write-tmux-env-file!` | **no reader on `main`** |
| `notify/` | empty dir | `prepare-workspace!`, sync | **no reader on `main`** |
| `prompts/<role>.md` | the 2-line pointer prompt | `write-agent-instruction-file!` | agent CLI at launch, by absolute path |
| `window-ids` | one opaque window id per line | `open-terminal-surfaces!`, watchdog | `swarm-cleanup.sh` (`close-swarm` only computes and forwards the path at l.19/l.75 — it never opens the file); rewritten in place by the watchdog |
| `windows.tsv` | `index, window-id, session, "SwarmForge <Display>"` | `open-terminal-surfaces!`, watchdog | watchdog, `close-swarm` fallback |
| `window-watchdog.log` | watchdog stdout/stderr | launcher redirect | human |
| `daemon/handoffd.pid` | daemon pid | `handoffd` (deleted by shutdown hook, `finally`, and stopper) | `stop_handoff_daemon.bb`, `swarm-cleanup.sh` fallback |
| `daemon/handoffd.log` | `<ISO> started\|delivered <p>\|error <p> <m>\|failed <p> <r>\|failed-to-archive <p> <m>\|stopped` | `handoffd`, process redirect | human |
| `daemon/stop` | empty flag | `stop_handoff_daemon.bb`; deleted at daemon start | `handoffd should-stop?` (checked in loop + every 100 ms sleep slice) |

### Runtime state — per worktree

| Path | Purpose |
|---|---|
| `.worktrees/<name>` on branch `swarmforge-<name>` | isolated checkout; `master`/`none` roles use the main checkout instead |
| `<wt>/swarmforge/scripts/**` | snapshot copy, prepended to the agent's PATH. **Tracked by git and never excluded** — agents doing `git add -A` commit helpers into their role branch |
| `<wt>/.swarmforge/{sessions.tsv,roles.tsv,tmux-socket,tmux-env}` | startup snapshots |
| `<wt>/.swarmforge/handoffs/outbox/{,tmp}` | outbound queue + staging |
| `<wt>/.swarmforge/handoffs/{sent,failed}` | sender audit; `failed/` has `.error` siblings |
| `<wt>/.swarmforge/handoffs/inbox/{new,in_process,completed}` | **the task queue** |
| `<wt>/.swarmforge/handoffs/{sequence,sequence.lock}` | 6-digit counter + mkdir mutex |
| `<wt>/tmp/` | mandated location for agent temp files incl. handoff drafts |

> ⚠️ **Every mailbox path is `(System/getProperty "user.dir") + "/.swarmforge/handoffs"` — the helper's CWD,
> not `roles.tsv`'s `worktree-path`.** `roles.tsv` is used only for identity, recipient validation and
> receive-mode. Run a helper from a subdirectory and it silently creates and reads a *parallel empty mailbox*:
> `swarm_handoff.sh` prints `HANDOFF QUEUED:` for a file the daemon will never see; `ready_for_next.sh` prints
> `NO_TASK` with a full real queue. Nothing enforces "run from the worktree root".

### Environment variables

| Var | Set by | Read by | Meaning |
|---|---|---|---|
| `SWARMFORGE_ROLE` | launcher, in each launch command | `swarm_handoff.bb`, `ready_for_next.bb`, `done_with_current.bb`, `handoff_lib.bb`. **The four task/batch helpers never read it** — they are already dispatched to and locate their mailbox from `user.dir` alone. | **sole agent identity** (sender `from`, receive-mode key). Ambient shell state — an agent can trivially reassign it |
| `SWARMFORGE_TERMINAL` | human | launcher, `close-swarm` | backend override. Aliases: `iterm\|iterm2\|iterm.app`→`iterm2`, `terminal\|terminal-app\|terminal.app`→`terminal-app`, `windows\|windows-terminal\|wt`→`windows-terminal`, `none\|current\|fallback`→`none`; anything else lower-cased verbatim (this is how `ghostty` is reachable) |
| `SWARMFORGE_TERMINAL_BACKEND` | launcher (cleanup trailer), `close-swarm` | `swarm-cleanup.sh` (defaults to `terminal-app`) | internal, already-normalized form |
| `SWARMFORGE_PREVENT_SLEEP` | human | launcher | `0` disables the sleep inhibitor |
| `SWARMFORGE_AGENT_START_DELAY_MS` | human | launcher | inter-agent launch delay; default 1500, non-numeric → 1500 |
| `TERM_PROGRAM` | host terminal | launcher | `iTerm.app` selects `iterm2` when `SWARMFORGE_TERMINAL` is unset |

---

## 8. Replication recipe

### 8.1 Minimal primitives another harness must provide

1. **A role manifest** → N agent instances, each with a name, a backend, a workspace, a receive mode, and —
   beyond what SwarmForge has — a successor edge and a designated entry role.
2. **An isolated, committable workspace per agent** with a named ref other agents can merge from.
3. **A durable ordered queue per agent**, keyed priority → time → tiebreaker, surviving process death.
4. **A validated send operation** with a closed header schema and generated bodies.
5. **Git commit resolution** available to the send path.
6. **Three agent-callable operations**: send, accept-next, complete-current (the last returning the next item).
7. **A prompt-layering mechanism** (shared articles + per-pack overrides + per-role prompt).
8. **One explicit shutdown command.**
9. ⛔ **A defined receive operation.** The receive half of the git handoff **is undefined in the source.**
   Every `git_handoff` body ends with the literal line `merge_and_process <sender> <commit>`
   (`swarm_handoff.bb:267`), and that string exists nowhere in the repo as a script, alias, or shell function
   — only as prose. Without semantics the receive path cannot be written at all: which ref is merged (the bare
   SHA? the sender's `swarmforge-<worktree>` branch?), is the merge committed, what is the conflict policy,
   does it run before or after re-reading the role prompt. **A port MUST define it.** Recommended semantics:
   `git merge --no-ff <commit>` executed in the receiver's workspace, where `<commit>` is reachable because all
   worktrees share one object database; on conflict the agent **stops and reports** rather than resolving.
   Verify against a runnable branch before relying on this.
10. ⛔ **A driver-side scheduler.** tmux notification exists *only* because the orchestrator cannot re-enter a
    stopped agent, and the agent contract says an agent that receives `NO_TASK` stops waiting for work. In
    tmux that agent is a live CLI process a later `send-keys` can revive; in a Python loop over an LLM API a
    stopped agent is a returned function call — there is nothing to poll and no turn boundary to poll at. The
    completion chain (§8.3 #4) covers only the agent-was-busy case; the idle case has **no** replacement.
    Replace notification with an outer loop: *while any inbox has work OR any outbox is undelivered, run the
    delivery step, then for each role whose inbox is non-empty invoke that role for one turn.* `NO_TASK` ends
    the agent **turn**, not the agent. The swarm terminates when a full pass delivers nothing and every inbox
    is empty. **This outer loop, not the completion chain, is the liveness guarantee in a port.**
11. ⛔ **A convergence decision.** Convergence is undocumented. Role branches are cut from the main checkout's
    HEAD **once**, at first launch, and step 15 is skip-if-present so they are never re-based or reset. The
    only merge mechanism is the undefined `merge_and_process` following a chain edge, so state converges only
    where the chain loops back (e.g. `architect → specifier`). **Nothing merges to `master`.** A port must
    decide explicitly whether the swarm's output is a designated role's branch or an explicit final merge step.

### 8.2 Build order

| # | Build | Notes |
|---|---|---|
| 1 | Manifest → role table with workspace + branch per role, **plus successor edge and entry role** | positional roles, first row is the lifecycle owner |
| 2 | Per-role mailbox + the `new → in_process → completed` transitions with the at-most-one invariant and the exit-code taxonomy | refuse, never repair |
| 3 | Validated send: closed schema, generated body, commit canonicalization, priority/time/seq ordering, atomic publish | this is the protocol's whole integrity story |
| 4 | Delivery step: **per-recipient**, idempotent, independently retryable | see §8.4 |
| 5 | `ready_for_next` / `done_with_current` as tools returning the TASK/BATCH/NO_TASK contract, with completion chaining | |
| 6 | Prompt layer: pointer prompt (or resolved-inline), layered constitution, per-role prompt | see §3 for the resolution order |
| 7 | Receive operation (`merge_and_process` semantics), work ingress, outer scheduler loop, one explicit stop command | the four things the source does not define |

**Concurrency is not required.** Agents run concurrently in SwarmForge because tmux makes that free, but the
queue protocol is correct under strict round-robin single-threaded execution, and that is the recommended
port. Note that all worktrees share **one** `.git`: concurrent git operations contend on `index.lock` and ref
updates — a failure mode the tmux original hits occasionally and a tight driver loop hits deterministically.

**Explicitly not needed:** tmux, terminal adapters, the window watchdog, sleep inhibition, base-index probing,
the shell cleanup trailer, PATH injection, the `.sh`/`.bb` wrapper pairing, GitHub-branch bootstrap. Items 1–6
are ~a few hundred lines.

### 8.3 The five decisions that actually make it work

1. **Queue state is file location, and there is no recovery mode.** `new/`→`in_process/`→`completed/` with
   exit-2 on any ambiguity. Rationale: an agent that can repair queue state can corrupt it, so ambiguity
   escalates to a human. Do not add `--force`.
2. **Agents author headers; the system authors bodies.** A closed 6-field schema plus a generated payload keeps
   agent prose out of the protocol and makes every message machine-parseable — and makes the send helper the
   single validation boundary (the daemon deliberately re-validates nothing).
3. **Commits are canonicalized at send time, not trusted.** 10 hex → exactly one object → must be a commit →
   rewritten canonically. This is the only thing preventing a hallucinated SHA from reaching a downstream
   merge. It presumes a shared object store (§6, Isolation).
4. **Completion chains into acceptance.** `done_with_current` execs `ready_for_next` so one agent action yields
   both "done" and "here's the next". This covers the busy agent; it does **not** cover the idle one (§8.1 #10).
5. **The prompt layer is indirection, not concatenation.** The launcher writes two pointer lines; the agent
   resolves the graph relative to its own CWD. This is why every delivered handoff body says
   *"Re-read your role and constitution."* — prompt text stays live rather than frozen at launch. If your
   harness has no file-read tool you must resolve and inline the graph yourself (§3) **and** add an explicit
   re-read step, or that directive silently becomes a no-op.

### 8.4 Defects to fix rather than reproduce

| Defect | Fix in a port |
|---|---|
| **Fan-out is not transactional.** `deliver!` writes+notifies per recipient inline; any throw after recipient 1 sends the *whole* outbox file to `failed/`, so on the exception path the documented "retry without duplicating" is unreachable. It runs only after a **hard kill** that leaves the outbox file in place and lets the next poll retry — the same path on which the unguarded notification (below) re-wakes already-delivered recipients. Worst case is the six-pack terminal broadcast. | per-recipient delivery records with independent retry |
| **Inbox writes are not atomic.** Outbox uses tmp+rename; `handoffd` `spit`s straight into `inbox/new/`. | tmp+rename on both legs |
| **Notification is not guarded by the exists-check.** The guard covers only the `spit`, so a post-kill retry re-wakes already-delivered recipients. | separate delivery from notification |
| `.error` sidecar is written into `outbox/` and orphaned when only the `.handoff` moves to `failed/`. | move both |
| **Sequence lock has no stale-lock timeout or owner record.** A crash between `create-dir` and `finally` wedges every future send in that workspace. Also `mkdir` is not atomic on NFS/SMB. | timeout + owner pid, or a real counter |
| **Mailbox path derived from CWD** (see §7). | pass the workspace explicitly |
| **Multiple `master`/`none` roles share one mailbox**, and the exists-check then drops the second recipient's copy — a config-reachable data-loss path the duplicate-worktree check explicitly permits. | mailbox keyed by role, not workspace |
| `git rev-parse --disambiguate=` exits 0 with empty stdout for a nonexistent-but-valid-hex abbrev, so the ambiguity check passes and the error surfaces later as `resolves to ''`. | check for blank output explicitly |
| **Startup never drains stale queue state**, and the daemon starts *before* agents — a leftover `in_process` item is resumed as if fresh, and a leftover outbox item's wake-up is typed into a shell that is still booting. | drain or explicitly adopt on start; start delivery after agents are ready |
| **Nothing detects an idle or wedged agent.** The watchdog probes *windows*, not agents; "revival" re-attaches a surface to a still-running session. | add real agent health checks — a capability upgrade, not a translation |

---

## 9. Local couplings to replace

| Coupling | Why it exists | Substitute |
|---|---|---|
| **tmux `send-keys` as the agent input channel** (3 sends, 150/50 ms pauses, session-only target so tmux picks the active pane) | the orchestrator has no IPC into a running agent CLI | (a) API loop: drop notification, drive the §8.1 #10 scheduler; (b) subprocess: write stdin; (c) CLI exec mode: one invocation per task — cleanest mapping; (d) platform message API |
| **Compensations for that channel**: generic never-name-the-file wake-ups; "ignore a wake-up mid-task"; "do not send tmux notifications directly" | all three are transport workarounds, not protocol design | **delete** in a driver-owned harness (keep only "agents must not hand-edit inbox files") |
| **tmux sessions as process substrate**; per-project socket keyed by CRC32 of the abs path | detachability — agents survive UI disconnect | process group + pid file, systemd units, compose project, k8s pods; replace CRC32 with a run-id |
| **tmux base-index probing** (throwaway `swarmforge-probe-<pid>` running `sleep 60`) | users' `.tmux.conf` may number from 1 | delete. (The probed *window* index is stored and never used.) |
| **Terminal adapters + `osascript`/`wt.exe`** — ~60% of the shell code | GUI observability on macOS/Windows | implement the `none.sh` shape and drop the layer; use per-agent log files or attach on demand. (Also: `close-swarm` copies `SWARMFORGE_TERMINAL` to `SWARMFORGE_TERMINAL_BACKEND` unnormalized — see the footgun row below — another reason to drop it.) |
| **Window watchdog** (2 s poll, 3-miss reopen, cascade teardown) | a human can close a GUI window | none headless. Keep only the semantic: *closing the designated primary surface = shut down everything; closing any other is non-destructive* |
| **Shell cleanup trailer with zsh `&!`** appended to the index-0 launch command | lifecycle policy encoded as a string concatenated onto an agent's command; delivered via `send-keys` into whatever login shell tmux started | an explicit lifecycle command (SwarmForge already has `close-swarm`) or a signal/atexit handler |
| **The zsh + Babashka + PATH-prepend + executable-bit stack** — `#!/usr/bin/env zsh` on all 18 shell files, `set -euo pipefail` on the 12 executed ones but deliberately **not** on `swarm-terminal-adapter.sh` or any `terminal-adapters/*.sh`, which are `source`d (adding `set -e` there would change caller semantics — the footgun below depends on `load_terminal_backend` *returning* 1 rather than exiting); `${1:l}` lowercasing; `[[ $pid == <-> ]]` glob qualifier; `&!`; paired `.sh`/`.bb` wrappers gated on 29 executable files; the whole scripts tree copied into every worktree | agents invoke bare command names from a login shell | register `send_handoff`/`ready_for_next`/`done_with_current` as typed tools and the entire layer — including the worktree script sync — disappears. Otherwise: `tr '[:upper:]' '[:lower:]'`, `[[ $pid =~ ^[0-9]+$ ]]`, `nohup … & disown` |
| **Per-CLI launch flags** incl. double prompt injection for claude/grok | CLI flag vocabulary + unreliable system-prompt slots | `system` param + a short kickoff message; don't double-inject |
| **Permission posture as CLI flags** (`acceptEdits`, grok escalating to `bypassPermissions`) | CLI vocabulary; worktree isolation is prompt-only | harness auto-approval **scoped to the workspace path** — strictly stronger than what SwarmForge has |
| **`caffeinate` / `systemd-inhibit`** | designed for a laptop running overnight | delete on servers/CI/containers |
| **Git-based project-root discovery** (`--show-toplevel`, then parent of `--git-common-dir`) | worktrees make the toplevel ambiguous | pass the root explicitly |
| **`SWARMFORGE_ROLE` env var as identity** | shell-based agents | bind identity to the agent instance in the driver so a message's `from` cannot be forged |
| **Branch-as-configuration + runtime self-bootstrap** (`./swarm` downloads `main` at run time) | distribution model | versioned templates/package; **never** download at runtime (non-reproducible, offline-hostile) |
| **Forced `git branch -M master`** on fresh repos, coupled to the config keyword `master` | convention | never rename the user's branch; make the "main checkout" keyword symbolic |
| **Polling constants**: 1 s daemon, 2 s watchdog, 1500 ms launch stagger, 150/50 ms notify, 5 s TERM→KILL grace | local IPC | events where available; the stagger is a rate-limiter in disguise → use a semaphore. Keep escalating TERM→KILL. |
| ⚠️ **Live footgun.** `close-swarm` l.71 copies `SWARMFORGE_TERMINAL` into `SWARMFORGE_TERMINAL_BACKEND` verbatim and unnormalized, **but only when `SWARMFORGE_TERMINAL_BACKEND` is itself unset** (an already-set backend wins and the bug does not fire). `swarm-cleanup.sh` then runs under `set -euo pipefail` with `load_terminal_backend` as a bare command that returns 1 for any non-exact adapter filename. So `SWARMFORGE_TERMINAL=iterm close-swarm` — a documented alias — aborts *before* stopping the daemon and *before* killing any session, leaving the swarm fully running. The launcher's own trailer is immune because it embeds the already-normalized backend. | normalize once, at one place |

**Dead or incidental, safe to drop:** `.swarmforge/tmux-env` and `notify/` (written and synced everywhere, read
by nothing); `handoff_lib.bb` (190 lines, gated as required+executable but called by nothing — every helper
reimplements its primitives locally, with divergences); `detect_terminal_backend` in
`swarm-terminal-adapter.sh` (never called; the launcher uses its own Clojure copy); Ghostty auto-detection
(unreachable — only `SWARMFORGE_TERMINAL=ghostty` selects it); ANSI colors and the `SwarmForge v1.0 Starting`
banner; `close-swarm`'s 3-way script-path resolution.

**Not dead:** the six `--test-*` flags are undocumented in the README but **11 deftests in
`test/swarmforge/script_test.clj` drive the launcher exclusively through them** (`--test-parse` ×4,
`--test-launch-command` ×3, plus `--test-terminal-bridge`, `--test-agent-start-delay`,
`--test-sleep-inhibitor-prefix`, `--test-tmux-base-indexes`), so `bb test` fails if they are dropped. They are,
however, **not read-only**: `--test-parse` runs `prepare-workspace!` (overwrites
`roles.tsv`/`sessions.tsv`/`tmux-socket`, creates `.worktrees/` and the `/tmp` socket dir) and
`--test-launch-command` writes a real `.swarmforge/prompts/coder.md`. Neither can render the index-0 cleanup
trailer (`test-launch-command!` passes index **1**), which is why that path is untested.

---

## Unresolved (cannot be answered from `main`)

1. **`./swarm` does not exist here.** Its exact behavior, flags, and the article-staging logic must be read from a runnable branch.
2. **`merge_and_process <sender> <commit>`** is emitted verbatim in every `git_handoff` body (`swarm_handoff.bb:267`), referenced in `handoffs.prompt` l.29 and four times in `swarmforge/handoff-protocol.md` (l.121, 150, 178, 391) — where l.178 glosses it as *"Each recipient merges that commit (`merge_and_process`) and stops"* — but exists nowhere as a script, alias, or function; the tests only assert the literal string appears in the body. The gloss suggests a prose directive to `git merge`, but nothing on `main` makes that binding, and it is the *receiving* half of the entire pipeline contract. **Promoted to a blocker — see §8.1 #9.**
3. **Constitution-article installation has no implementation.** README states it **seven times** — §Branches (l.19), §Getting Started (l.81), §Constitution Structure (l.141, two sentences), and §How It Works steps 2, 3 and 7 (l.162, 163, 167) — yet `grep -rn articles swarmforge/scripts/` returns nothing, and `sync-worktree-scripts!` copies only the script dir plus four state files. The `local-*` override precedence is therefore **[README-only]**, and the practical consequence for a port is in step 20.
4. **`swarmforge/handoff-protocol.md` is titled "Handoff Daemon Proposal"** and written in proposal voice, yet the README cites it as "the full protocol" and its "Implemented Helpers" section describes shipped behavior. Normative vs. historical sections are unmarked.
5. **`close-swarm` is not mentioned in README** (added in `9acd54d`); whether it is user-facing or recovery-only is unclear.
6. `swarm-window-watchdog.bb` accepts `--rewrite-window-id` as a first positional arg, checked *after* positional destructuring; public flag or internal entry point is undocumented.
7. **Per-pack topologies are only *partly* unreadable.** The chains, terminal-broadcast recipients and the batch-mode role list **are** on `main` — `swarmforge/handoff-protocol.md` §Role Receive Mode (l.57-59), §Chain forwarding (l.157-173), §Terminal broadcast (l.175-188), and README §Branches — and that is the source for §4.7. **Not** readable from `main`: the actual `swarmforge.conf` window lines, the role prompt text, and priority conventions.
