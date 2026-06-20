// Capa de seguridad para PayFlow SMT.
export function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").replace(/on\w+\s*=/gi, "").trim().slice(0, 2000);
}
export function sanitizeName(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/[^a-zA-ZáéíóúñüÁÉÍÓÚÑÜ\s]/g, "").trim().slice(0, 100);
}
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_RE = /^\+?[\d\s-]{7,15}$/;
const COUNTRY_CODE_RE = /^\d{1,4}$/;
const DOCUMENT_RE = /^[a-zA-Z0-9-]{5,20}$/;
const ALLOWED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "BRL", "JPY", "MXN", "COP", "ARS"];
const ALLOWED_PROVIDERS = ["Mock", "PayPhone", "DEUNA", "Stripe", "API personalizada"];

export function isValidEmail(email: unknown): boolean { return typeof email === "string" && EMAIL_RE.test(email.trim()) && email.length <= 254; }
export function isValidPhone(phone: unknown): boolean { return typeof phone === "string" && PHONE_RE.test(phone.trim()); }
export function isValidCountryCode(code: unknown): boolean { return typeof code === "string" && COUNTRY_CODE_RE.test(code.trim()); }
export function isValidDocument(doc: unknown): boolean { return typeof doc === "string" && DOCUMENT_RE.test(doc.trim()); }
export function isValidAmount(amount: unknown): boolean { return typeof amount === "number" && !isNaN(amount) && amount > 0 && amount <= 1000000; }
export function isValidCurrency(currency: unknown): boolean { return typeof currency === "string" && ALLOWED_CURRENCIES.includes(currency.toUpperCase()); }
export function isValidProvider(provider: unknown): boolean { return typeof provider === "string" && ALLOWED_PROVIDERS.includes(provider); }
export function isValidOrderId(orderId: unknown): boolean { return typeof orderId === "string" && /^[a-zA-Z0-9_{{}}\s-]{1,100}$/.test(orderId); }
export function isValidCuid(id: unknown): boolean { return typeof id === "string" && /^[a-z0-9]{20,30}$/i.test(id); }

export function maskDocument(doc: unknown): string {
  if (typeof doc !== "string" || doc.length < 4) return "****";
  return "*".repeat(Math.max(doc.length - 4, 4)) + doc.slice(-4);
}
export function maskPhone(phone: unknown): string {
  if (typeof phone !== "string" || phone.length < 4) return "****";
  return "*".repeat(Math.max(phone.length - 4, 4)) + phone.slice(-4);
}

interface RateBucket { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateBucket>();
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return true; }
  bucket.count++;
  return bucket.count <= maxRequests;
}
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
export function getUserAgent(req: Request): string { return req.headers.get("user-agent") || "unknown"; }

export const GENERIC_ERROR = "Error en la operación.";
export const UNAUTHORIZED_ERROR = "No autorizado.";
export const RATE_LIMIT_ERROR = "Demasiadas solicitudes. Intenta más tarde.";
export const VALIDATION_ERROR = "Datos inválidos.";
