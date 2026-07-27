import type { PublicSearchSurfaceAdapter } from "./types";

const fixtureAdapters = new WeakSet<PublicSearchSurfaceAdapter>();

export function markFixtureAdapter<T extends PublicSearchSurfaceAdapter>(adapter: T): T {
  fixtureAdapters.add(adapter);
  return adapter;
}

export function isFixtureAdapter(adapter: PublicSearchSurfaceAdapter): boolean {
  return fixtureAdapters.has(adapter);
}
