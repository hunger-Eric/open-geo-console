import { describe, expect, it } from "vitest";
import { assertCertificationCredential, parseCertificationCommand, prepareCertificationPreflight } from "./certify-recommendation-provider";

const args = ["--provider", "openai", "--model", "gpt-pinned", "--locale", "en", "--region", "global", "--site", "https://reserved.example/", "--question", "Which supplier is suitable for this export requirement?", "--output", ".data/recommendation-certification/cert.json"];

describe("recommendation provider certification CLI guards", () => {
  it("requires explicit non-brand surface identity", () => {
    expect(parseCertificationCommand(args)).toMatchObject({ provider: "openai", model: "gpt-pinned", dryFixture: false });
    expect(() => parseCertificationCommand(args.map((item) => item.includes("Which supplier") ? "Is reserved the recommended supplier?" : item))).toThrow("non-brand");
  });

  it("fails before live execution with exact missing credential names", () => {
    const options = parseCertificationCommand(args);
    expect(() => assertCertificationCredential(options, {})).toThrow("OGC_ANSWER_OPENAI_API_KEY, OGC_ANSWER_OPENAI_MODEL");
    expect(() => assertCertificationCredential(options, { OGC_ANSWER_OPENAI_API_KEY: "secret", OGC_ANSWER_OPENAI_MODEL: "drift" })).toThrow("exactly match");
  });

  it("fails signing preflight before the staging marker callback or any provider construction", async () => {
    const options = parseCertificationCommand(args);
    const marker = vi.fn(async () => undefined);
    await expect(prepareCertificationPreflight(options, {
      OGC_ANSWER_OPENAI_API_KEY: "provider-secret",
      OGC_ANSWER_OPENAI_MODEL: "gpt-pinned"
    }, marker)).rejects.toThrow("Missing certification signing variables");
    expect(marker).not.toHaveBeenCalled();
  });

  it("allows dry fixture parsing without credentials but keeps the mode explicit", () => {
    const options = parseCertificationCommand([...args, "--dry-fixture"]);
    expect(options.dryFixture).toBe(true);
    expect(() => assertCertificationCredential(options, {})).not.toThrow();
  });

  it("keeps artifacts in the ignored private directory and dry fixtures on reserved domains", () => {
    expect(() => parseCertificationCommand(args.map((item) => item.includes(".data/recommendation") ? "tracked/cert.json" : item))).toThrow(".data/recommendation-certification");
    const liveSite = args.map((item) => item === "https://reserved.example/" ? "https://public-company.com/" : item);
    expect(() => parseCertificationCommand([...liveSite, "--dry-fixture"])).toThrow("reserved");
    expect(() => parseCertificationCommand(args.map((item) => item.includes("cert.json") ? ".data/recommendation-certification/nested/cert.json" : item))).toThrow("direct files");
  });
});
