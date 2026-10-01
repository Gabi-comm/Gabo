# Plan: skills and connectors for the Local LLM (2026-10-01)

> **Status: built (2026-10-01).** Phases 1–5 are in the app; Phase 6 is the Readiness card plus the live checks
> recorded at the end. Same day: the Connect pop-up and API-key connections (Claude, OpenAI, Gemini). See
> "What was built" below.

Gab's goal: the Local LLM (Ollama) should use skills and connect to GitHub, Notion, Obsidian and other plugins.
It must work without Claude's connectors.

## Short answer: it's possible

Gabo's local mode still runs **Claude Code**. Only the model changes: `ANTHROPIC_BASE_URL` points at Ollama.
Skills, plugins and plugin MCP servers belong to Claude Code, not to the model, so they keep loading.

### What was measured

Probe on 2026-10-01: `llama3.2` through Gabo's local env, one prompt asking it to list skills and load one.

| What | Result |
| --- | --- |
| Skills loaded | **121** (user skills plus plugin skills) |
| Plugins loaded | 18 (superpowers, github, context7, supabase, canva, …) |
| MCP servers | github **connected**, context7 **connected**, supabase **connected**, canva **connected**, chrome-devtools pending, browser-use failed, figma needs-auth |
| claude.ai connectors (Gmail, Claude Docs, claude.ai Notion) | **absent**. They come from the Claude login. |
| Tools offered to the model | 148 |
| Input tokens the model actually received | **2,050** |
| Answer | Nonsense. No skill was loaded. |

### Why it fails today

1. **Ollama cut off the prompt.** Claude Code's system prompt plus 148 tool schemas and the skill list is about
   30–40k tokens. Ollama's default context window kept only the last 2k, so the model never saw the tools.
2. **The model is too small for tool use.** llama3.2 (3B) rarely makes valid tool calls with this many tools.
3. **Too many tools for any local model.** Even with a big context, 148 tools at 30k+ tokens make every turn slow
   on this laptop (16 GB RAM, RTX 2050 with 4 GB). Small models also pick tools badly when the list is long.
4. **The skill scout uses the Claude plan.** `src/server/skills.ts` runs the scout on Claude Haiku even in local mode,
   so a local run still spends some of the plan, and fails when offline.
5. **claude.ai connectors can't be used** without the Claude login. Notion and Obsidian need local replacements.

## The plan

Goal: a **slim local profile** that fits in a 16–32k context, a model that can call tools, and connectors that
run on this machine.

### Phase 1: Make the model see the whole prompt (blocker)
- On the Local LLM page, a **Prepare model** button calls Ollama `/api/create` to make `<model>-gabo` with
  `num_ctx` set. Suggested: 32768 with this laptop's 16 GB of RAM, 16384 as a fallback. Gabo then uses that tag.
- Show the measured context on the page. **Test** sends the real slim prompt and checks that `usage.input_tokens`
  matches what was sent; if it was cut off, it says so, instead of the model answering nonsense.
- Advice on the page (it can't be set from the app): run Ollama with `OLLAMA_FLASH_ATTENTION=1` and
  `OLLAMA_KV_CACHE_TYPE=q8_0`. That roughly halves the memory the long context uses.

### Phase 2: A model that can call tools
- **Recommend `qwen3:8b`** (about 5 GB, reliable tool calls; runs partly on the GPU and partly in RAM here).
  `qwen3:4b` is the lighter fallback. Mark llama3.2 3B as "chat only, no tools".
- **Tool-call check** in Test: one tiny task that must produce a valid tool call (for example, Read a file). The
  page shows a Tools ✓/✗ badge per model.
- `gpt-oss:20b` and `qwen3-coder:30b` work better but need about 13–18 GB plus the context. That's too heavy for
  16 GB of RAM, so list them as "needs a bigger machine".

### Phase 3: The slim local profile (biggest effect)
When Local LLM is on, `buildOptions` switches to a local profile.

- **Built-in tools:** `tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "Skill", "WebFetch"]` instead of all of them.
- **Skills:** the `skills` option is set to the scout's picks for this task, plus up to 3 Gab pins. That's at most
  about 8 skills, not 121, and they load by name through the Skill tool (progressive disclosure, as on the plan).
- **Connectors:** `strictMcpConfig: true` with `mcpServers` set to only the connectors switched on for local
  (Phase 4). Nothing else loads.
- **Agents:** in Home and solo rooms, the lead works alone. In Library, Arena, Hackathon and Laboratory, at most one
  subagent at a time and no idea-arena tournament (16+ model calls is too slow locally). The room workflow text
  is shortened to its triage rule.
- **Target:** under 12k tokens before Gab's message. Measured by the Phase 1 test.

### Phase 4: Local connectors (no Claude login)
A **Local connectors** section on the Plugins page. Each entry is an MCP server that runs on this machine, with a
switch and a **Test** button.

| Connector | How | Secret |
| --- | --- | --- |
| **GitHub** | The `github` plugin's MCP server already connects in local mode. Offer it as is, limited to its read and search tools plus create-issue and PR tools. | Uses the plugin's existing auth. If that ever needs the Claude login, use the official `github-mcp-server` with a personal access token instead. |
| **Notion** | Official `@notionhq/notion-mcp-server` (stdio, via `npx`). | Notion internal integration token, stored like the Plugins page keys and never shown back. Gab shares the pages with the integration. |
| **Obsidian** | The vault is a folder: add `Documents\Obsidian Vault` as an extra directory, so Read, Write and Grep work on it inside the path guard. Optional: the Obsidian *Local REST API* plugin with an Obsidian MCP server, for search and links. | None for the folder; an API key for the REST plugin. |
| **Context7, Supabase, Canva, …** | Plugin MCP servers that showed **connected** in the probe can be switched on for local too. | Their own auth. |
| **Gmail, Claude Docs** | Not available locally (claude.ai only). Shown greyed out with that reason. | — |

Every connector tool still goes through Gabo's permission prompt. The Ollama address stays limited to localhost,
as it is now.

### Phase 5: Keep local runs local
- **Skill scout without Claude:** in local mode the scout runs on the local model. If that fails or is slow, it
  falls back to a keyword match of the task against skill names and descriptions, with no model call. Then a
  local run never touches the Claude plan.
- The same goes for the other Haiku helpers (`src/server/haiku.ts`: costume and background generation). They use
  the local model when Local LLM is on.

### Phase 6: Prove it works
A `scripts/local-probe` and a **Local readiness** card on Status. Five tasks, each must pass:
1. Load a skill with the Skill tool and follow it.
2. GitHub: search Gab's repositories.
3. Notion: find a page by title.
4. Obsidian: read `Gabo — Hub.md` and append a line to a test note.
5. Edit a file in the workspace, with a permission prompt.

The card also reports prompt tokens (must be under the context window), seconds per turn, and whether any call
went to the Claude plan (must be none).

## What to expect
- **Speed:** a 12k-token prompt on qwen3:8b on this laptop takes roughly 20–60 s before the first word, and
  answers come at a few words per second. Fine for focused tasks, too slow for big multi-agent rooms.
- **Quality:** below Claude. Use local mode for privacy, offline work or saving the plan, and switch back to the
  plan for hard work.

## Order and size
| Phase | Size | Why first |
| --- | --- | --- |
| 1 Context | small | Nothing works until the model sees the prompt |
| 2 Model check | small | Tells you if the model can call tools at all |
| 3 Slim profile | medium | Makes it fit and fast enough |
| 5 Scout local | small | Stops plan usage in local mode |
| 4 Connectors | medium | Notion and Obsidian setup, connector switches |
| 6 Probe | small | Proves each piece |

## What was built

| Plan | In the app |
| --- | --- |
| Phase 1 Context | **Prepare model** (`/api/local-llm/prepare` → Ollama `/api/create` with `num_ctx`); the model's window is shown from `ollama show`. |
| Phase 2 Model | Recommended list sized to this computer's RAM, one-click download; **Test model** must return a tool call. |
| Phase 3 Slim profile | `buildOptions` with `localSlim`: `tools` = Read, Write, Edit, Glob, Grep, Bash, Skill, WebFetch (+ Agent outside Home), `skills` = picked + pinned, `disallowedTools` = MCP servers not ticked, plus a short "small local model" note. |
| Phase 4 Connectors | Local LLM page → **Plugins for Local LLM**: Claude Code plugin servers (GitHub on by default; claude.ai connectors greyed out), Notion (`@notionhq/notion-mcp-server`, token), Obsidian (vault folder added to `additionalDirectories` and the path guard), custom MCP servers (command or URL), pinned skills. Each has **Test** (starts it with the MCP SDK and lists its tools). Notion, Obsidian and custom servers work on every backend. |
| Phase 5 Fully local | Skill scout uses keyword matching when local (`src/harness/skills/keywords.ts`); `askHaiku`, Claude Code info, New Session and the scout all use the active backend's environment. |
| Phase 6 Proof | **Readiness** card (Ollama, model, context ≥16k, tools, test passed, switched on). |

Also built the same day: **Connect** (`src/harness/backend.ts`, `src/server/backend.ts`): Claude API key (native),
OpenAI and Gemini keys through Gabo's own Anthropic↔OpenAI translator (`src/harness/translate.ts`,
`/api/translate/<provider>/v1/messages`, authenticated with a per-start secret).

