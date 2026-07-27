import { NextResponse } from "next/server";
import { confirmBusinessQuestions, getLatestBusinessQuestionSet, prepareBusinessQuestionCandidates } from "@/db/business-questions";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const questions = await getLatestBusinessQuestionSet(id) ?? await prepareBusinessQuestionCandidates({ reportId: id });
    return NextResponse.json(questions, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare business questions.";
    return NextResponse.json({ error: message }, { status: message === "Report not found." ? 404 : 409 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { questionSetId?: unknown; questions?: unknown; acknowledgedLowConfidence?: unknown };
    if (typeof body.questionSetId !== "string" || !Array.isArray(body.questions) || body.questions.length !== 3 ||
        !body.questions.every((question) => typeof question === "string") || typeof body.acknowledgedLowConfidence !== "boolean") {
      return NextResponse.json({ error: "Exactly three questions and an explicit confidence acknowledgement are required." }, { status: 400 });
    }
    const confirmed = await confirmBusinessQuestions({
      reportId: id,
      questionSetId: body.questionSetId,
      finalTexts: body.questions as string[],
      acknowledgedLowConfidence: body.acknowledgedLowConfidence
    });
    return NextResponse.json(confirmed, { headers: { "cache-control": "no-store, private" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to confirm business questions." }, { status: 409 });
  }
}
