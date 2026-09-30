import { RoomConsole } from "@/components/rooms/RoomConsole";

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  const { c, s } = await searchParams;
  return <RoomConsole room="home" conversationId={c} sessionId={c ? undefined : s} />;
}
