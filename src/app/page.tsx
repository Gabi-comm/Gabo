import { RoomConsole } from "@/components/rooms/RoomConsole";

export default async function Home({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return <RoomConsole room="home" conversationId={c} />;
}
