"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  ImageIcon,
  Layers3,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { CatalogCategory, CatalogProduct, CatalogSnapshot } from "@/lib/catalog-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  sku: "",
  categoryId: "",
  price: 0,
  compareAtPrice: "",
  stock: 0,
  trackInventory: true,
  active: true,
  imageUrl: "",
};

type ProductForm = typeof EMPTY_PRODUCT;

function withClient(path: string, clientId: string | null) {
  if (!clientId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}clientId=${encodeURIComponent(clientId)}`;
}

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la operación.");
  return data;
}

export function CatalogAdminView() {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<CatalogProduct | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_PRODUCT);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "", active: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (clientId?: string | null) => {
    setLoading(true);
    try {
      const saved = clientId === undefined ? window.localStorage.getItem("payflow:catalog-client") : clientId;
      let data = await responseJson(await fetch(withClient("/api/catalog", saved || null), { credentials: "include" })) as CatalogSnapshot;
      if (!data.selectedClientId && data.businesses.length === 1) {
        const onlyClientId = data.businesses[0].id;
        window.localStorage.setItem("payflow:catalog-client", onlyClientId);
        data = await responseJson(await fetch(withClient("/api/catalog", onlyClientId), { credentials: "include" })) as CatalogSnapshot;
      }
      setSnapshot(data);
      if (data.selectedClientId) {
        setSelectedClientId(data.selectedClientId);
        window.localStorage.setItem("payflow:catalog-client", data.selectedClientId);
      } else {
        setSelectedClientId(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const catalog = snapshot?.catalog;
  const products = snapshot?.products || [];
  const categories = snapshot?.categories || [];
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query)
    );
  }, [products, search]);
  const activeCount = products.filter((product) => product.active).length;
  const lowStockCount = products.filter((product) => product.active && product.trackInventory && product.stock <= 3).length;

  function selectBusiness(clientId: string) {
    setSelectedClientId(clientId);
    window.localStorage.setItem("payflow:catalog-client", clientId);
    void load(clientId);
  }

  function openNewProduct() {
    setEditingProduct(null);
    setProductForm({ ...EMPTY_PRODUCT });
    setProductOpen(true);
  }

  function openEditProduct(product: CatalogProduct) {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description,
      sku: product.sku,
      categoryId: product.categoryId || "",
      price: product.price,
      compareAtPrice: product.compareAtPrice == null ? "" : String(product.compareAtPrice),
      stock: product.stock,
      trackInventory: product.trackInventory,
      active: product.active,
      imageUrl: product.imageUrl,
    });
    setProductOpen(true);
  }

  async function saveProduct() {
    if (!productForm.name.trim()) return toast.error("Escribe el nombre del producto.");
    setSaving(true);
    try {
      const endpoint = editingProduct ? `/api/catalog/products/${editingProduct.id}` : "/api/catalog/products";
      await responseJson(await fetch(withClient(endpoint, selectedClientId), {
        method: editingProduct ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...productForm,
          categoryId: productForm.categoryId || null,
          compareAtPrice: productForm.compareAtPrice === "" ? null : Number(productForm.compareAtPrice),
          price: Number(productForm.price),
          stock: Number(productForm.stock),
        }),
      }));
      toast.success(editingProduct ? "Producto actualizado." : "Producto creado.");
      setProductOpen(false);
      await load(selectedClientId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el producto.");
    } finally { setSaving(false); }
  }

  async function patchProduct(product: CatalogProduct, patch: Record<string, unknown>) {
    try {
      await responseJson(await fetch(withClient(`/api/catalog/products/${product.id}`, selectedClientId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      }));
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo actualizar."); }
  }

  async function deleteProduct(product: CatalogProduct) {
    if (!window.confirm(`¿Eliminar “${product.name}”? Los pedidos anteriores conservarán su detalle.`)) return;
    try {
      await responseJson(await fetch(withClient(`/api/catalog/products/${product.id}`, selectedClientId), {
        method: "DELETE", credentials: "include",
      }));
      toast.success("Producto eliminado.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo eliminar."); }
  }

  function openNewCategory() {
    setEditingCategory(null);
    setCategoryForm({ name: "", description: "", active: true });
    setCategoryOpen(true);
  }

  function openEditCategory(category: CatalogCategory) {
    setEditingCategory(category);
    setCategoryForm({ name: category.name, description: category.description, active: category.active });
    setCategoryOpen(true);
  }

  async function saveCategory() {
    setSaving(true);
    try {
      const endpoint = editingCategory ? `/api/catalog/categories/${editingCategory.id}` : "/api/catalog/categories";
      await responseJson(await fetch(withClient(endpoint, selectedClientId), {
        method: editingCategory ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(categoryForm),
      }));
      toast.success(editingCategory ? "Categoría actualizada." : "Categoría creada.");
      setCategoryOpen(false);
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar la categoría."); }
    finally { setSaving(false); }
  }

  async function deleteCategory(category: CatalogCategory) {
    if (!window.confirm(`¿Eliminar la categoría “${category.name}”? Los productos quedarán sin categoría.`)) return;
    try {
      await responseJson(await fetch(withClient(`/api/catalog/categories/${category.id}`, selectedClientId), {
        method: "DELETE", credentials: "include",
      }));
      toast.success("Categoría eliminada.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo eliminar."); }
  }

  async function saveSettings(form: HTMLFormElement) {
    if (!catalog) return;
    const data = new FormData(form);
    setSaving(true);
    try {
      await responseJson(await fetch(withClient("/api/catalog", selectedClientId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          businessName: data.get("businessName"),
          slug: data.get("slug"),
          description: data.get("description"),
          currency: data.get("currency"),
          status: data.get("status"),
          accentColor: data.get("accentColor"),
          whatsappNotificationsEnabled: data.get("whatsappNotificationsEnabled") === "on",
          whatsappTemplateName: data.get("whatsappTemplateName") || catalog.whatsappTemplateName,
          whatsappTemplateLanguage: data.get("whatsappTemplateLanguage") || catalog.whatsappTemplateLanguage,
        }),
      }));
      toast.success("Configuración guardada.");
      await load(selectedClientId);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  if (loading && !snapshot) return <LoadingState />;

  return (
    <div className="mx-auto max-w-7xl p-5 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Catálogo</h1>
            {catalog && <Badge variant={catalog.status === "published" ? "default" : "secondary"}>{catalog.status === "published" ? "Publicado" : "Borrador"}</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Productos, categorías, inventario y enlace público de cada negocio.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(snapshot?.businesses.length || 0) > 0 && (
            <Select value={selectedClientId || undefined} onValueChange={selectBusiness}>
              <SelectTrigger className="w-60"><SelectValue placeholder="Seleccionar negocio" /></SelectTrigger>
              <SelectContent>{snapshot?.businesses.map((business) => <SelectItem key={business.id} value={business.id}>{business.businessName}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {catalog?.status === "published" && (
            <Button variant="outline" onClick={() => window.open(catalog.publicUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 size-4" />Ver catálogo</Button>
          )}
          {catalog && <Button onClick={openNewProduct}><Plus className="mr-2 size-4" />Producto</Button>}
        </div>
      </div>

      {!catalog ? (
        <Card className="border-dashed"><CardContent className="py-16 text-center"><Layers3 className="mx-auto mb-3 size-10 text-muted-foreground" /><h2 className="font-semibold">Selecciona un negocio</h2><p className="mt-1 text-sm text-muted-foreground">Cada negocio administra su propio catálogo y pedidos.</p></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Productos" value={products.length} detail={`${activeCount} visibles`} />
            <Metric label="Categorías" value={categories.length} detail="organización pública" />
            <Metric label="Stock bajo" value={lowStockCount} detail="3 unidades o menos" warning={lowStockCount > 0} />
          </div>

          <Tabs defaultValue="products">
            <TabsList>
              <TabsTrigger value="products"><Package className="mr-2 size-4" />Productos</TabsTrigger>
              <TabsTrigger value="categories"><Layers3 className="mr-2 size-4" />Categorías</TabsTrigger>
              <TabsTrigger value="settings"><Settings2 className="mr-2 size-4" />Configuración</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="mt-4 space-y-4">
              <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o SKU" className="pl-9" /></div>
              {filteredProducts.length === 0 ? (
                <EmptyState icon={Package} title="No hay productos" description="Crea el primer producto para comenzar a armar el catálogo." action={<Button onClick={openNewProduct}><Plus className="mr-2 size-4" />Crear producto</Button>} />
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredProducts.map((product) => (
                    <Card key={product.id} className={cn(!product.active && "opacity-65")}>
                      <CardContent className="flex gap-4 p-4">
                        <div className="size-20 shrink-0 overflow-hidden rounded-lg border bg-muted bg-cover bg-center" style={product.imageUrl ? { backgroundImage: `url(${JSON.stringify(product.imageUrl).slice(1, -1)})` } : undefined}>{!product.imageUrl && <ImageIcon className="m-auto mt-6 size-7 text-muted-foreground/50" />}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2"><div><h3 className="truncate font-semibold">{product.name}</h3><p className="text-xs text-muted-foreground">{product.sku || "Sin SKU"}</p></div><span className="font-semibold">{product.price.toFixed(2)} {product.currency}</span></div>
                          <div className="mt-3 flex flex-wrap items-center gap-2"><Badge variant={product.active ? "default" : "secondary"}>{product.active ? "Visible" : "Oculto"}</Badge><Badge variant={product.trackInventory && product.stock <= 3 ? "destructive" : "outline"}>{product.trackInventory ? `Stock ${product.stock}` : "Sin control de stock"}</Badge></div>
                          <div className="mt-3 flex justify-end gap-1"><Button size="sm" variant="ghost" onClick={() => void patchProduct(product, { active: !product.active })}>{product.active ? "Ocultar" : "Mostrar"}</Button><Button size="icon" variant="ghost" onClick={() => openEditProduct(product)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => void deleteProduct(product)}><Trash2 className="size-4" /></Button></div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="categories" className="mt-4 space-y-4">
              <div className="flex justify-end"><Button variant="outline" onClick={openNewCategory}><Plus className="mr-2 size-4" />Categoría</Button></div>
              {categories.length === 0 ? <EmptyState icon={Layers3} title="Sin categorías" description="Las categorías ayudan a los clientes a encontrar productos." action={<Button onClick={openNewCategory}>Crear categoría</Button>} /> : (
                <Card><CardContent className="divide-y p-0">{categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 p-4"><div><div className="flex items-center gap-2"><span className="font-medium">{category.name}</span>{!category.active && <Badge variant="secondary">Oculta</Badge>}</div><p className="text-sm text-muted-foreground">{category.description || `${products.filter((product) => product.categoryId === category.id).length} productos`}</p></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => openEditCategory(category)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => void deleteCategory(category)}><Trash2 className="size-4" /></Button></div></div>)}</CardContent></Card>
              )}
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              <CatalogSettingsForm key={`${catalog.id}:${catalog.slug}:${catalog.status}`} catalog={catalog} saving={saving} onSubmit={saveSettings} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <ProductDialog open={productOpen} onOpenChange={setProductOpen} editing={Boolean(editingProduct)} form={productForm} setForm={setProductForm} categories={categories} saving={saving} onSave={saveProduct} />
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} editing={Boolean(editingCategory)} form={categoryForm} setForm={setCategoryForm} saving={saving} onSave={saveCategory} />
    </div>
  );
}

function CatalogSettingsForm({ catalog, saving, onSubmit }: { catalog: NonNullable<CatalogSnapshot["catalog"]>; saving: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  const [whatsapp, setWhatsapp] = useState(catalog.whatsappNotificationsEnabled);
  return <Card className="max-w-3xl"><CardHeader><CardTitle className="text-base">Publicación e integraciones</CardTitle></CardHeader><CardContent><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Nombre público"><Input name="businessName" defaultValue={catalog.businessName} /></Field><Field label="Enlace"><Input name="slug" defaultValue={catalog.slug} /></Field></div>
    <Field label="Descripción"><Textarea name="description" defaultValue={catalog.description} rows={3} /></Field>
    <div className="grid gap-4 sm:grid-cols-3"><Field label="Estado"><Select name="status" defaultValue={catalog.status}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Borrador</SelectItem><SelectItem value="published">Publicado</SelectItem></SelectContent></Select></Field><Field label="Moneda"><Select name="currency" defaultValue={catalog.currency}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="COP">COP</SelectItem><SelectItem value="MXN">MXN</SelectItem></SelectContent></Select></Field><Field label="Color"><Input name="accentColor" type="color" defaultValue={catalog.accentColor} className="w-full" /></Field></div>
    <div className="space-y-4 rounded-lg border p-4"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 font-medium">Confirmación por WhatsApp {catalog.whatsappConnected ? <Badge variant="outline"><Check className="mr-1 size-3" />API conectada</Badge> : <Badge variant="secondary">Sin conexión</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">Opcional. El pedido por web sigue funcionando aunque WhatsApp esté desactivado.</p></div><Switch name="whatsappNotificationsEnabled" checked={whatsapp} onCheckedChange={setWhatsapp} disabled={!catalog.whatsappConnected} /></div>{catalog.whatsappConnected && <div className="grid gap-4 border-t pt-4 sm:grid-cols-2"><Field label="Plantilla aprobada por Meta"><Input name="whatsappTemplateName" defaultValue={catalog.whatsappTemplateName} placeholder="pedido_recibido_payflow" /></Field><Field label="Idioma de plantilla"><Input name="whatsappTemplateLanguage" defaultValue={catalog.whatsappTemplateLanguage} placeholder="es" /></Field><p className="text-xs text-muted-foreground sm:col-span-2">La plantilla debe tener cuatro variables de texto, en este orden: nombre, número de pedido, total y negocio.</p></div>}</div>
    <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(catalog.publicUrl); toast.success("Enlace copiado."); }}><Copy className="mr-2 size-4" />Copiar enlace</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}Guardar</Button></div>
  </form></CardContent></Card>;
}

function ProductDialog({ open, onOpenChange, editing, form, setForm, categories, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; editing: boolean; form: ProductForm; setForm: React.Dispatch<React.SetStateAction<ProductForm>>; categories: CatalogCategory[]; saving: boolean; onSave: () => void }) {
  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{editing ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader><div className="grid gap-4 py-2 sm:grid-cols-2"><Field label="Nombre *"><Input value={form.name} onChange={(event) => set("name", event.target.value)} /></Field><Field label="SKU"><Input value={form.sku} onChange={(event) => set("sku", event.target.value)} /></Field><div className="sm:col-span-2"><Field label="Descripción"><Textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={3} /></Field></div><Field label="Categoría"><Select value={form.categoryId || "none"} onValueChange={(value) => set("categoryId", value === "none" ? "" : value)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin categoría</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></Field><Field label="Imagen URL"><Input value={form.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="https://…" /></Field><Field label="Precio *"><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => set("price", Number(event.target.value))} /></Field><Field label="Precio anterior"><Input type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={(event) => set("compareAtPrice", event.target.value)} /></Field><Field label="Stock"><Input type="number" min="0" step="1" value={form.stock} disabled={!form.trackInventory} onChange={(event) => set("stock", Number(event.target.value))} /></Field><div className="space-y-3 rounded-lg border p-3"><Toggle label="Controlar inventario" checked={form.trackInventory} onCheckedChange={(value) => set("trackInventory", value)} /><Toggle label="Visible en catálogo" checked={form.active} onCheckedChange={(value) => set("active", value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}{editing ? "Guardar" : "Crear producto"}</Button></DialogFooter></DialogContent></Dialog>;
}

function CategoryDialog({ open, onOpenChange, editing, form, setForm, saving, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; editing: boolean; form: { name: string; description: string; active: boolean }; setForm: React.Dispatch<React.SetStateAction<{ name: string; description: string; active: boolean }>>; saving: boolean; onSave: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{editing ? "Editar categoría" : "Nueva categoría"}</DialogTitle></DialogHeader><div className="space-y-4"><Field label="Nombre *"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Descripción"><Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></Field><Toggle label="Visible en catálogo" checked={form.active} onCheckedChange={(active) => setForm((current) => ({ ...current, active }))} /></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={onSave} disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}Guardar</Button></DialogFooter></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>; }
function Toggle({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) { return <div className="flex items-center justify-between gap-3"><Label>{label}</Label><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>; }
function Metric({ label, value, detail, warning }: { label: string; value: number; detail: string; warning?: boolean }) { return <Card><CardContent className="p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><div className="mt-1 flex items-end justify-between"><span className={cn("text-2xl font-bold", warning && "text-amber-600")}>{value}</span><span className="text-xs text-muted-foreground">{detail}</span></div></CardContent></Card>; }
function EmptyState({ icon: Icon, title, description, action }: { icon: typeof Package; title: string; description: string; action: React.ReactNode }) { return <Card className="border-dashed"><CardContent className="py-14 text-center"><Icon className="mx-auto mb-3 size-9 text-muted-foreground" /><h3 className="font-semibold">{title}</h3><p className="mx-auto mb-4 mt-1 max-w-md text-sm text-muted-foreground">{description}</p>{action}</CardContent></Card>; }
function LoadingState() { return <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 size-5 animate-spin" />Cargando catálogo…</div>; }
