# Gabo — features and commands

Gabo is a local, multi-agent harness for Claude Code. It runs on your Claude Pro/Max login (through the Claude Agent SDK), loads everything your Claude Code CLI loads, and adds a team of role agents and rooms around it.

Start it with `npm run dev`, then open http://127.0.0.1:3217. It only answers on this machine.

---

## Pages (sidebar)

| Page | What it is |
| --- | --- |
| **New** | Starts a fresh chat in the room you're in. During a run it stops that run first. |
| **Home** `/` | A normal Claude Code session. The office scene (Gabo walks in and sits at the desk) sits above the input until you send something. The Caveman is on call for short answers. |
| **Agents** `/agents` | The twelve agents, each on its own themed background (sunrise hill, rainy street, courtroom, code room, cave with a campfire…), plus **your agents**. Click one for a solo chat with it (plus the Caveman). |
| **Workspace ▸ Library** `/library` | Studying and research: Researcher, Tutor, Planner, Caveman. The top-left scene shows the agents at a library table. |
| **Workspace ▸ Arena** `/arena` | Brainstorming and picking the best idea: Emperor (runs the idea-arena with the Idea Rubric), Believer, Skeptic, Investor, Judge, Caveman. The agents spar in an arena. |
| **Workspace ▸ Hackathon** `/hackathon` | Building and shipping: Planner, Designer, Coder, Tester, Investor, Caveman. The agents type at desks. |
| **Workspace ▸ Laboratory** `/laboratory` | **You pick the team.** Tick the agents (built-in and your own) to include; the Caveman is always in. Their mascots load above the prompt box, and the chat runs with exactly that team. "Change team" before the first message; **New** starts over. |
| **Status** `/status` | Claude Code's version (the one Gabo uses and the CLI on your PATH), the Agent SDK version, default model, models, permission mode, your account and plan, connectivity (Claude Code login, the Anthropic API, Anthropic's status page), every MCP server with its status, your plugins, other AIs, the workspace, and Python for the Arena. **Refresh** re-checks. |
| **Plugins** `/plugins` | Connect other AIs (ChatGPT, Gemini, OpenClaw, Hermes, or any OpenAI-compatible server) so Claude can consult them. Also lists your Claude Code plugins and MCP servers with their status. |
| **History** (dropdown) | Your whole Claude Code history, CLI and app sessions from every project, newest first, labelled by folder. It remembers whether it's open. |
| **Settings → Agents** `/settings` | Edit each built-in agent's role prompt and add a goal. Saved to `config/agent-overrides.json`; the text in `docs/spec.md` stays the default, so "Reset to spec" can restore it. |
| **Settings → Add agent** `/settings?tab=new` | Make your own agent: name, one-liner, **mascot** (describe it and press **Generate mascot**, press **Randomize costume**, or pick each part: body colour, hat, face, holding, clothes, back), **system prompt**, **goal**, and **background** (pick one, or **Generate background** from the prompt and goal). A live preview shows it on its stage. Saved to `config/custom-agents.json`. Edit or delete it later from the same tab. |

The **sidebar** hides with the sidebar button or **Ctrl+B** and remembers that. On a phone it's a slide-out drawer.

The **intro** shows once per browser session: Gabo pops in, "GABO" types out, then "A Multi-Agent Harness" appears. Click or press any key to skip it.

---

## Agents

| Agent | Does |
| --- | --- |
| The Believer | Makes the strongest honest case *for* an idea and names the one bet it rests on. |
| The Skeptic | Tries to kill it: who won't pay, the free workaround, the fatal flaw. |
| The Investor | Is there proof people will pay? The cheapest test this week, and the one number that would change its mind. |
| The Judge | Rules last: BUILD, FIX FIRST or KILL, with the biggest risk and a 10-minute test. |
| The Designer | Direction first, one bold move; refuses the default AI look; checks contrast, focus, 320px and the empty, loading and error states. |
| The Coder | Smallest working version first; handles the unhappy paths; says plainly what it couldn't verify. |
| The Tester | Assumes it's broken; reproducible bug reports ranked by harm; the one test to automate. |
| The Researcher | Strong sources first, every claim cited, disagreements shown, a question to test yourself tomorrow. |
| The Tutor | A study plan that fits your time, active recall, hints before answers, three levels of questions. |
| The Caveman | Most said, fewest words. In every room. |
| The Planner | Defines done, orders small steps, riskiest first, one owner per step. |
| The Emperor | Sharpens the challenge, runs the idea-arena (16 agents `--quick`; the full 100 only after you confirm), crowns one idea. |

Every agent follows the **skill rule**: on the first message of a chat it keeps only the skills that fit its role and the task. If a useful skill from vercel-labs/agent-skills isn't installed, a **Skills** card offers **Download / Skip**. Downloads go into the workspace's `.claude/skills/`.

---

## The chat (works like the Claude Code CLI)

### Keys

| Key | Does |
| --- | --- |
| **Enter** | Send. While Claude is working, the message is **queued** and sent when it finishes. |
| **Shift+Enter** | New line. |
| **Esc** | Interrupt the run (and clear the queue). Closes an open menu first. |
| **Shift+Tab** | Cycle the permission mode: ask before edits → accept edits → plan mode → auto. |
| **↑ / ↓** | With a menu open: move through commands or files. Otherwise: recall previous prompts, like a terminal (only from the first line, so multi-line editing still works). |
| **Tab** | Complete the highlighted command or file. |
| **1 / 2 / 3** | Answer a permission prompt or a plan approval. |
| **Ctrl+B** | Show or hide the sidebar. |
| **Ctrl+S** | Save on the Settings page. |

### Status line (under the input)

- **Permission mode**: click it, or press Shift+Tab. It starts where your CLI starts (`permissions.defaultMode` in `~/.claude/settings.json`). Changing it mid-run applies right away.
- **Model**: every model your plan offers (default, opus, sonnet, haiku, …).
- **Effort**: auto, low, medium, high, xhigh, max.
- Also shown: the room, the working folder and the tokens used. Your choices are remembered in this browser.

### Typing `/`

A menu lists **every command**: the app's own plus all of Claude Code's (your plugins, your skills, and built-ins like `/compact`, `/context`, `/init`, `/review`). Use ↑/↓ to scroll it, Enter to run, Tab to complete.

App commands:

| Command | Does |
| --- | --- |
| `/clear` | Start a new chat in this room. |
| `/model [name]` | Show or set the model, e.g. `/model opus`, `/model default`. |
| `/mode [name]` | Show or set the permission mode: `default`, `acceptEdits`, `plan`, `auto`. |
| `/effort [level]` | Show or set the effort: `low` … `max`, or `auto`. |
| `/mcp` | List MCP servers and their status (connected, needs-auth, failed…). |
| `/agents` | The agents this room can pull. |
| `/skills` | The skills each agent kept for this chat. |
| `/cost` | Tokens used in this chat, with the API-equivalent price. It's billed to your plan, not per token. |
| `/cwd [path]` | Show or change the default workspace folder. |
| `/help` | This list and the keys. |

Anything else starting with `/` goes to Claude Code. For example:

| Command | Does |
| --- | --- |
| `/compact` | Summarise the conversation to free up context. |
| `/context` | Show context usage by category. |
| `/init` | Write a CLAUDE.md for the project. |
| `/review` | Review the current changes. |
| `/superpowers:brainstorming`, `/commit-commands:commit`, … | Plugin and skill commands, exactly as in the CLI. |

### Typing `@`

Suggests files from the workspace (skipping node_modules, .git, build folders). Use ↑/↓ to pick and Tab or Enter to insert the path.

### Images

**Paste** a screenshot or **drop** image files onto the input: PNG, JPEG, GIF or WebP, up to 5 per message, about 3.5 MB each. They show as thumbnails you can remove, and Claude sees them with your message.

### What shows in the transcript

- **Tool lines** such as `● Read(src/auth.ts)` with a folded `⎿` result. Edits and new files show a **−/+ diff**.
- **Agent blocks**: when a room's agent works, its mascot, what it's doing, and its own words tagged with its name. The top-left scene animates whoever is working.
- **Permission prompts** for edits, commands and paid tools: **1** Yes · **2** Yes for this chat (the exact command) · **3** No.
- **Questions from Claude**: pick an option, several if allowed, or type **Other**, then **Answer** (or **Skip**).
- **Plan approval** in plan mode: **1** Yes, and auto-accept edits · **2** Yes, and approve edits manually · **3** No, keep planning.
- **Todo list**: Claude's live checklist above the input (☐ to do, ◐ doing, ☒ done).
- **Skills card**: the skills each agent kept, and downloads for missing ones.

---

## History and sessions

- The app and the CLI share the same session files. Chats started in the app show up in the CLI's `/resume`, and your CLI sessions show up in the app's **History**.
- Opening a CLI session shows its transcript and continues **that same session in its own project folder**.
- If you continue a chat in the terminal, the app shows the newer transcript when you reopen it.
- Background helpers (the skill picker and the info check) aren't saved to your history.

---

## Plugins: other AIs

1. Open **Plugins**, switch a provider **On**, and fill in:
   - **Base URL**
   - **Model**
   - **API key**: leave it empty for a local server. Keys are write-only; you only ever see `••••1234` again.
2. **Save**, then **Test connection** (sends "Reply with exactly: OK").
3. In any chat, ask Claude to consult it: "ask Gemini for a second opinion on this". Claude calls `mcp__gabo-ai__ask_<provider>`, and **you approve each call**, because it's billed on that provider.

| Provider | Default endpoint | Notes |
| --- | --- | --- |
| ChatGPT | `https://api.openai.com/v1` | OpenAI API key (separate from a ChatGPT Plus plan). |
| Gemini | `https://generativelanguage.googleapis.com/v1beta` | Key from Google AI Studio. |
| OpenClaw | `http://127.0.0.1:18789/v1` | Your OpenClaw gateway's OpenAI-compatible endpoint. |
| Hermes | `https://openrouter.ai/api/v1` | Nous Research Hermes via OpenRouter, or a local Ollama at `http://127.0.0.1:11434/v1`. |
| Custom | any | Any OpenAI-compatible server (LM Studio, vLLM, Groq, …). |

Plain `http://` is only allowed to this machine, so keys never cross the network unencrypted. The default model names are starting points; set the ones your accounts have.

---

## Safety

- The server listens on 127.0.0.1 only, and every API route rejects other hosts and origins.
- Agents are locked to the workspace folder, or to a history session's own folder. File tools outside it are refused, reads included; a hook also re-checks through junctions and symlinks.
- Writes, edits and state-changing shell commands ask first. Read-only commands run without asking, as in the CLI.
- The Arena can't start more than 16 agents unless you add `--full` and confirm, and never more than 100.
- `bypassPermissions` mode isn't offered.

---

## Your agents

- Made in **Settings → Add agent**. Each gets an id like `x-data-wizard`.
- They work in the **Laboratory** (tick them into the team) and on their own page (`/agents/x-…`). The built-in rooms keep their fixed teams.
- **Generate mascot** and **Generate background** use one quick Haiku call on your plan (not saved to your history). If Claude can't be reached, they match your words instead and say so.
- The mascot borrows the hover animation of the built-in agent holding a similar item (a gavel swings like the Judge's, a sword like the Caveman's club).

## Files you might edit

| File | What |
| --- | --- |
| `docs/spec.md` | The original request, verbatim. Agent role prompts are read from here. |
| `config/agent-overrides.json` | Your prompt and goal edits from Settings. Tracked in git. |
| `config/custom-agents.json` | The agents you made (prompt, goal, costume, background). Tracked in git. |
| `.data/` | Chats, the workspace setting, provider keys, the skills cache. Local only, git-ignored. |
| `vendor/idea-arena/` | The arena skill (Jakeschincariol/arena-skill, pinned). |

## Development

| Command | What |
| --- | --- |
| `npm run dev` | The app on :3217 (uses your Claude plan). |
| `npm run dev:fake` | Scripted runs on :3218 with no Claude usage; its data goes to `.data-fake/`. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:e2e` | Browser tests (Playwright, fake mode). |
| `npm run typecheck` | TypeScript. |

Next.js allows only one dev server per project folder: stop `dev` before starting `dev:fake`.
