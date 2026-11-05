import { NextResponse, type NextRequest } from "next/server";

// Без cookie сессии всех, кроме страницы входа, отправляем на /login.
// Полная проверка подписи — на сервере в requireUser().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("sc_session");
  if (!hasSession && !req.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
