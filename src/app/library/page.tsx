import { RoomConsole } from "@/components/rooms/RoomConsole";

export const metadata = { title: "Library · Gabo" };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return <RoomConsole room="library" conversationId={c} />;
}
