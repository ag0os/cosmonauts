# Todo Tool

In-session task tracking for organizing multi-step work within a single agent session.

## Tools

| Tool | Purpose |
|------|---------|
| `todo_write` | Create or update your in-session task list |
| `todo_read` | Read your current session task list |

The todo tool is ephemeral -- it exists only for this session. For persistent cross-agent tasks, use the task system instead.

## When to Use

**Use** when:
- The task requires 3 or more distinct steps.
- Multiple tasks are provided at once.
- Progress tracking is needed for complex work.

**Skip** when:
- Single, straightforward task.
- Fewer than 3 trivial steps.
- Purely conversational or informational.

## State Management

- States: `pending`, `in_progress`, `completed`.
- Mark tasks `in_progress` before beginning work. One task in_progress at a time.
- Mark tasks `completed` immediately after finishing -- do not batch completions.
- Only mark a task completed when fully accomplished. If blocked, keep it in_progress and create a new task describing the blocker.
