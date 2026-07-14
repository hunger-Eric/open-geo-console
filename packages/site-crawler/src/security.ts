import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlSafetyErrorCode =
  | "invalid-url"
  | "unsupported-protocol"
  | "embedded-credentials"
  | "blocked-hostname"
  | "blocked-address"
  | "dns-resolution-failed"
  | "too-many-redirects"
  | "cross-site-redirect";

export class UrlSafetyError extends Error {
  readonly code: UrlSafetyErrorCode;
  readonly target?: string;

  constructor(code: UrlSafetyErrorCode, message: string, target?: string) {
    super(message);
    this.name = "UrlSafetyError";
    this.code = code;
    this.target = target;
  }
}

export interface ResolvedAddress {
  address: string;
  family?: 4 | 6;
}

export type HostnameResolver = (
  hostname: string,
  signal?: AbortSignal
) => Promise<ReadonlyArray<string | ResolvedAddress>>;

export interface UrlSafetyOptions {
  resolver?: HostnameResolver;
  signal?: AbortSignal;
  allowHosts?: ReadonlySet<string>;
  blockHosts?: ReadonlySet<string>;
  allowBenchmarkNetwork?: boolean;
}

export interface SafeResolvedUrl {
  url: URL;
  addresses: ResolvedAddress[];
}

export interface RedirectValidationOptions extends UrlSafetyOptions {
  maxRedirects?: number;
  allowCrossSite?: boolean;
  getSiteKey?: (url: URL) => string;
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc"
]);

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".svc"];

export const defaultHostnameResolver: HostnameResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

function stripIpv6Brackets(value: string): string {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function ipv4ToNumber(value: string): number | null {
  if (isIP(value) !== 4) return null;
  const parts = value.split(".").map(Number);
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function isIpv4InCidr(value: string, network: string, prefix: number): boolean {
  const address = ipv4ToNumber(value);
  const base = ipv4ToNumber(network);
  if (address === null || base === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function ipv6ToBytes(value: string): number[] | null {
  let address = stripIpv6Brackets(value.toLowerCase());
  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) address = address.slice(0, zoneIndex);
  if (isIP(address) !== 6) return null;

  const doubleColon = address.indexOf("::");
  const left = (doubleColon >= 0 ? address.slice(0, doubleColon) : address)
    .split(":")
    .filter(Boolean);
  const right = (doubleColon >= 0 ? address.slice(doubleColon + 2) : "")
    .split(":")
    .filter(Boolean);

  const expandIpv4 = (groups: string[]): string[] => {
    if (!groups.at(-1)?.includes(".")) return groups;
    const ipv4 = ipv4ToNumber(groups.at(-1)!);
    if (ipv4 === null) return groups;
    return [
      ...groups.slice(0, -1),
      ((ipv4 >>> 16) & 0xffff).toString(16),
      (ipv4 & 0xffff).toString(16)
    ];
  };

  const expandedLeft = expandIpv4(left);
  const expandedRight = expandIpv4(right);
  const missing = 8 - expandedLeft.length - expandedRight.length;
  const groups = [
    ...expandedLeft,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...expandedRight
  ];
  if (groups.length !== 8) return null;

  return groups.flatMap((group) => {
    const number = Number.parseInt(group, 16);
    return [(number >>> 8) & 0xff, number & 0xff];
  });
}

function isIpv6InCidr(value: string, network: string, prefix: number): boolean {
  const address = ipv6ToBytes(value);
  const base = ipv6ToBytes(network);
  if (!address || !base) return false;
  const fullBytes = Math.floor(prefix / 8);
  const remainder = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (address[index] !== base[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return (address[fullBytes]! & mask) === (base[fullBytes]! & mask);
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
];

const BLOCKED_IPV6_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
];

function isBenchmarkIpAddress(value: string): boolean {
  const address = stripIpv6Brackets(value);
  return isIP(address) === 4 && isIpv4InCidr(address, "198.18.0.0", 15);
}

export function isBlockedIpAddress(value: string): boolean {
  const address = stripIpv6Brackets(value);
  if (isIP(address) === 4) {
    return BLOCKED_IPV4_RANGES.some(([network, prefix]) =>
      isIpv4InCidr(address, network, prefix)
    );
  }
  if (isIP(address) !== 6) return true;

  if (isIpv6InCidr(address, "::ffff:0:0", 96)) {
    const bytes = ipv6ToBytes(address)!;
    const mapped = bytes.slice(12).join(".");
    return isBlockedIpAddress(mapped);
  }

  return BLOCKED_IPV6_RANGES.some(([network, prefix]) =>
    isIpv6InCidr(address, network, prefix)
  );
}

export function parseHttpUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.href) : new URL(input);
  } catch {
    throw new UrlSafetyError("invalid-url", "A valid absolute URL is required.", String(input));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError(
      "unsupported-protocol",
      "Only HTTP and HTTPS URLs may be crawled.",
      url.href
    );
  }
  if (url.username || url.password) {
    throw new UrlSafetyError(
      "embedded-credentials",
      "URLs with embedded credentials may not be crawled.",
      url.href
    );
  }
  if (!url.hostname) {
    throw new UrlSafetyError("invalid-url", "The URL must include a hostname.", url.href);
  }
  return url;
}

export function isBlockedHostname(hostname: string, options: UrlSafetyOptions = {}): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase().replace(/\.$/, "");
  if (options.allowHosts?.has(normalized)) return false;
  if (options.blockHosts?.has(normalized)) return true;
  if (BLOCKED_HOSTS.has(normalized)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  if (!normalized.includes(".") && isIP(normalized) === 0) return true;
  return isIP(normalized) > 0 &&
    isBlockedIpAddress(normalized) &&
    !(options.allowBenchmarkNetwork && isBenchmarkIpAddress(normalized));
}

export async function resolveSafeUrl(
  input: string | URL,
  options: UrlSafetyOptions = {}
): Promise<SafeResolvedUrl> {
  options.signal?.throwIfAborted();
  const url = parseHttpUrl(input);
  const hostname = stripIpv6Brackets(url.hostname).toLowerCase().replace(/\.$/, "");
  if (isBlockedHostname(hostname, options)) {
    throw new UrlSafetyError("blocked-hostname", "The target hostname is not publicly routable.", url.href);
  }

  const literalFamily = isIP(hostname);
  let rawAddresses: ReadonlyArray<string | ResolvedAddress>;
  try {
    rawAddresses = literalFamily
      ? [{ address: hostname, family: literalFamily as 4 | 6 }]
      : await waitForResolver((options.resolver ?? defaultHostnameResolver)(hostname, options.signal), options.signal);
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    throw new UrlSafetyError("dns-resolution-failed", "The target hostname could not be resolved.", url.href);
  }
  options.signal?.throwIfAborted();

  const addresses = rawAddresses.map((entry) =>
    typeof entry === "string"
      ? { address: entry, family: isIP(stripIpv6Brackets(entry)) as 4 | 6 }
      : { address: entry.address, family: entry.family ?? (isIP(entry.address) as 4 | 6) }
  );
  if (addresses.length === 0 || addresses.some(({ address }) => isIP(stripIpv6Brackets(address)) === 0)) {
    throw new UrlSafetyError("dns-resolution-failed", "DNS returned no usable IP address.", url.href);
  }
  const blocked = addresses.find(
    ({ address }) =>
      isBlockedIpAddress(address) &&
      !(options.allowBenchmarkNetwork && isBenchmarkIpAddress(address))
  );
  if (blocked) {
    throw new UrlSafetyError(
      "blocked-address",
      `The target resolves to a blocked address (${blocked.address}).`,
      url.href
    );
  }
  return { url, addresses };
}

async function waitForResolver<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function validateRedirectChain(
  initial: string | URL,
  redirects: ReadonlyArray<string | URL>,
  options: RedirectValidationOptions = {}
): Promise<SafeResolvedUrl[]> {
  const maxRedirects = options.maxRedirects ?? 5;
  if (redirects.length > maxRedirects) {
    throw new UrlSafetyError("too-many-redirects", `Redirect limit of ${maxRedirects} exceeded.`);
  }
  const results: SafeResolvedUrl[] = [];
  let current = await resolveSafeUrl(initial, options);
  results.push(current);
  const initialSiteKey = options.getSiteKey?.(current.url);
  for (const location of redirects) {
    const nextUrl = location instanceof URL ? location : new URL(location, current.url);
    const next = await resolveSafeUrl(nextUrl, options);
    if (
      options.allowCrossSite === false &&
      initialSiteKey &&
      options.getSiteKey?.(next.url) !== initialSiteKey
    ) {
      throw new UrlSafetyError(
        "cross-site-redirect",
        "The redirect leaves the original registrable site.",
        next.url.href
      );
    }
    results.push(next);
    current = next;
  }
  return results;
}

export async function validateRedirectTarget(
  current: string | URL,
  location: string,
  options: UrlSafetyOptions = {}
): Promise<SafeResolvedUrl> {
  const currentUrl = parseHttpUrl(current);
  return resolveSafeUrl(new URL(location, currentUrl), options);
}
