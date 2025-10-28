"use client";

import Link from "next/link";

import styles from "./InlineAlgoliaSearch.module.css";
import { displayName, useAlgoliaSearch } from "./algolia-search";

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

export default function InlineAlgoliaSearch({ className = "" }: { className?: string }) {
  const {
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
  } = useAlgoliaSearch();

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
              onClick={clearQuery}
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
                    onMouseEnter={() => handleResultMouseEnter(index)}
                    onMouseLeave={handleResultMouseLeave}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleResultClick(hit)}
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
