import type { PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority } from "./types";
import { parsePublicSearchSurface, parsePublicSearchSurfaceAuthority } from "./validation";
import { isFixtureAdapter } from "./fixture-marker";

export class PublicSearchSurfaceRegistry {
  private readonly adapters = new Map<string, PublicSearchSurfaceAdapter>();

  constructor(private readonly runtime: { runtimeEnvironment: string; deploymentProfile?: string }) {}

  register(adapter: PublicSearchSurfaceAdapter, authority: PublicSearchSurfaceAuthority = adapter.authority): void {
    const surface = parsePublicSearchSurface(adapter.surface);
    authority = parsePublicSearchSurfaceAuthority(authority);
    assertAdapterAuthority(adapter, authority);
    const embeddedAuthority = assertAdapterAuthority(adapter);
    if (JSON.stringify(embeddedAuthority) !== JSON.stringify(authority)) {
      throw new Error("Registered public-search authority must be the adapter's exact embedded authority.");
    }
    if (isFixtureAdapter(adapter) && (this.runtime.runtimeEnvironment === "production" || isProtectedProfile(this.runtime.deploymentProfile))) {
      throw new Error("Fixture public-search adapters are forbidden in protected or production deployments.");
    }
    const expectedAuthorityEnvironment = this.runtime.runtimeEnvironment === "production"
      ? "production" : isProtectedProfile(this.runtime.deploymentProfile) ? "protected_staging" : "test";
    if (authority.environment !== expectedAuthorityEnvironment) {
      throw new Error(`Public-search authority must match the ${expectedAuthorityEnvironment} runtime environment.`);
    }
    if (authority.environment === "production" && this.runtime.runtimeEnvironment !== "production") {
      throw new Error("Production public-search authority cannot be registered outside production.");
    }
    const key = publicSearchSurfaceKey(surface);
    if (this.adapters.has(key)) throw new Error(`Public-search surface is already registered: ${key}`);
    this.adapters.set(key, adapter);
  }

  list(): readonly PublicSearchSurfaceAdapter[] {
    return [...this.adapters.values()];
  }

  get(surfaceKey: string): PublicSearchSurfaceAdapter | undefined {
    return this.adapters.get(surfaceKey);
  }
}

export function publicSearchSurfaceKey(surface: PublicSearchSurfaceAdapter["surface"]): string {
  return [surface.surfaceId, surface.surfaceVersion, surface.contractVersion, surface.adapterVersion, surface.locale, surface.region].join("/");
}

export function assertAdapterAuthority(adapter: PublicSearchSurfaceAdapter, rawAuthority: PublicSearchSurfaceAuthority = adapter.authority): PublicSearchSurfaceAuthority {
  const surface = parsePublicSearchSurface(adapter.surface);
  const authority = parsePublicSearchSurfaceAuthority(rawAuthority);
  if (!authority.active || !Number.isFinite(Date.parse(authority.certifiedAt)) || !authority.evidenceReference.trim()) {
    throw new Error("Public-search adapter requires active, attributable authority.");
  }
  if (JSON.stringify(parsePublicSearchSurface(authority.surface)) !== JSON.stringify(surface) ||
      !authority.supportedLocales.includes(surface.locale) || !authority.supportedRegions.includes(surface.region)) {
    throw new Error("Public-search adapter does not match its exact authority.");
  }
  return authority;
}

function isProtectedProfile(profile: string | undefined): boolean {
  return Boolean(profile && !/^(?:local|test|development)$/i.test(profile));
}
