import type { RoomId } from "@/harness/rooms";

export function roomHref(room: RoomId, conversationId?: string): string {
  const base = room === "home" ? "/" : room.startsWith("agent:") ? `/agents/${room.slice(6)}` : `/${room}`;
  return conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base;
}
