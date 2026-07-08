import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware simple que solo agrega headers de seguridad + cache-busting.
 * NO procesa sesión de Supabase (eso se hace en los API routes).
 * NO bloquea ninguna ruta.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Headers de seguridad básicos
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // Cache-busting: ensure the browser always fetches the latest HTML for
  // dashboard pages and API routes (prevents stale error messages).
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/api/") ||
    pathname === "/" ||
    pathname === "/login"
  ) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
