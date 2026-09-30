# Plan: Gabo as a full replacement for the Claude Code CLI (2026-09-30)

Goal (Gab): use the app instead of the CLI — all plugins connected, the CLI's session history in the app, and every
CLI feature available.

## Findings (probe of the Agent SDK with CLI-default settings)

- Already connected: every enabled plugin (superpowers, context7, github, supabase, impeccable, figma, canva, …), their MCP
  servers, the claude.ai connectors (Gmail, Claude Docs, Canva, Notion), 200 slash commands, 154 skills.
- Gap: the harness passes `settingSources: ['user','project']`, which drops `.claude/settings.local.json`. CLI default = all.
- Session storage is shared: `listSessions()` / `getSessionMessages()` read the CLI's history, and app runs already appear
  in the CLI's `/resume`. The skill scout's Haiku turns also land there → must run with `persistSession: false`.
- Query controls available per run: interrupt, setModel, setPermissionMode, supportedCommands/Models/Agents,
  mcpServerStatus, toggle/reconnectMcpServer, getContextUsage, rewindFiles, reloadPlugins/Skills, accountInfo.

## Phases (each TDD; e2e via fake mode in the scratch copy)

1. **History** — sidebar "Recents" becomes the unified Claude Code history (CLI + app sessions, newest first, project
   folder shown). Opening a CLI session loads its transcript and resumes it *in its own cwd*; new messages continue the
   same session, so the CLI sees them too. Settings sources = CLI default. Scout = `persistSession: false`.
2. **Session controls** — status line pickers for model, permission mode (Shift+Tab cycles default → acceptEdits → plan
   → auto, like the CLI) and effort; mid-run mode changes go to the live query. Messages typed while a run is going are
   queued and sent next, like the CLI.
3. **Commands** — `/` autocomplete lists every CLI command (plugins, skills, custom) with descriptions from
   `supportedCommands()`; anything not handled by the app is passed through to Claude Code (e.g. `/compact`, `/init`,
   `/review`, `/superpowers:brainstorming`). App built-ins: `/model`, `/mode`, `/mcp`, `/context`, `/resume`, `/cost`,
   `/clear`, `/help`, `/cwd`, `/skills`, `/agents`.
4. **Interactive tools** — AskUserQuestion (choice UI), ExitPlanMode (plan approval), TodoWrite (live checklist),
   Edit/Write (diff view).
5. **Input** — `@file` autocomplete from the workspace, image paste/drop as image blocks.
6. **MCP panel** — `/mcp` lists servers with status, reconnect and enable/disable.

Out of scope for now: terminal-only features (vim mode, `/terminal-setup`, `/config` TUI), IDE integrations.
