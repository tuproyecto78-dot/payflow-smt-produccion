import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { slug } = await params;
  const supabase = createServiceRoleClient();
  const { data: catalog, error } = await supabase
    .from("catalogs")
    .select("id, client_id, business_name, slug, description, currency, accent_color")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) {
    console.error("[public catalog GET]", error);
    return NextResponse.json({ error: "El catálogo no está disponible." }, { status: 503 });
  }
  if (!catalog) return NextResponse.json({ error: "Catálogo no encontrado." }, { status: 404 });

  const [categoriesResult, productsResult] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("id, name, slug, description, sort_order")
      .eq("catalog_id", catalog.id)
      .eq("client_id", catalog.client_id)
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("catalog_products")
      .select("id, category_id, name, slug, description, sku, price, compare_at_price, currency, stock, track_inventory, image_url")
      .eq("catalog_id", catalog.id)
      .eq("client_id", catalog.client_id)
      .eq("active", true)
      .order("updated_at", { ascending: false }),
  ]);
  if (categoriesResult.error || productsResult.error) {
    console.error("[public catalog GET] items", categoriesResult.error || productsResult.error);
    return NextResponse.json({ error: "No se pudieron cargar los productos." }, { status: 503 });
  }

  return NextResponse.json({
    catalog: {
      businessName: catalog.business_name,
      slug: catalog.slug,
      description: catalog.description || "",
      currency: catalog.currency,
      accentColor: catalog.accent_color,
    },
    categories: (categoriesResult.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
    })),
    products: (productsResult.data || []).map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
      sku: row.sku || "",
      price: Number(row.price || 0),
      compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
      currency: row.currency,
      available: row.track_inventory === false || Number(row.stock || 0) > 0,
      imageUrl: row.image_url || "",
    })),
  });
}

export const dynamic = "force-dynamic";
