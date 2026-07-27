import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("public-search probe command configuration", () => {
  it("loads the merged environment used by the protected staging workers", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as {scripts: Record<string, string>};

    expect(packageJson.scripts["public-search:probe"]).toContain(
      "--env-file=../../.data/workstation-docker/staging.env"
    );
    expect(packageJson.scripts["public-search:probe"]).not.toContain(".env.local");
  });
});
