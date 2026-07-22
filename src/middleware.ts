import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecret, SESSION_COOKIE_NAME } from "@/lib/session-config";

const encoder = new TextEncoder();
const ADMIN_ROLES = new Set(["admin", "super_admin"]);
const INTERNAL_ROLES = new Set(["admin", "super_admin", "operator"]);

const ACTIVE_API_PREFIXES = [
  "/api/admin",
  "/api/agent",
  "/api/ai",
  "/api/analytics",
  "/api/appointments",
  "/api/audit-logs",
  "/api/availability",
  "/api/catalog",
  "/api/clickup/connect",
  "/api/commercial-agent",
  "/api/executions",
  "/api/knowledge",
  "/api/payments",
  "/api/payphone",
  "/api/products",
  "/api/projects",
  "/api/services",
  "/api/whatsapp",
  "/api/workflows",
];

const PUBLIC_WEBHOOKS = new Set([
  "/api/clickup/webhook",
  "/api/payments/webhook",
  "/api/payphone/webhook",
  "/api/payphone/NotificacionPago",
  "/api/whatsapp/webhook",
]);

type Claims = { role?: string; status?: string; emailVerified?: boolean };

async function readClaims(request: NextRequest): Promise<Claims | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(getSessionSecret()));
    return payload as Claims;
  } catch {
    return null;
  }
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isOwnSubscriptionApi =
    pathname === "/api/subscriptions" && request.method === "GET";
  const isSubscriptionAdminApi =
    pathname.startsWith("/api/subscriptions") &&
    !(
      pathname === "/api/subscriptions" &&
      (request.method === "GET" || request.method === "POST")
    );
  const isProtectedApi =
    (
      isOwnSubscriptionApi ||
      isSubscriptionAdminApi ||
      ACTIVE_API_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      )
    ) &&
    !PUBLIC_WEBHOOKS.has(pathname);

  if (isDashboard || isProtectedApi) {
    const claims = await readClaims(request);
    if (!claims || claims.emailVerified !== true) {
      if (isProtectedApi) {
        return withSecurityHeaders(
          NextResponse.json(
            { error: "No autenticado.", code: "UNAUTHORIZED" },
            { status: 401 }
          )
        );
      }
      const login = new URL("/login", request.url);
      login.searchParams.set("next", pathname);
      return withSecurityHeaders(NextResponse.redirect(login));
    }

    const role = String(claims.role || "applicant");
    const active = INTERNAL_ROLES.has(role) || claims.status === "active";
    if (!active && !isOwnSubscriptionApi) {
      if (isProtectedApi) {
        return withSecurityHeaders(
          NextResponse.json(
            {
              error: "La suscripción no está activa.",
              code: "SUBSCRIPTION_REQUIRED",
            },
            { status: 403 }
          )
        );
      }
      return withSecurityHeaders(
        NextResponse.redirect(new URL("/cuenta/estado", request.url))
      );
    }

    if (
      (pathname.startsWith("/api/admin") || isSubscriptionAdminApi) &&
      !ADMIN_ROLES.has(role)
    ) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "Se requiere rol de administrador." },
          { status: 403 }
        )
      );
    }
  }

  const response = NextResponse.next({
    request: { headers: request.headers },
  });
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
  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
