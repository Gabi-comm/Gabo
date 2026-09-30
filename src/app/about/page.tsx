import Link from "next/link";
import { Mascot } from "@/components/mascot/Mascot";
import styles from "./about.module.css";

export const metadata = { title: "About · Gabo" };

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Mascot size={96} title="Gabo mascot" />
        <div>
          <h1>About Gabo</h1>
          <p className={styles.lede}>A multi-agent harness for Claude Code: the Claude Code you use in the terminal, in a browser, with a team of role agents around it.</p>
        </div>
      </header>

      <section className={styles.section}>
        <h2>What it is</h2>
        <p>
          Gabo runs the real Claude Code engine (through the Claude Agent SDK) on your own Claude plan, on your own machine. It loads
          everything your CLI loads — plugins, skills, MCP servers, CLAUDE.md — and shares the CLI&apos;s session history, so a chat can
          start in the terminal and continue here, or the other way round.
        </p>
        <p>
          Around that engine sit twelve agents with sharp, opinionated roles, and rooms that pull the right ones for a kind of work. Each agent
          is a pixel dino with its own costume, stage and animation, so you can see who is working at a glance.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Where to go</h2>
        <dl className={styles.places}>
          <dt><Link href="/">Home</Link></dt><dd>A normal Claude Code chat, with the Caveman on call.</dd>
          <dt><Link href="/library">Library</Link></dt><dd>Study and research: Researcher, Tutor, Planner.</dd>
          <dt><Link href="/arena">Arena</Link></dt><dd>Ideas fight it out: the Emperor runs the idea-arena, then Believer, Skeptic, Investor and Judge weigh the winner.</dd>
          <dt><Link href="/hackathon">Hackathon</Link></dt><dd>Build and ship: Planner, Designer, Coder, Tester, Investor.</dd>
          <dt><Link href="/laboratory">Laboratory</Link></dt><dd>You pick the team, including agents you made.</dd>
          <dt><Link href="/agents">Agents</Link></dt><dd>Every agent on its stage; talk to one on its own.</dd>
          <dt><Link href="/plugins">Plugins</Link></dt><dd>Let Claude consult ChatGPT, Gemini, OpenClaw, Hermes or any OpenAI-compatible model.</dd>
          <dt><Link href="/local-llm">Local LLM</Link></dt><dd>Run the agents on a model in Ollama instead of your Claude plan.</dd>
          <dt><Link href="/status">Status</Link></dt><dd>Version, account, connectivity, tools and usage.</dd>
          <dt><Link href="/settings">Settings</Link></dt><dd>Edit agents&apos; prompts and goals, or make your own agent.</dd>
        </dl>
      </section>

      <section className={styles.section}>
        <h2>Principles</h2>
        <ul>
          <li><strong>Your machine, your plan.</strong> It only listens on 127.0.0.1, uses your Claude login, and keeps keys and chats in local files.</li>
          <li><strong>You stay in control.</strong> Edits and commands ask first; agents are locked to the workspace folder; paid calls to other AIs need your approval.</li>
          <li><strong>The CLI, not a copy of it.</strong> Slash commands, permission modes, plan approval, todos, images and @-mentions behave as they do in the terminal.</li>
          <li><strong>The Caveman is always in the room</strong> — so there is always someone to say it in fewer words.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Built with</h2>
        <p className={styles.muted}>
          Next.js (App Router) and React, the Claude Agent SDK, TypeScript, Vitest and Playwright. The arena skill is
          Jakeschincariol/arena-skill; skills come from vercel-labs/agent-skills. The full list of features and commands is in <code>document.md</code>.
        </p>
      </section>
    </div>
  );
}
