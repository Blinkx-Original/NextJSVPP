"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

const APP_ID = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID?.trim() ?? "";
const SEARCH_KEY = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY?.trim() ?? "";
const INDEX_NAME = process.env.NEXT_PUBLIC_ALGOLIA_INDEX?.trim() ?? "";

const ATTRIBUTES = [
  "title",
  "name",
  "brand",
  "sku",
  "id",
  "price",
  "wp_url",
  "url",
  "slug",
  "categories",
  "short_description",
  "image"
] as const;

export type Hit = Partial<Record<(typeof ATTRIBUTES)[number], string | number>> & {
  objectID?: string;
};

export function productUrl(hit: Hit): string {
  if (hit.slug && typeof hit.slug === "string") {
    return `/p/${hit.slug}`;
  }
  if (hit.wp_url && typeof hit.wp_url === "string") {
    return hit.wp_url;
  }
  if (hit.url && typeof hit.url === "string") {
    return hit.url;
  }
  return "#";
}

export function displayName(hit: Hit): string {
  return (
    (typeof hit.name === "string" && hit.name) ||
    (typeof hit.title === "string" && hit.title) ||
    (typeof hit.sku === "string" && hit.sku) ||
    (typeof hit.id === "string" && hit.id) ||
    (typeof hit.objectID === "string" && hit.objectID) ||
    ""
  );
}

export function useAlgoliaSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(-1);
  const [open, setOpen] = useState(false);
  const [debugText, setDebugText] = useState("");

  const isConfigured = Boolean(APP_ID && SEARCH_KEY && INDEX_NAME);

  useEffect(() => {
    if (!isConfigured) {
      return;
    }

    if (!query.trim()) {
      setHits([]);
      setOpen(false);
      setSelected(-1);
      return;
    }

    const handle = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `https://${APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(INDEX_NAME)}/query`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Algolia-Application-Id": APP_ID,
              "X-Algolia-API-Key": SEARCH_KEY
            },
            body: JSON.stringify({
              query: query.trim(),
              hitsPerPage: 8,
              attributesToRetrieve: ATTRIBUTES,
              attributesToHighlight: [],
              removeStopWords: ["en"],
              ignorePlurals: ["en"],
              queryLanguages: ["en"]
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Algolia request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { hits?: Hit[] };
        const incoming = data.hits ?? [];
        const filtered = incoming.filter((hit) => Boolean(displayName(hit)));
        setHits(filtered);
        setSelected(-1);
        setOpen(filtered.length > 0);
        setDebugText("");
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Algolia search error", error);
        setDebugText(`Algolia error: ${message}`);
        setHits([]);
        setOpen(false);
      }
    }, 140);

    return () => window.clearTimeout(handle);
  }, [isConfigured, query]);

  useEffect(() => {
    if (!isConfigured) {
      setDebugText("Missing Algolia configuration.");
      return;
    }

    (async () => {
      try {
        const response = await fetch(
          `https://${APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(INDEX_NAME)}/query`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Algolia-Application-Id": APP_ID,
              "X-Algolia-API-Key": SEARCH_KEY
            },
            body: JSON.stringify({
              query: "",
              hitsPerPage: 1,
              attributesToRetrieve: ["name", "title", "sku", "slug"]
            })
          }
        );

        if (!response.ok) {
          throw new Error(`Algolia request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { hits?: Hit[] };
        const first = data.hits?.[0];
        const name = first ? displayName(first) : "—";
        setDebugText(`Using Algolia app ${APP_ID}, index ${INDEX_NAME}. First hit: ${name}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setDebugText(`Algolia test error: ${message}`);
      }
    })();
  }, [isConfigured]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSelected(-1);
      }
    }

    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  function navigateToSelection(hit: Hit | undefined, currentQuery: string) {
    if (hit) {
      router.push(productUrl(hit));
    } else if (currentQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(currentQuery.trim())}`);
    }
    setOpen(false);
    setSelected(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || !hits.length) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((prev) => Math.min(hits.length - 1, prev + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((prev) => Math.max(-1, prev - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      navigateToSelection(hits[selected], query);
    } else if (event.key === "Escape") {
      setOpen(false);
      (event.target as HTMLInputElement).blur();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToSelection(hits[selected], query);
  }

  function clearQuery() {
    setQuery("");
    setHits([]);
    setOpen(false);
    setSelected(-1);
  }

  function handleResultClick(hit: Hit) {
    navigateToSelection(hit, query);
  }

  function handleResultMouseEnter(index: number) {
    setSelected(index);
  }

  function handleResultMouseLeave() {
    setSelected(-1);
  }

  return {
    query,
    hits,
    selected,
    open,
    debugText,
    rootRef,
    setQuery,
    handleKeyDown,
    handleSubmit,
    clearQuery,
    handleResultClick,
    handleResultMouseEnter,
    handleResultMouseLeave
  };
}
