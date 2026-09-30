import { AgentSettings } from "@/components/settings/AgentSettings";

export const metadata = { title: "Settings · Gabo" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent } = await searchParams;
  return <AgentSettings initialAgent={agent} />;
}
