import type {
  PublicSearchSurface,
  PublicSearchSurfaceAdapter,
  PublicSearchSurfaceAuthority
} from "@open-geo-console/public-search-observer";

export interface PublicSearchAdapterIdentity {
  adapterId: string;
  providerId: string;
  productId: string;
  modelId: string;
  adapterVersion: string;
  surface: PublicSearchSurface;
}

export interface PublicSearchAdapterFactory {
  readonly adapterId: string;
  resolveIdentity(input: {
    environment: NodeJS.ProcessEnv;
    locale: string;
    region: string;
  }): PublicSearchAdapterIdentity;
  create(input: {
    environment: NodeJS.ProcessEnv;
    authority: PublicSearchSurfaceAuthority;
  }): PublicSearchSurfaceAdapter;
}
