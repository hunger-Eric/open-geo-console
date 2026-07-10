import { redirect } from "next/navigation";

export default async function UnlocalizedReportSectionPage({
  params
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section } = await params;
  redirect(`/en/reports/${id}/${section}`);
}
