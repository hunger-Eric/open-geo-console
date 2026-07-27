import { NextResponse, type NextRequest } from "next/server";
import {
  getLocaleFromPathname,
  getLocaleRoutingAction,
  INTERFACE_LOCALE_HEADER,
  type Locale
} from "@/i18n";

function withInterfaceLocale(request: NextRequest, locale: Locale) {
  const headers = new Headers(request.headers);
  headers.set(INTERFACE_LOCALE_HEADER, locale);
  return headers;
}

export function proxy(request: NextRequest) {
  const action = getLocaleRoutingAction(request.nextUrl.pathname);

  if (action.kind === "redirect") {
    const destination = request.nextUrl.clone();
    destination.pathname = action.pathname;
    return NextResponse.redirect(destination, 308);
  }

  if (action.kind === "rewrite") {
    const destination = request.nextUrl.clone();
    destination.pathname = action.pathname === "/"
      ? `/${action.locale}`
      : `/${action.locale}${action.pathname}`;
    return NextResponse.rewrite(destination, {
      request: { headers: withInterfaceLocale(request, action.locale) }
    });
  }

  const locale = getLocaleFromPathname(request.nextUrl.pathname);
  if (locale) {
    return NextResponse.next({ request: { headers: withInterfaceLocale(request, locale) } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*"
};
