# Protected staging commerce endpoint implementation plan

> **For Codex:** Execute this plan inline. Keep all commercial provider credentials inside the Vercel Preview runtime.

**Goal:** Add a Preview-only, protected staging POST endpoint that runs the existing commerce reconciliation, SLA, refund, and email operations with the Preview deployment's existing secrets. Local staging workers remain report-generation only.

**Architecture:** Extract the operation sequence from the CLI script into a shared server module. The CLI retains its staging/database guard; the API route adds a stricter protected-Preview/test-commerce gate and returns only non-sensitive operation counts. Vercel Authentication remains the outer access boundary for the Preview URL.

## Steps

1. Add a typed shared commerce-operation runner and refactor the existing staging CLI to call it; cover its operation selection and sequencing with unit tests.
2. Add a strict protected-staging-Preview policy assertion, then implement a Node.js POST route that runs the fixed `all` sequence and never exposes provider errors or accepts user-selected operations; test the route gates and safe failure response.
3. Run focused tests, lint, and build; sync CodeGraph; update concise project state/task documentation. Deploy only a Vercel Preview, repoint the fixed staging alias, and manually invoke the endpoint only after confirmation because it can submit the pending Sandbox refund and send queued test emails.
