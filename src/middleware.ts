import { NextResponse, type NextRequest } from "next/server";

// Без cookie сессии всех, кроме страницы входа, отправляем на /login.
// Полная проверка подписи — на сервере в requireUser().
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("sc_session");
  const open = ["/login", "/setup", "/forgot", "/reset", "/invite", "/api/health"].some((p) => req.nextUrl.pathname.startsWith(p));
  if (!hasSession && !open) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
