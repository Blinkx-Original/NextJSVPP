// This file provides a compatibility layer for old product category URLs ("/c/{slug}").
// It simply redirects to the canonical categories route under `/categories/{slug}`.
import { redirect } from 'next/navigation';

interface PageProps {
  params: { slug: string };
}

export default function LegacyProductCategoryPage({ params }: PageProps) {
  // Immediately redirect to the new categories hub for product categories.
  redirect(`/categories/${params.slug}`);
}