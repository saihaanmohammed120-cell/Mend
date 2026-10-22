import { notFound } from "next/navigation";
import { Workbench } from "@/components/workbench";
export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) notFound();
  return <Workbench view="workspace" initialTaskId={id} />;
}
