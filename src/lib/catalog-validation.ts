import { z } from "zod";

const optionalUrl = z.union([
  z.literal(""),
  z.string().url().max(2000).refine((value) => value.startsWith("https://") || value.startsWith("http://"), "La imagen debe usar http o https."),
]).default("");

export const catalogSettingsSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(600).default(""),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  status: z.enum(["draft", "published"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  whatsappNotificationsEnabled: z.boolean().default(false),
  whatsappTemplateName: z.string().trim().max(512).regex(/^[a-z0-9_]*$/, "La plantilla sólo admite minúsculas, números y guion bajo.").default(""),
  whatsappTemplateLanguage: z.string().trim().min(2).max(10).regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/).default("es"),
}).superRefine((value, ctx) => {
  if (value.whatsappNotificationsEnabled && !value.whatsappTemplateName) {
    ctx.addIssue({ code: "custom", path: ["whatsappTemplateName"], message: "Indica la plantilla aprobada por Meta." });
  }
});

export const catalogCategorySchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(""),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});

export const catalogCategoryPatchSchema = catalogCategorySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "No hay campos para actualizar."
);

export const catalogProductSchema = z.object({
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).default(null),
  name: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1200).default(""),
  sku: z.string().trim().max(100).default(""),
  price: z.number().min(0).max(9999999999),
  compareAtPrice: z.union([z.number().min(0).max(9999999999), z.null()]).default(null),
  stock: z.number().int().min(0).max(100000000).default(0),
  trackInventory: z.boolean().default(true),
  active: z.boolean().default(true),
  imageUrl: optionalUrl,
}).superRefine((value, ctx) => {
  if (value.compareAtPrice != null && value.compareAtPrice < value.price) {
    ctx.addIssue({ code: "custom", path: ["compareAtPrice"], message: "El precio anterior debe ser mayor o igual al precio actual." });
  }
});

export const catalogProductPatchSchema = z.object({
  categoryId: z.union([z.string().uuid(), z.literal(""), z.null()]).optional(),
  name: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(1200).optional(),
  sku: z.string().trim().max(100).optional(),
  price: z.number().min(0).max(9999999999).optional(),
  compareAtPrice: z.union([z.number().min(0).max(9999999999), z.null()]).optional(),
  stock: z.number().int().min(0).max(100000000).optional(),
  trackInventory: z.boolean().optional(),
  active: z.boolean().optional(),
  imageUrl: optionalUrl.optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay campos para actualizar.");

export const publicOrderSchema = z.object({
  requestId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.string().trim().max(40).default(""),
  customerEmail: z.union([z.literal(""), z.string().email().max(254)]).default(""),
  notes: z.string().trim().max(1000).default(""),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(99),
  })).min(1).max(50),
}).superRefine((value, ctx) => {
  const productIds = value.items.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "Un mismo producto no puede aparecer dos veces." });
  }
});

export const orderStatusPatchSchema = z.object({
  status: z.enum(["new", "confirmed", "preparing", "ready", "completed", "cancelled"]).optional(),
  paymentStatus: z.enum(["unpaid", "pending", "paid", "failed", "refunded"]).optional(),
}).refine((value) => value.status !== undefined || value.paymentStatus !== undefined, "No hay campos para actualizar.");

export function firstValidationError(error: z.ZodError) {
  return error.issues[0]?.message || "Revisa los datos enviados.";
}
