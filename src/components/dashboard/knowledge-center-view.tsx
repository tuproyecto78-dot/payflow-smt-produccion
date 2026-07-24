"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpen,
  Package,
  HelpCircle,
  FileText,
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Brain,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface Product {
  id?: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
}
interface Faq {
  id?: string;
  question: string;
  answer: string;
  category: string;
}
interface Document {
  id?: string;
  name: string;
  content: string;
  type: string;
  extractionStatus: string;
}
interface KnowledgeData {
  businessId: string;
  businessName?: string;
  products: Product[];
  faqs: Faq[];
  documents: Document[];
}

export function KnowledgeCenterView() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/knowledge-center", { credentials: "include" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "No se pudo cargar el conocimiento.");
      }
      const d = (await res.json()) as KnowledgeData;
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 lg:px-8 lg:py-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="size-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <BookOpen className="size-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Centro de Conocimiento</h1>
              <p className="text-sm text-muted-foreground mt-1">
                FAQs, productos y documentos del negocio. El Agente IA usa esta información para responder a tus clientes.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`size-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>

        {/* Info banner */}
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2.5">
            <Brain className="size-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <p className="font-semibold mb-1">¿Cómo funciona?</p>
              <p className="text-emerald-700 leading-relaxed">
                Carga tus productos, FAQs y documentos aquí. El Agente IA prioriza los <strong>datos estructurados</strong> (productos y FAQs) sobre los documentos de texto.
                <strong> Nunca inventa información</strong>: si no hay conocimiento cargado, responde que no tiene la info.
              </p>
            </div>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2.5">
            <AlertCircle className="size-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Error</p>
              <p className="mt-0.5">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={load}>Reintentar</Button>
            </div>
          </div>
        ) : data ? (
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="products" className="gap-1.5">
                <Package className="size-3.5" />
                Productos ({data.products.length})
              </TabsTrigger>
              <TabsTrigger value="faqs" className="gap-1.5">
                <HelpCircle className="size-3.5" />
                FAQs ({data.faqs.length})
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <FileText className="size-3.5" />
                Documentos ({data.documents.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <ProductsTab data={data} onReload={load} />
            </TabsContent>
            <TabsContent value="faqs">
              <FaqsTab data={data} onReload={load} />
            </TabsContent>
            <TabsContent value="documents">
              <DocumentsTab data={data} onReload={load} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Products Tab ---------- */

function ProductsTab({ data, onReload }: { data: KnowledgeData; onReload: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge-center/products", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, price: parseFloat(price) || 0, currency, category: category || "general" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al crear producto.");
      }
      toast.success("Producto agregado al conocimiento.");
      setName(""); setDescription(""); setPrice(""); setCategory("");
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear producto.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("¿Eliminar este producto del conocimiento?")) return;
    try {
      const res = await fetch(`/api/knowledge-center/products?id=${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Error al eliminar.");
      toast.success("Producto eliminado.");
      onReload();
    } catch {
      toast.error("Error al eliminar producto.");
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
      {/* Add form */}
      <form onSubmit={addProduct} className="rounded-xl border border-border bg-card p-5 space-y-3 h-fit">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus className="size-4 text-emerald-600" /> Nuevo producto
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="p-name" className="text-xs">Nombre *</Label>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Almuerzo del día" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-desc" className="text-xs">Descripción</Label>
          <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sopa, segundo y jugo natural." rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="p-price" className="text-xs">Precio</Label>
            <Input id="p-price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="3.50" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-curr" className="text-xs">Moneda</Label>
            <Input id="p-curr" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-cat" className="text-xs">Categoría</Label>
          <Input id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Almuerzos" />
        </div>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
          Agregar
        </Button>
      </form>

      {/* List */}
      <div className="space-y-2">
        {data.products.length === 0 ? (
          <EmptyState icon={Package} text="Sin productos cargados. Agrega el primero." />
        ) : (
          data.products.map((p, i) => (
            <div key={p.id || i} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
              <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                <Package className="size-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{p.name}</p>
                  <Badge variant="secondary" className="text-xs">{p.category}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                <p className="text-sm font-bold text-emerald-600 mt-1">{p.price.toFixed(2)} {p.currency}</p>
              </div>
              {p.id && (
                <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteProduct(p.id)}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- FAQs Tab ---------- */

function FaqsTab({ data, onReload }: { data: KnowledgeData; onReload: () => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  async function addFaq(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      toast.error("Pregunta y respuesta son obligatorias.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge-center/faqs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, category: category || "general" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al crear FAQ.");
      }
      toast.success("FAQ agregada.");
      setQuestion(""); setAnswer(""); setCategory("");
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear FAQ.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteFaq(id: string) {
    if (!confirm("¿Eliminar esta FAQ?")) return;
    try {
      await fetch(`/api/knowledge-center/faqs?id=${id}`, { method: "DELETE", credentials: "include" });
      toast.success("FAQ eliminada.");
      onReload();
    } catch {
      toast.error("Error al eliminar FAQ.");
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
      <form onSubmit={addFaq} className="rounded-xl border border-border bg-card p-5 space-y-3 h-fit">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus className="size-4 text-emerald-600" /> Nueva FAQ
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="f-q" className="text-xs">Pregunta *</Label>
          <Input id="f-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Cuál es el horario?" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-a" className="text-xs">Respuesta *</Label>
          <Textarea id="f-a" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Atendemos de lunes a sábado de 9:00 a 18:00." rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-cat" className="text-xs">Categoría</Label>
          <Input id="f-cat" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="general" />
        </div>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
          Agregar
        </Button>
      </form>

      <div className="space-y-2">
        {data.faqs.length === 0 ? (
          <EmptyState icon={HelpCircle} text="Sin FAQs cargadas. Agrega la primera." />
        ) : (
          data.faqs.map((f, i) => (
            <div key={f.id || i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
                  <HelpCircle className="size-4 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{f.question}</p>
                    <Badge variant="secondary" className="text-xs">{f.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{f.answer}</p>
                </div>
                {f.id && (
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteFaq(f.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Documents Tab ---------- */

function DocumentsTab({ data, onReload }: { data: KnowledgeData; onReload: () => void }) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      toast.error("Nombre y contenido son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge-center/documents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, content, type: "text" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error al crear documento.");
      }
      const result = await res.json();
      toast.success("Documento guardado y procesado.");
      if (result.extraction?.products?.length > 0) {
        toast.info(`Se extrajeron ${result.extraction.products.length} productos del documento.`);
      }
      setName(""); setContent("");
      onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear documento.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteDoc(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await fetch(`/api/knowledge-center/documents?id=${id}`, { method: "DELETE", credentials: "include" });
      toast.success("Documento eliminado.");
      onReload();
    } catch {
      toast.error("Error al eliminar documento.");
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_2fr] gap-6">
      <form onSubmit={addDoc} className="rounded-xl border border-border bg-card p-5 space-y-3 h-fit">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus className="size-4 text-emerald-600" /> Nuevo documento
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="d-name" className="text-xs">Nombre *</Label>
          <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Políticas del negocio" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="d-content" className="text-xs">Contenido *</Label>
          <Textarea
            id="d-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Pega aquí el texto del documento. Se extraerán productos, horarios y políticas automáticamente."
            rows={8}
            className="font-mono text-xs"
          />
        </div>
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
          💡 La extracción automática detecta productos con precios, horarios y políticas. Los datos estructurados (productos/FAQs) tienen prioridad sobre los documentos.
        </div>
        <Button type="submit" disabled={saving} className="w-full">
          {saving ? <Loader2 className="size-4 mr-1.5 animate-spin" /> : <Plus className="size-4 mr-1.5" />}
          Guardar y procesar
        </Button>
      </form>

      <div className="space-y-2">
        {data.documents.length === 0 ? (
          <EmptyState icon={FileText} text="Sin documentos cargados. Pega el texto de un documento para extraer conocimiento." />
        ) : (
          data.documents.map((d, i) => (
            <div key={d.id || i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                  <FileText className="size-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{d.name}</p>
                    <Badge variant="outline" className="text-xs gap-1">
                      <CheckCircle2 className="size-3 text-emerald-500" />
                      {d.extractionStatus === "extracted" ? "Procesado" : "Pendiente"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{d.content.slice(0, 200)}{d.content.length > 200 ? "…" : ""}</p>
                </div>
                {d.id && (
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDoc(d.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Shared ---------- */

function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <Icon className="size-8 mx-auto mb-2 text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
