export type CatalogStatus = "draft" | "published";
export type OrderStatus = "new" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed" | "refunded";

export interface CatalogBusiness {
  id: string;
  businessName: string;
  status: string;
}

export interface CatalogSettings {
  id: string;
  clientId: string;
  businessName: string;
  slug: string;
  description: string;
  currency: string;
  status: CatalogStatus;
  accentColor: string;
  whatsappNotificationsEnabled: boolean;
  whatsappConnected: boolean;
  whatsappTemplateName: string;
  whatsappTemplateLanguage: string;
  publicUrl: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  active: boolean;
}

export interface CatalogProduct {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  description: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  stock: number;
  trackInventory: boolean;
  active: boolean;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogSnapshot {
  catalog: CatalogSettings | null;
  categories: CatalogCategory[];
  products: CatalogProduct[];
  businesses: CatalogBusiness[];
  selectedClientId: string | null;
  requiresBusinessSelection: boolean;
}

export interface CatalogOrderItem {
  id: string;
  productId: string | null;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CatalogOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  channel: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
  total: number;
  currency: string;
  whatsappNotificationStatus: string;
  createdAt: string;
  updatedAt: string;
  items: CatalogOrderItem[];
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Nuevo",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Sin pagar",
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
};
