import { notFound } from "next/navigation";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { StagingCommerceRunner } from "../../staging-commerce/staging-commerce-runner";

export const dynamic = "force-dynamic";

export default function LocalizedStagingCommercePage() {
  try {
    assertProtectedStagingCommercePreview();
  } catch {
    notFound();
  }
  return <StagingCommerceRunner />;
}
