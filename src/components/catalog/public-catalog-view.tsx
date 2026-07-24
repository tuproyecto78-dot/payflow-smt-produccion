"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ImageIcon, Loader2, Minus, Plus, Search, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PublicCatalog {
  catalog: { businessName: string; slug: string; description: string; currency: string; accentColor: string };
  categories: Array<{ id: string; name: string; slug: string; description: string }>;
  products: Array<{ id: string; categoryId: string | null; name: string; slug: string; description: string; sku: string; price: number; compareAtPrice: number | null; currency: string; available: boolean; imageUrl: string }>;
}

interface CreatedOrder { orderNumber: string; total: number; currency: string; whatsappNotificationStatus: string }

export function PublicCatalogView({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [customer, setCustomer] = useState({ customerName: "", customerPhone: "", customerEmail: "", notes: "" });
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/catalogs/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "No se pudo cargar el catálogo.");
        if (!cancelled) setData(payload);
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el catálogo."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  const products = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.products || []).filter((product) =>
      (categoryId === "all" || product.categoryId === categoryId) &&
      (!query || product.name.toLowerCase().includes(query) || product.description.toLowerCase().includes(query))
    );
  }, [categoryId, data?.products, search]);
  const cartLines = useMemo(() => (data?.products || []).filter((product) => cart[product.id]).map((product) => ({ product, quantity: cart[product.id] })), [cart, data?.products]);
  const cartCount = cartLines.reduce((sum, line) => sum + line.quantity, 0);
  const total = cartLines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  function changeQuantity(productId: string, delta: number) {
    setCart((current) => {
      const quantity = Math.max(0, (current[productId] || 0) + delta);
      const next = { ...current };
      if (quantity === 0) delete next[productId]; else next[productId] = quantity;
      return next;
    });
  }

  async function placeOrder() {
    if (customer.customerName.trim().length < 2) return setError("Escribe tu nombre para completar el pedido.");
    setSending(true);
    setError("");
    try {
      requestId.current ||= window.crypto.randomUUID();
      const response = await fetch(`/api/public/catalogs/${encodeURIComponent(slug)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId.current, ...customer, items: cartLines.map((line) => ({ productId: line.product.id, quantity: line.quantity })) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "No se pudo crear el pedido.");
      setCreatedOrder(payload.order);
      requestId.current = null;
      setCart({});
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo crear el pedido."); }
    finally { setSending(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500"><Loader2 className="mr-2 size-5 animate-spin" />Cargando catálogo…</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-md text-center"><Store className="mx-auto mb-3 size-12 text-slate-400" /><h1 className="text-xl font-bold">Catálogo no disponible</h1><p className="mt-2 text-slate-500">{error || "Este enlace no está publicado."}</p></div></div>;

  const accent = data.catalog.accentColor;
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6"><div className="flex min-w-0 items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}><Store className="size-5" /></div><div className="min-w-0"><h1 className="truncate font-bold">{data.catalog.businessName}</h1><p className="truncate text-xs text-slate-500">Catálogo en línea</p></div></div><Button className="relative text-white" style={{ backgroundColor: accent }} onClick={() => setCartOpen(true)}><ShoppingBag className="mr-2 size-4" />Mi pedido{cartCount > 0 && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold" style={{ color: accent }}>{cartCount}</span>}</Button></div></header>

    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><div className="mb-7 max-w-2xl"><h2 className="text-3xl font-bold tracking-tight">{data.catalog.businessName}</h2>{data.catalog.description && <p className="mt-2 text-slate-600">{data.catalog.description}</p>}</div><div className="mb-6 flex flex-col gap-3 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar productos" className="border-slate-200 bg-white pl-9" /></div><div className="flex gap-2 overflow-x-auto pb-1"><CategoryButton active={categoryId === "all"} onClick={() => setCategoryId("all")} accent={accent}>Todos</CategoryButton>{data.categories.map((category) => <CategoryButton key={category.id} active={categoryId === category.id} onClick={() => setCategoryId(category.id)} accent={accent}>{category.name}</CategoryButton>)}</div></div>

      {products.length === 0 ? <div className="rounded-2xl border border-dashed bg-white py-16 text-center"><Search className="mx-auto mb-3 size-9 text-slate-400" /><h3 className="font-semibold">No encontramos productos</h3><p className="mt-1 text-sm text-slate-500">Prueba otra búsqueda o categoría.</p></div> : <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.map((product) => <article key={product.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="aspect-[4/3] bg-slate-100 bg-cover bg-center" style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl).slice(1, -1)})` } : undefined}>{!product.imageUrl && <div className="flex h-full items-center justify-center"><ImageIcon className="size-12 text-slate-300" /></div>}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="font-semibold leading-tight">{product.name}</h3><div className="shrink-0 text-right"><div className="font-bold">{product.price.toFixed(2)}</div><div className="text-[10px] text-slate-500">{product.currency}</div></div></div>{product.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p>}<div className="mt-4">{product.available ? cart[product.id] ? <div className="flex items-center justify-between rounded-lg border border-slate-200"><button className="p-2" onClick={() => changeQuantity(product.id, -1)}><Minus className="size-4" /></button><span className="font-semibold">{cart[product.id]}</span><button className="p-2" onClick={() => changeQuantity(product.id, 1)}><Plus className="size-4" /></button></div> : <Button className="w-full text-white" style={{ backgroundColor: accent }} onClick={() => changeQuantity(product.id, 1)}><Plus className="mr-2 size-4" />Agregar</Button> : <Button className="w-full" variant="secondary" disabled>Agotado</Button>}</div></div></article>)}</div>}
    </main>

    {cartCount > 0 && <button className="fixed bottom-5 right-5 z-20 flex items-center gap-3 rounded-full px-5 py-3 font-semibold text-white shadow-xl sm:hidden" style={{ backgroundColor: accent }} onClick={() => setCartOpen(true)}><ShoppingBag className="size-5" />{cartCount} · {total.toFixed(2)} {data.catalog.currency}</button>}

    <Dialog open={cartOpen} onOpenChange={setCartOpen}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Tu pedido</DialogTitle></DialogHeader>{cartLines.length === 0 ? <div className="py-10 text-center"><ShoppingBag className="mx-auto mb-3 size-10 text-slate-300" /><p className="text-slate-500">Aún no agregaste productos.</p></div> : <div className="space-y-3">{cartLines.map(({ product, quantity }) => <div key={product.id} className="flex items-center gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1"><p className="truncate font-medium">{product.name}</p><p className="text-sm text-slate-500">{quantity} × {product.price.toFixed(2)} {product.currency}</p></div><div className="flex items-center rounded-md border"><button className="p-2" onClick={() => changeQuantity(product.id, -1)}>{quantity === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}</button><span className="px-1 font-semibold">{quantity}</span><button className="p-2" onClick={() => changeQuantity(product.id, 1)}><Plus className="size-4" /></button></div></div>)}<div className="flex justify-between border-t pt-4 text-lg font-bold"><span>Total</span><span>{total.toFixed(2)} {data.catalog.currency}</span></div></div>}<DialogFooter><Button variant="outline" onClick={() => setCartOpen(false)}>Seguir comprando</Button><Button disabled={cartLines.length === 0} className="text-white" style={{ backgroundColor: accent }} onClick={() => setCheckoutOpen(true)}>Continuar</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}><DialogContent><DialogHeader><DialogTitle>Datos para el pedido</DialogTitle></DialogHeader><div className="space-y-4"><Field label="Nombre *"><Input value={customer.customerName} onChange={(event) => setCustomer((current) => ({ ...current, customerName: event.target.value }))} /></Field><Field label="WhatsApp (opcional)"><Input value={customer.customerPhone} onChange={(event) => setCustomer((current) => ({ ...current, customerPhone: event.target.value }))} placeholder="+593…" /><p className="text-xs text-slate-500">Si el negocio activó la API oficial, recibirás una confirmación.</p></Field><Field label="Correo (opcional)"><Input type="email" value={customer.customerEmail} onChange={(event) => setCustomer((current) => ({ ...current, customerEmail: event.target.value }))} /></Field><Field label="Notas (opcional)"><Textarea value={customer.notes} onChange={(event) => setCustomer((current) => ({ ...current, notes: event.target.value }))} rows={3} /></Field>{error && <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"><X className="mt-0.5 size-4 shrink-0" />{error}</div>}</div><DialogFooter><Button variant="outline" onClick={() => setCheckoutOpen(false)}>Atrás</Button><Button className="text-white" style={{ backgroundColor: accent }} disabled={sending} onClick={() => void placeOrder()}>{sending && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmar {total.toFixed(2)} {data.catalog.currency}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(createdOrder)} onOpenChange={(open) => !open && setCreatedOrder(null)}><DialogContent><div className="py-4 text-center"><CheckCircle2 className="mx-auto mb-4 size-14 text-emerald-500" /><DialogTitle>¡Pedido recibido!</DialogTitle><p className="mt-2 text-slate-500">Tu número de pedido es</p><p className="mt-1 text-2xl font-bold">{createdOrder?.orderNumber}</p><p className="mt-3 text-sm text-slate-500">El negocio ya puede verlo y actualizar su estado en PayFlow.</p>{createdOrder?.whatsappNotificationStatus === "sent" && <p className="mt-2 text-sm text-emerald-600">También enviamos la confirmación por WhatsApp.</p>}<Button className="mt-6 text-white" style={{ backgroundColor: accent }} onClick={() => setCreatedOrder(null)}>Seguir viendo el catálogo</Button></div></DialogContent></Dialog>
  </div>;
}

function CategoryButton({ active, onClick, accent, children }: { active: boolean; onClick: () => void; accent: string; children: React.ReactNode }) { return <button className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors", !active && "border-slate-200 bg-white text-slate-600 hover:bg-slate-100")} style={active ? { backgroundColor: accent, borderColor: accent, color: "white" } : undefined} onClick={onClick}>{children}</button>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
