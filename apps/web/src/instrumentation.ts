export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { ensureDatabase } = await import("@/db");
  try {
    await ensureDatabase();
  } catch (error) {
    // A failed cold-start database check must not kill the lambda (exit 128);
    // request handlers keep their own error paths.
    console.error("Cold-start database check failed; continuing without it.", error);
  }
}
