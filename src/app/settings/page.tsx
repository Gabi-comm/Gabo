import { SettingsShell } from "@/components/settings/SettingsShell";

export const metadata = { title: "Settings · Gabo" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ agent?: string; tab?: string }> }) {
  const { agent, tab } = await searchParams;
  return <SettingsShell initialTab={tab} initialAgent={agent} />;
}
