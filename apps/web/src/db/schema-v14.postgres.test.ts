import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import {
  DATABASE_MIGRATIONS,
  V10_DATABASE_MIGRATIONS,
  V11_DATABASE_MIGRATIONS,
  V12_DATABASE_MIGRATIONS,
  V13_DATABASE_MIGRATIONS,
  V14_DATABASE_MIGRATIONS,
  V9_DATABASE_MIGRATIONS
} from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("schema v14 disposable PostgreSQL migration", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const upgradeName = `ogc_v14_upgrade_${suffix}`;
  const bootstrapName = `ogc_v14_bootstrap_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    for (const database of [upgradeName, bootstrapName]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
    }
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("upgrades v13 authorities to an unbound sentinel and bootstraps exact v14 identities", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(upgradeName)}`);
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(bootstrapName)}`);
    const upgrade = postgres(withDatabase(adminUrl!, upgradeName), { max: 1, prepare: false });
    const bootstrap = postgres(withDatabase(adminUrl!, bootstrapName), { max: 1, prepare: false });
    try {
      await executeStatements(upgrade, [
        ...V9_DATABASE_MIGRATIONS,
        ...V10_DATABASE_MIGRATIONS,
        ...V11_DATABASE_MIGRATIONS,
        ...V12_DATABASE_MIGRATIONS,
        ...V13_DATABASE_MIGRATIONS
      ]);
      await upgrade`INSERT INTO public_search_surface_authorities
        (authority_version,surface_id,surface_version,environment,locale_capabilities,region_capabilities,
         terms_reviewed_at,evidence_references,active,captured_at)
        VALUES ('legacy-v13','legacy-surface','v1','staging','["zh-CN"]','["CN"]',now(),'[]',false,now())`;
      await executeStatements(upgrade, V14_DATABASE_MIGRATIONS);
      await executeStatements(bootstrap, DATABASE_MIGRATIONS);

      expect(DATABASE_SCHEMA_VERSION).toBe(14);
      expect(DATABASE_MIGRATIONS).toEqual([
        ...V9_DATABASE_MIGRATIONS,
        ...V10_DATABASE_MIGRATIONS,
        ...V11_DATABASE_MIGRATIONS,
        ...V12_DATABASE_MIGRATIONS,
        ...V13_DATABASE_MIGRATIONS,
        ...V14_DATABASE_MIGRATIONS
      ]);
      await expect(upgrade`SELECT adapter_id,provider_id,product_id,model_id,adapter_version
        FROM public_search_surface_authorities WHERE authority_version='legacy-v13'`)
        .resolves.toEqual([{
          adapter_id: "historical-unbound-v1",
          provider_id: "historical-unbound-v1",
          product_id: "historical-unbound-v1",
          model_id: "historical-unbound-v1",
          adapter_version: "historical-unbound-v1"
        }]);
      await bootstrap`INSERT INTO public_search_surface_authorities
        (authority_version,adapter_id,provider_id,product_id,model_id,adapter_version,surface_id,surface_version,
         environment,locale_capabilities,region_capabilities,terms_reviewed_at,evidence_references,active,captured_at)
        VALUES ('mimo-v14','mimo','xiaomi-mimo','native-web-search','mimo-v2.5-pro','mimo-web-search-adapter-v1',
          'mimo-web-search','v1','staging','["zh-CN"]','["CN"]',now(),'[]',false,now())`;
      await expect(bootstrap`SELECT adapter_id,provider_id,product_id,model_id,adapter_version
        FROM public_search_surface_authorities WHERE authority_version='mimo-v14'`)
        .resolves.toEqual([{
          adapter_id: "mimo",
          provider_id: "xiaomi-mimo",
          product_id: "native-web-search",
          model_id: "mimo-v2.5-pro",
          adapter_version: "mimo-web-search-adapter-v1"
        }]);
      const constraint = await bootstrap<Array<{ definition: string }>>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint WHERE conname='market_search_attempts_status_check'`;
      expect(constraint[0]?.definition).toContain("'authentication'");
      expect(constraint[0]?.definition).toContain("'unsupported'");
    } finally {
      await upgrade.end({ timeout: 5 });
      await bootstrap.end({ timeout: 5 });
    }
  }, 120_000);
});

async function executeStatements(sql: postgres.Sql, statements: readonly string[]): Promise<void> {
  await sql.begin(async (tx) => { for (const statement of statements) await tx.unsafe(statement); });
}
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
