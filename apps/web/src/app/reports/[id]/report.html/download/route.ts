import { notFound } from "next/navigation";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server.edge";
import {
  buildStandaloneReportDocument,
  PrivateReportArtifactView,
  reportDownloadDisposition,
  resolvePrivateReportArtifact
} from "../report-scope";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await resolvePrivateReportArtifact(id);
  if (!model) notFound();
  const artifactMarkup = renderToStaticMarkup(createElement(PrivateReportArtifactView, { model }));
  return new Response(buildStandaloneReportDocument(artifactMarkup), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": reportDownloadDisposition(id)
    }
  });
}
