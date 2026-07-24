import { PublicCatalogView } from "@/components/catalog/public-catalog-view";

export default async function PublicCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicCatalogView slug={slug} />;
}
