import { LaboratoryConsole } from "@/components/rooms/LaboratoryConsole";

export const metadata = { title: "Laboratory · Gabo" };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return <LaboratoryConsole conversationId={c} />;
}
