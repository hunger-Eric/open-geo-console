import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDatabasePath } from "./index";

describe("database path selection", () => {
  const originalOpenGeoDbPath = process.env.OPEN_GEO_DB_PATH;
  const originalVercel = process.env.VERCEL;
  const originalLambdaName = process.env.AWS_LAMBDA_FUNCTION_NAME;

  afterEach(() => {
    process.env.OPEN_GEO_DB_PATH = originalOpenGeoDbPath;
    process.env.VERCEL = originalVercel;
    process.env.AWS_LAMBDA_FUNCTION_NAME = originalLambdaName;
  });

  it("uses an explicit database path when configured", () => {
    process.env.OPEN_GEO_DB_PATH = join(tmpdir(), "custom-open-geo.sqlite");
    process.env.VERCEL = "1";

    expect(getDatabasePath()).toBe(process.env.OPEN_GEO_DB_PATH);
  });

  it("uses the writable temp directory in serverless runtimes", () => {
    delete process.env.OPEN_GEO_DB_PATH;
    process.env.VERCEL = "1";

    expect(getDatabasePath()).toBe(join(tmpdir(), "open-geo-console.sqlite"));
  });
});
