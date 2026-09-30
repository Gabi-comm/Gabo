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
          <p className={styles.lede}>A multi-agent harness for AI: Claude Code, ChatGPT, Gemini, OpenClaw and local Ollama models, in one browser app, with a team of role agents around them.</p>
        </div>
      </header>

      <section className={styles.section}>
        <h2>What it is</h2>
        <p>
          At its core Gabo runs the real Claude Code engine (through the Claude Agent SDK) on your own Claude plan, on your own machine. It
          loads everything your CLI loads — plugins, skills, MCP servers, CLAUDE.md — and shares the CLI&apos;s session history, so a chat can
          start in the terminal and continue here, or the other way round.
        </p>
        <p>
          It isn&apos;t tied to one AI. Connect <strong>ChatGPT (OpenAI)</strong>, <strong>Gemini</strong>, <strong>OpenClaw</strong>,{" "}
          <strong>Hermes</strong> or any OpenAI-compatible model on the <Link href="/plugins">Plugins</Link> page and the agents can consult
          them mid-task — a second opinion, a comparison, a different strength. Or flip <Link href="/local-llm">Switch to Local LLM</Link> and
          every agent runs on an <strong>Ollama</strong> model on your own computer: free, private, and offline.
        </p>
        <p>
          Around those engines sit twelve agents with sharp, opinionated roles — plus any you make yourself — and rooms that pull the right
          ones for a kind of work. Each agent is a pixel dino with its own costume, stage and animation, so you can see who is working at a glance.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Where to go</h2>
        <dl className={styles.places}>
          <dt><Link href="/">Home</Link></dt><dd>A normal Claude Code chat (or your local model), with the Caveman on call.</dd>
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
          <li><strong>Any model, same team.</strong> Claude, the AIs on the Plugins page, or a local Ollama model: the agents, rooms and tools stay the same.</li>
          <li><strong>The CLI, not a copy of it.</strong> Slash commands, permission modes, plan approval, todos, images and @-mentions behave as they do in the terminal.</li>
          <li><strong>The Caveman is always in the room</strong> — so there is always someone to say it in fewer words.</li>
        </ul>
      </section>

    </div>
  );
}
