import { NextResponse, type NextRequest } from "next/server";
import { parseAcceptLanguage, pickLocale } from "@streeteats/shared/locale";
import { LOCALE_COOKIE } from "./lib/i18n/locale";

const LOCALES = ["en", "es"];

/**
 * Every page lives under /en or /es. Paths without a locale are redirected
 * to the language the person picked before (cookie) or their browser's.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;

  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale =
    chosen && LOCALES.includes(chosen)
      ? chosen
      : pickLocale(parseAcceptLanguage(request.headers.get("accept-language")));
  request.nextUrl.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip Next internals and files with an extension (favicon, images...).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
