"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import styles from "./InlineAlgoliaSearch.module.css";

/* =================== EDITABLE TEXT =================== */
const copy = {
  eyebrow: "Trusted Industrial Sourcing Done Fast",
  heading: "BlinkX — Discovery, Source, Connection & RFQs",
  body: "Search across suppliers, parts, certifications, and more. Results update as you type, and pressing enter opens the full search page.",
  placeholder: "Search suppliers, SKUs, brands, categories…",
  tryPrefix: "Try:",
  tryLinks: [
    { label: "PLC", href: "/search?q=PLC" },
    { label: "AS9100", href: "/search?q=AS9100" },
    { label: "Ethernet", href: "/search?q=Ethernet" }
  ]
};
/* ================= /EDITABLE TEXT ==================== */

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

type Hit = Partial<Record<(typeof ATTRIBUTES)[number], string | number>> & {
  objectID?: string;
};

function productUrl(hit: Hit): string {
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

function displayName(hit: Hit): string {
  return (
    (typeof hit.name === "string" && hit.name) ||
    (typeof hit.title === "string" && hit.title) ||
    (typeof hit.sku === "string" && hit.sku) ||
    (typeof hit.id === "string" && hit.id) ||
    (typeof hit.objectID === "string" && hit.objectID) ||
    ""
  );
}

export default function InlineAlgoliaSearch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(-1);
  const [open, setOpen] = useState(false);
  const [debugText, setDebugText] = useState("");

  const isConfigured = APP_ID && SEARCH_KEY && INDEX_NAME;

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

    const timeout = window.setTimeout(async () => {
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
        const filtered = (incoming ?? []).filter((hit) => Boolean(displayName(hit)));
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

    return () => window.clearTimeout(timeout);
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
        const firstHits = data.hits ?? [];
        const first = firstHits?.[0];
        const name = first ? displayName(first) : "—";
        setDebugText(`Using Algolia app ${APP_ID}, index ${INDEX_NAME}. First hit: ${name}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setDebugText(`Algolia test error: ${message}`);
      }
    })();
  }, [isConfigured]);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!rootRef.current) {
        return;
      }
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSelected(-1);
      }
    }

    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  function navigateToSelection(hit: Hit | undefined, currentQuery: string) {
    if (hit) {
      router.push(productUrl(hit));
      return;
    }
    if (currentQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(currentQuery.trim())}`);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateToSelection(hits[selected], query);
  }

  return (
    <section className={`${styles.wrapper} ${className}`} aria-label="Search BlinkX">
      <div className={styles.inner} ref={rootRef}>
        <header className={styles.copyBlock}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2 className={styles.heading}>{copy.heading}</h2>
          <p className={styles.body}>{copy.body}</p>
        </header>

        <form className={styles.form} role="search" aria-label="Site search" onSubmit={handleSubmit}>
          <input
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.placeholder}
            aria-label="Search suppliers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.input}
          />

          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              className={styles.clearButton}
              onClick={() => {
                setQuery("");
                setHits([]);
                setOpen(false);
                setSelected(-1);
              }}
            >
              ×
            </button>
          ) : null}

          <button type="submit" aria-label="Search" className={styles.submitButton}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M21 21l-4.35-4.35m1.35-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </form>

        <div className={styles.results} aria-live="polite">
          {open && hits.length > 0 ? (
            <div role="listbox" className={styles.resultsList}>
              {hits.map((hit, index) => {
                const isActive = index === selected;
                const key = String(hit.objectID ?? index);
                return (
                  <div
                    key={key}
                    role="option"
                    aria-selected={isActive}
                    className={`${styles.resultItem} ${isActive ? styles.resultItemActive : ""}`}
                    onMouseEnter={() => setSelected(index)}
                    onMouseLeave={() => setSelected(-1)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => navigateToSelection(hit, query)}
                  >
                    <div className={styles.resultHeading}>
                      {hit.brand ? <span className={styles.resultBrand}>{String(hit.brand)}</span> : null}
                      <span>{displayName(hit)}</span>
                    </div>
                    <div className={styles.resultMeta}>
                      <span>SKU: {hit.sku ? String(hit.sku) : "—"}</span>
                      {hit.price ? <span> · ${String(hit.price)}</span> : null}
                    </div>
                    {hit.short_description ? (
                      <p className={styles.resultDescription}>{String(hit.short_description)}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className={styles.hints}>
          <span className={styles.tryPrefix}>{copy.tryPrefix}</span>
          <span className={styles.tryLinks}>
            {copy.tryLinks.map((link, index) => (
              <span key={link.href}>
                <Link href={link.href}>{link.label}</Link>
                {index < copy.tryLinks.length - 1 ? <span>, </span> : null}
              </span>
            ))}
          </span>
        </div>

        <p className={styles.debug}>{debugText}</p>
      </div>
    </section>
  );
}
