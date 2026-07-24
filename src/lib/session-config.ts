export const SESSION_COOKIE_NAME = "payflow_session";

/**
 * The production application must never start signing sessions with a
 * predictable secret. Development keeps an explicit local-only value so the
 * repository remains easy to run without weakening deployed environments.
 */
export function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return "payflow-local-development-session-secret-not-for-production";
}
