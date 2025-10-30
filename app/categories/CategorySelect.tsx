"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import styles from "./catalog.module.css";

/**
 * Props for the CategorySelect component.  The parent page supplies a
 * list of published categories (each with a slug and human‑friendly
 * name) along with the currently selected slug.  When the user
 * chooses a different category the component updates the browser
 * query string accordingly and resets the page parameter to 1.
 */
export interface CategorySelectProps {
  categories: { slug: string; name: string }[];
  selectedSlug?: string;
}

/**
 * A simple drop‑down for selecting a product category.  The menu
 * lists all available categories and includes a blank option which
 * clears the selection.  On change the query string is updated via
 * the Next.js router; the page parameter is removed to reset
 * pagination when a new category is selected.
 */
export default function CategorySelect({ categories, selectedSlug }: CategorySelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    // Clone the search params into a mutable URLSearchParams instance
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("category", value);
    } else {
      params.delete("category");
    }
    // Always reset the page to the first page when selecting a new category
    params.delete("page");
    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    router.push(url);
  }

  return (
    <select
      className={styles.categorySelect}
      value={selectedSlug ?? ""}
      onChange={handleChange}
    >
      <option value="">All categories</option>
      {categories.map(({ slug, name }) => (
        <option key={slug} value={slug}>
          {name}
        </option>
      ))}
    </select>
  );
}