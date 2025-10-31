"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRecoilState } from 'recoil';

import { fetchHeaderCategories } from '@/lib/category-menu-api';
import {
  activeHeaderCategoryState,
  headerCategoryListState
} from '@/lib/category-menu-state';

interface HeaderCategoryMenuProps {
  variant: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

function useActiveSlugFromPathname(): string | null {
  const pathname = usePathname();
  return useMemo(() => {
    if (!pathname) {
      return null;
    }
    const match = pathname.match(/^\/categories\/([^/?#]+)/i);
    if (match && match[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return null;
  }, [pathname]);
}

export function HeaderCategoryMenu({ variant, onNavigate }: HeaderCategoryMenuProps) {
  const [categories, setCategories] = useRecoilState(headerCategoryListState);
  const [activeSlug, setActiveSlug] = useRecoilState(activeHeaderCategoryState);
  const derivedSlug = useActiveSlugFromPathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestStartedRef = useRef(false);

  useEffect(() => {
    if (derivedSlug && derivedSlug !== activeSlug) {
      setActiveSlug(derivedSlug);
    }
    if (!derivedSlug && activeSlug !== null) {
      setActiveSlug(null);
    }
  }, [derivedSlug, activeSlug, setActiveSlug]);

  useEffect(() => {
    if (categories.length > 0 || requestStartedRef.current) {
      return;
    }
    requestStartedRef.current = true;
    const abortController = new AbortController();
    setIsLoading(true);
    fetchHeaderCategories(abortController.signal)
      .then((items) => {
        setCategories(items);
        setError(null);
      })
      .catch((fetchError) => {
        if (abortController.signal.aborted) {
          return;
        }
        setError((fetchError as Error)?.message || 'Unable to load categories');
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [categories.length, setCategories]);

  useEffect(() => {
    if (variant !== 'desktop' || !isOpen) {
      return;
    }
    function handlePointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [variant, isOpen]);

  if (variant === 'mobile') {
    return (
      <div className="site-header__mobile-categories">
        <p className="site-header__mobile-categories-heading">Product Categories</p>
        {isLoading ? <p className="site-header__categories-status">Loading categories…</p> : null}
        {error ? <p className="site-header__categories-error">{error}</p> : null}
        {!isLoading && !error && categories.length === 0 ? (
          <p className="site-header__categories-status">No categories available yet.</p>
        ) : null}
        {categories.length > 0 ? (
          <ul className="site-header__mobile-categories-list">
            {categories.map((category) => {
              const isActive = activeSlug === category.slug;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className={`site-header__mobile-categories-link${
                      isActive ? ' site-header__mobile-categories-link--active' : ''
                    }`}
                    onClick={() => {
                      setActiveSlug(category.slug);
                      onNavigate?.();
                    }}
                  >
                    {category.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="site-header__categories" ref={containerRef}>
      <button
        type="button"
        className={`site-header__categories-trigger${isOpen ? ' site-header__categories-trigger--open' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        Product Categories
        <span aria-hidden="true" className="site-header__categories-caret" />
      </button>
      <div
        className={`site-header__categories-panel${isOpen ? ' site-header__categories-panel--open' : ''}`}
        role="menu"
        aria-hidden={!isOpen}
      >
        {isLoading ? <p className="site-header__categories-status">Loading categories…</p> : null}
        {error ? <p className="site-header__categories-error">{error}</p> : null}
        {!isLoading && !error && categories.length === 0 ? (
          <p className="site-header__categories-status">No categories available yet.</p>
        ) : null}
        {categories.length > 0 ? (
          <ul className="site-header__categories-list">
            {categories.map((category) => {
              const isActive = activeSlug === category.slug;
              return (
                <li key={category.slug}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className={`site-header__categories-link${
                      isActive ? ' site-header__categories-link--active' : ''
                    }`}
                    onClick={() => {
                      setActiveSlug(category.slug);
                      setIsOpen(false);
                    }}
                  >
                    {category.name}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
