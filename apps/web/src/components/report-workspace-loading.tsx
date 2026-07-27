export function ReportWorkspaceLoading() {
  return (
    <main className="report-page mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8" aria-busy="true">
      <div className="motion-safe:animate-pulse">
        <section className="workspace-context">
          <div className="w-full">
            <div className="h-4 w-40 rounded bg-[var(--subtle)]" />
            <div className="mt-4 h-9 w-96 max-w-full rounded bg-[var(--subtle)]" />
            <div className="mt-4 h-4 w-72 max-w-full rounded bg-[var(--subtle)]" />
          </div>
        </section>
        <div className="mt-6 h-12 rounded-lg bg-[var(--subtle)]" />
        <section className="workspace-surface mt-6 p-6 sm:p-8">
          <div className="h-5 w-48 rounded bg-[var(--subtle)]" />
          <div className="mt-4 h-4 w-3/4 rounded bg-[var(--subtle)]" />
          <div className="mt-6 h-2 rounded-full bg-[var(--subtle)]" />
        </section>
      </div>
    </main>
  );
}
