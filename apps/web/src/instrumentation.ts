export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { ensureDatabase } = await import("@/db");
  await ensureDatabase();
}
