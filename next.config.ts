import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Agent SDK spawns the local `claude` CLI; keep it out of the server bundle.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
