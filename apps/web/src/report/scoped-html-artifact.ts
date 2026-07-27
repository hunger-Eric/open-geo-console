import "server-only";
import type { ReportArtifactScope } from "@/db/schema";
import { tokenGrantsReportAccess } from "@/server/report-access";
import { loadPrivateReportArtifact, type PrivateReportArtifactModel } from "./artifact-model";

export async function loadAuthorizedScopedHtmlArtifact(input: {
  token: string | undefined;
  reportId: string;
  artifactScope: ReportArtifactScope;
}): Promise<PrivateReportArtifactModel | null> {
  if (!await tokenGrantsReportAccess(input.token, input.reportId, input.artifactScope)) return null;
  const model = await loadPrivateReportArtifact(input.reportId, input.artifactScope);
  return model?.productContract === input.artifactScope ? model : null;
}
