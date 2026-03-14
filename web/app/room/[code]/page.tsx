import JamSession from "@/components/JamSession";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <JamSession roomCode={code} />;
}
