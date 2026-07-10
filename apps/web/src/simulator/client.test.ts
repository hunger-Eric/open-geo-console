import { describe, expect, it, vi } from "vitest";
import { requestSimulatorMatch, requestSimulatorRun, SimulatorClientError } from "./client";

describe("simulator client", () => {
  it("returns a canonical run response", async () => {
    const response = {
      runId: "run-1",
      sourceUrl: "https://example.com",
      generatedAt: "2026-07-10T00:00:00.000Z",
      attempted: [{ id: "a-1", method: "GET", path: "/", userAgent: "GPTBot/1.0" }]
    };
    const fetchImpl = vi.fn(async () => Response.json(response));

    await expect(requestSimulatorRun({ sourceUrl: "https://example.com" }, fetchImpl)).resolves.toEqual(
      response
    );
  });

  it("rejects malformed successful responses", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "legacy-run", attempts: [] }));

    await expect(requestSimulatorRun({ sourceUrl: "https://example.com" }, fetchImpl)).rejects.toEqual(
      expect.objectContaining<Partial<SimulatorClientError>>({ code: "invalid_response" })
    );
  });

  it("accepts the canonical match response", async () => {
    const response = {
      analysis: {},
      comparison: {
        runId: "run-1",
        attemptedCount: 0,
        observedCount: 0,
        signals: { parsedLines: 0, hasUserAgent: false, hasRunMarker: false },
        warnings: [],
        attempts: []
      }
    };
    const fetchImpl = vi.fn(async () => Response.json(response));

    await expect(
      requestSimulatorMatch({ runId: "run-1", attempted: [], logInput: "" }, fetchImpl)
    ).resolves.toEqual(response);
  });
});
