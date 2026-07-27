import type { PublicSearchAdapterFactory } from "./types";

const ADAPTER_ID = /^[a-z][a-z0-9-]{0,63}$/;

class ApprovedAdapterFactoryMap implements ReadonlyMap<string, PublicSearchAdapterFactory> {
  readonly #factories: Map<string, PublicSearchAdapterFactory>;

  constructor(factories: Iterable<readonly [string, PublicSearchAdapterFactory]>) {
    this.#factories = new Map(factories);
  }

  get size(): number {
    return this.#factories.size;
  }

  get [Symbol.toStringTag](): string {
    return "ReadonlyMap";
  }

  [Symbol.iterator](): MapIterator<[string, PublicSearchAdapterFactory]> {
    return this.#factories[Symbol.iterator]();
  }

  entries(): MapIterator<[string, PublicSearchAdapterFactory]> {
    return this.#factories.entries();
  }

  keys(): MapIterator<string> {
    return this.#factories.keys();
  }

  values(): MapIterator<PublicSearchAdapterFactory> {
    return this.#factories.values();
  }

  get(key: string): PublicSearchAdapterFactory | undefined {
    return this.#factories.get(key);
  }

  has(key: string): boolean {
    return this.#factories.has(key);
  }

  forEach(
    callbackfn: (value: PublicSearchAdapterFactory, key: string, map: ReadonlyMap<string, PublicSearchAdapterFactory>) => void,
    thisArg?: unknown
  ): void {
    this.#factories.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }
}

export function createApprovedPublicSearchAdapterRegistry(
  factories: readonly PublicSearchAdapterFactory[]
): ReadonlyMap<string, PublicSearchAdapterFactory> {
  if (!factories.length) throw new Error("At least one approved public-search adapter factory is required.");
  const entries: [string, PublicSearchAdapterFactory][] = [];
  const ids = new Set<string>();
  for (const factory of factories) {
    const adapterId = factory.adapterId.trim();
    if (!ADAPTER_ID.test(adapterId)) throw new Error("Public-search adapter ID is invalid.");
    if (adapterId !== factory.adapterId || ids.has(adapterId)) {
      throw new Error(`Duplicate approved public-search adapter ID: ${adapterId}`);
    }
    ids.add(adapterId);
    entries.push([adapterId, factory]);
  }
  return Object.freeze(new ApprovedAdapterFactoryMap(entries));
}

export function selectApprovedPublicSearchAdapterFactory(input: {
  environment: NodeJS.ProcessEnv;
  registry: ReadonlyMap<string, PublicSearchAdapterFactory>;
}): PublicSearchAdapterFactory {
  const adapterId = input.environment.OGC_PUBLIC_SEARCH_ADAPTER?.trim();
  if (!adapterId) throw new Error("OGC_PUBLIC_SEARCH_ADAPTER is not configured.");
  if (!ADAPTER_ID.test(adapterId) || adapterId.includes("/") || adapterId.includes("\\")) {
    throw new Error("The requested public-search adapter is not approved.");
  }
  const factory = input.registry.get(adapterId);
  if (!factory) throw new Error(`The requested public-search adapter is not approved: ${adapterId}`);
  return factory;
}
