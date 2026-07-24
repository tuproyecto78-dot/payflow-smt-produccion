"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  History,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Workflow,
} from "lucide-react";

interface ClientDetail {
  client: {
    id: string;
    businessName: string;
    businessType: string;
    ownerEmail: string;
    ownerPhone: string;
    status: string;
    paymentProvider: string;
    planCode: string;
    isDemo: boolean;
    createdAt: string;
  };
  catalog: { id: string; status: string; slug: string; description: string; currency: string } | null;
  products: Array<{
    id: string;
    name: string;
    description: string;
    sku: string;
    price: number;
    currency: string;
    stock: number;
    trackInventory: boolean;
    active: boolean;
    updatedAt: string;
  }>;
  promotions: string;
  history: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

const ACTION_LABELS: Record<string, string> = {
  onboarding_completed: "Onboarding completado",
  workflow_created: "Flujo creado",
  client_profile_updated: "Datos del cliente actualizados",
  catalog_product_created: "Producto agregado",
  catalog_product_updated: "Producto actualizado",
  catalog_product_deleted: "Producto eliminado",
  catalog_promotions_updated: "Promociones actualizadas",
  catalog_published: "Catálogo publicado",
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPromotions, setSavingPromotions] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState({
    businessName: "",
    businessType: "",
    ownerPhone: "",
    paymentProvider: "none",
  });
  const [promotions, setPromotions] = useState("");
  const [product, setProduct] = useState({
    name: "",
    description: "",
    sku: "",
    price: "",
    stock: "0",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(id)}/detail`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar el cliente.");
      setData(payload);
      setProfile({
        businessName: payload.client.businessName || "",
        businessType: payload.client.businessType || "",
        ownerPhone: payload.client.ownerPhone || "",
        paymentProvider: payload.client.paymentProvider || "none",
      });
      setPromotions(payload.promotions || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el cliente.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(id)}/detail`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo actualizar el cliente.");
      toast.success("Datos del cliente actualizados.");
      await load();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePromotions() {
    setSavingPromotions(true);
    try {
      const response = await fetch(`/api/admin/clients/${encodeURIComponent(id)}/promotions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotions }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudieron guardar las promociones.");
      toast.success("Promociones actualizadas. La IA usará la versión más reciente.");
      await load();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setSavingPromotions(false);
    }
  }

  async function addProduct() {
    if (!product.name.trim()) {
      toast.error("Escribe el nombre del producto.");
      return;
    }
    const price = Number(product.price);
    const stock = Number(product.stock);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("El precio no es válido.");
      return;
    }
    setAddingProduct(true);
    try {
      const response = await fetch(`/api/catalog/products?clientId=${encodeURIComponent(id)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          sku: product.sku,
          price,
          compareAtPrice: null,
          stock: Number.isFinite(stock) && stock >= 0 ? Math.trunc(stock) : 0,
          trackInventory: true,
          active: true,
          imageUrl: "",
          categoryId: "",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo agregar el producto.");
      setProduct({ name: "", description: "", sku: "", price: "", stock: "0" });
      toast.success("Producto agregado al catálogo.");
      await load();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "No se pudo agregar el producto.");
    } finally {
      setAddingProduct(false);
    }
  }

  if (loading) {
    return <div className="p-10 flex justify-center text-muted-foreground"><Loader2 className="size-6 mr-2 animate-spin" /> Cargando cliente…</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto p-6 lg:p-10">
        <Button asChild variant="ghost" className="mb-5"><Link href="/dashboard/clientes"><ArrowLeft className="size-4 mr-2" />Volver</Link></Button>
        <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-500/10 p-5">{error || "Cliente no encontrado."}</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="icon"><Link href="/dashboard/clientes"><ArrowLeft className="size-4" /></Link></Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl lg:text-3xl font-bold">{data.client.businessName}</h1>
              {data.client.isDemo && <Badge variant="secondary">Demo</Badge>}
              <Badge className="bg-emerald-500/15 text-emerald-700">Activo</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Creado {formatDate(data.client.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load()}><RefreshCw className="size-4 mr-2" />Actualizar</Button>
          <Button asChild variant="outline"><Link href={`/dashboard/catalogo?clientId=${encodeURIComponent(id)}`}><Package className="size-4 mr-2" />Abrir catálogo</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/flujos"><Workflow className="size-4 mr-2" />Ver flujos</Link></Button>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <section className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2"><Building2 className="size-5 text-purple-600" /><h2 className="font-semibold">Datos del negocio</h2></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Nombre</Label><Input value={profile.businessName} onChange={(event) => setProfile((current) => ({ ...current, businessName: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Tipo de negocio</Label><Input value={profile.businessType} onChange={(event) => setProfile((current) => ({ ...current, businessType: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={profile.ownerPhone} onChange={(event) => setProfile((current) => ({ ...current, ownerPhone: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Medio de pago</Label><Select value={profile.paymentProvider} onValueChange={(value) => setProfile((current) => ({ ...current, paymentProvider: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin pagos en línea</SelectItem><SelectItem value="payphone">PayPhone</SelectItem><SelectItem value="external">Enlace propio</SelectItem><SelectItem value="transfer">Transferencia</SelectItem></SelectContent></Select></div>
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}Guardar cambios</Button>
        </section>

        <section className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Package className="size-5 text-amber-600" /><h2 className="font-semibold">Agregar producto</h2></div><Badge variant="secondary">{data.products.length} productos</Badge></div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2"><Label>Nombre</Label><Input value={product.name} onChange={(event) => setProduct((current) => ({ ...current, name: event.target.value }))} placeholder="Ej. Hamburguesa especial" /></div>
            <div className="space-y-1.5"><Label>Precio</Label><Input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setProduct((current) => ({ ...current, price: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Stock</Label><Input type="number" min="0" value={product.stock} onChange={(event) => setProduct((current) => ({ ...current, stock: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>SKU opcional</Label><Input value={product.sku} onChange={(event) => setProduct((current) => ({ ...current, sku: event.target.value }))} /></div>
            <div className="space-y-1.5"><Label>Descripción</Label><Input value={product.description} onChange={(event) => setProduct((current) => ({ ...current, description: event.target.value }))} /></div>
          </div>
          <Button onClick={addProduct} disabled={addingProduct}>{addingProduct ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}Agregar al catálogo</Button>
        </section>
      </div>

      <section className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-emerald-600" /><h2 className="font-semibold">Promociones vigentes</h2></div>
        <p className="text-sm text-muted-foreground">Puedes reemplazar promociones semanales o crear una promoción especial sin rehacer el flujo.</p>
        <Textarea value={promotions} onChange={(event) => setPromotions(event.target.value)} rows={6} placeholder="Ej. Sábado de fútbol: 2x1 en bebidas de 16h00 a 20h00." />
        <Button onClick={savePromotions} disabled={savingPromotions}>{savingPromotions ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}Guardar promociones</Button>
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="p-5 border-b flex items-center gap-2"><History className="size-5 text-sky-600" /><h2 className="font-semibold">Historial del cliente</h2></div>
        <div className="divide-y">
          {data.history.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Todavía no hay eventos registrados.</p> : data.history.map((entry) => (
            <div key={entry.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <Badge variant="outline" className="w-fit">{ACTION_LABELS[entry.action] || entry.action}</Badge>
              <p className="text-sm flex-1">{typeof entry.metadata.business_name === "string" ? entry.metadata.business_name : entry.entityType || "Cliente"}</p>
              <time className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
