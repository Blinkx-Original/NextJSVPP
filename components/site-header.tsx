"use client";

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { displayName, useAlgoliaSearch } from './algolia-search';

const SUPPORT_PHONE = '1-800-925-6278';
const CUSTOMER_SERVICE_PHONE = '1-801-985-8965';
const HEADER_SEARCH_PLACEHOLDER = 'Search for Products';
// Upload the production logo asset to public/blinkx-logo.png so the header image resolves correctly.
const HEADER_LOGO_SRC = '/blinkx-logo.png';
const DESKTOP_MENU_BREAKPOINT = 1024;

const MENU_ITEMS = [
  { label: 'Support', value: SUPPORT_PHONE, icon: '💬' },
  { label: 'Customer Service', value: CUSTOMER_SERVICE_PHONE, icon: '💬' }
];

function telHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

export function SiteHeader() {
  const {
    query,
    hits,
    selected,
    open,
    rootRef,
    setQuery,
    handleKeyDown,
    handleSubmit,
    clearQuery,
    handleResultClick,
    handleResultMouseEnter,
    handleResultMouseLeave
  } = useAlgoliaSearch();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > DESKTOP_MENU_BREAKPOINT) {
        setIsMenuOpen(false);
      }
    }

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
    return undefined;
  }, [isMenuOpen]);

  const menuItems = useMemo(
    () =>
      MENU_ITEMS.map((item) => ({
        ...item,
        href: telHref(item.value)
      })),
    []
  );

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__top">
          <Link href="/" className="site-header__logo" aria-label="Home">
            <Image
              src={HEADER_LOGO_SRC}
              alt="blinkx"
              width={240}
              height={52}
              priority
              className="site-header__logo-image"
              sizes="(max-width: 640px) 160px, 220px"
            />
          </Link>
          <button
            type="button"
            className={`site-header__menu-toggle${isMenuOpen ? ' site-header__menu-toggle--active' : ''}`}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setIsMenuOpen((openState) => !openState)}
          >
            <span aria-hidden="true" className="site-header__menu-toggle-bars">
              <span />
              <span />
              <span />
              <span />
            </span>
          </button>
          <nav className="site-header__menu site-header__menu--desktop" aria-label="Contact information">
            {menuItems.map((item) => (
              <a key={item.label} className="site-header__menu-item" href={item.href}>
                <span aria-hidden="true" className="site-header__menu-icon">{item.icon}</span>
                <span className="site-header__menu-label">{item.label}</span>
                <span className="site-header__menu-value">{item.value}</span>
              </a>
            ))}
          </nav>
        </div>

        <div
          className={`site-header__mobile-panel${isMenuOpen ? ' site-header__mobile-panel--open' : ''}`}
          aria-hidden={!isMenuOpen}
        >
          <nav className="site-header__mobile-menu" aria-label="Contact information (mobile)">
            {menuItems.map((item) => (
              <a
                key={item.label}
                className="site-header__mobile-menu-item"
                href={item.href}
                onClick={() => setIsMenuOpen(false)}
              >
                <span aria-hidden="true" className="site-header__mobile-menu-icon">{item.icon}</span>
                <div className="site-header__mobile-menu-text">
                  <span className="site-header__mobile-menu-label">{item.label}</span>
                  <span className="site-header__mobile-menu-value">{item.value}</span>
                </div>
              </a>
            ))}
          </nav>
        </div>

        <div className="site-header__search">
          <div className="site-header__search-inner" ref={rootRef}>
            <form
              className="site-header__search-form"
              role="search"
              aria-label="Search products"
              onSubmit={handleSubmit}
            >
              <input
                type="search"
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
                placeholder={HEADER_SEARCH_PLACEHOLDER}
                aria-label="Search products"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                className="site-header__search-input"
              />

              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="site-header__search-clear"
                  onClick={clearQuery}
                >
                  ×
                </button>
              ) : null}

              <button type="submit" aria-label="Search" className="site-header__search-submit">
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

            <div className="site-header__search-results" aria-live="polite">
              {open && hits.length > 0 ? (
                <div role="listbox" className="site-header__search-results-list">
                  {hits.map((hit, index) => {
                    const isActive = index === selected;
                    const key = String(hit.objectID ?? index);
                    return (
                      <div
                        key={key}
                        role="option"
                        aria-selected={isActive}
                        className={`site-header__search-result${isActive ? ' site-header__search-result--active' : ''}`}
                        onMouseEnter={() => handleResultMouseEnter(index)}
                        onMouseLeave={handleResultMouseLeave}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => handleResultClick(hit)}
                      >
                        <div className="site-header__search-result-heading">
                          {hit.brand ? <span className="site-header__search-result-brand">{String(hit.brand)}</span> : null}
                          <span>{displayName(hit)}</span>
                        </div>
                        <div className="site-header__search-result-meta">
                          <span>SKU: {hit.sku ? String(hit.sku) : '—'}</span>
                          {hit.price ? <span> · ${String(hit.price)}</span> : null}
                        </div>
                        {hit.short_description ? (
                          <p className="site-header__search-result-description">{String(hit.short_description)}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
