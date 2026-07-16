"use client";

import { useState } from "react";

type Result = { profile: "staging"; output: Record<string, unknown> } | { error: string };

export function StagingCommerceRunner() {
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);

  async function run(): Promise<void> {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/staging/commerce/run", { method: "POST", cache: "no-store" });
      const payload = await response.json() as Result;
      setResult(response.ok ? payload : { error: "staging_commerce_unavailable" });
    } catch {
      setResult({ error: "staging_commerce_unavailable" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <div className="space-y-2">
        <p className="text-sm font-medium text-amber-700">Protected staging operator</p>
        <h1 className="text-3xl font-semibold tracking-tight">Run commerce settlement</h1>
        <p className="text-sm leading-6 text-zinc-600">
          This runs reconciliation, SLA enforcement, pending Sandbox refunds, and queued test-email delivery using only this Preview deployment&apos;s runtime credentials.
        </p>
      </div>
      <button
        className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={running}
        onClick={() => void run()}
      >
        {running ? "Running…" : "Run staging commerce"}
      </button>
      {result && "error" in result ? <p className="text-sm text-red-700">The staging commerce operation is unavailable. Check the protected deployment logs.</p> : null}
      {result && "output" in result ? (
        <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
