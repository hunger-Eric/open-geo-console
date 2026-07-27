import { notFound } from "next/navigation";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { StagingCommerceRunner } from "./staging-commerce-runner";

export const dynamic = "force-dynamic";

export default function StagingCommercePage() {
  try {
    assertProtectedStagingCommercePreview();
  } catch {
    notFound();
  }
  return <StagingCommerceRunner />;
}
