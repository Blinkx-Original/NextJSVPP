'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';

import type { ProductCard } from './product-listing.types';
import relatedStyles from './related-products.module.css';

import './react-grid-layout.css';

type Breakpoint = 'lg' | 'md' | 'sm' | 'xs' | 'xxs';

type LayoutConfig = Record<Breakpoint, { cols: number; itemCols: number }>; // itemCols width per card

const ResponsiveGridLayout = WidthProvider(Responsive);

const LAYOUT_CONFIG: LayoutConfig = {
  lg: { cols: 12, itemCols: 4 },
  md: { cols: 10, itemCols: 5 },
  sm: { cols: 6, itemCols: 3 },
  xs: { cols: 4, itemCols: 4 },
  xxs: { cols: 2, itemCols: 2 }
};

const BREAKPOINTS: Record<Breakpoint, number> = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0
};

const COLS: Record<Breakpoint, number> = {
  lg: LAYOUT_CONFIG.lg.cols,
  md: LAYOUT_CONFIG.md.cols,
  sm: LAYOUT_CONFIG.sm.cols,
  xs: LAYOUT_CONFIG.xs.cols,
  xxs: LAYOUT_CONFIG.xxs.cols
};

function buildLayouts(cards: ProductCard[]): Layouts {
  const layouts: Partial<Record<Breakpoint, Layout[]>> = {};

  (Object.keys(LAYOUT_CONFIG) as Breakpoint[]).forEach((breakpoint) => {
    const { cols, itemCols } = LAYOUT_CONFIG[breakpoint];
    const itemsPerRow = Math.max(1, Math.floor(cols / itemCols));
    const layout: Layout[] = cards.map((card, index) => {
      const row = Math.floor(index / itemsPerRow);
      const column = index % itemsPerRow;
      return {
        i: card.id,
        x: column * itemCols,
        y: row * 12,
        w: itemCols,
        h: 12,
        static: true
      } satisfies Layout;
    });
    layouts[breakpoint] = layout;
  });

  return layouts as Layouts;
}

function StaticGrid({ cards }: { cards: ProductCard[] }) {
  return (
    <div className={relatedStyles.gridStatic} data-layout="static">
      {cards.map((product) => (
        <article key={product.id} className={relatedStyles.card}>
          <div className={relatedStyles.cardImageWrapper}>
            {product.primaryImage ? (
              <Image
                src={product.primaryImage}
                alt={product.title}
                fill
                className={relatedStyles.cardImage}
                sizes="(max-width: 768px) 100vw, 320px"
              />
            ) : null}
          </div>
          <div className={relatedStyles.cardBody}>
            <h3 className={relatedStyles.cardTitle}>{product.title}</h3>
            {product.shortSummary ? (
              <p className={relatedStyles.cardSummary}>{product.shortSummary}</p>
            ) : null}
            {product.price ? <div className={relatedStyles.cardPrice}>{product.price}</div> : null}
            <div className={relatedStyles.cardFooter}>
              <Link className={relatedStyles.cardLink} href={`/p/${product.slug}`} prefetch>
                Ver producto
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ProductListingGrid({ cards }: { cards: ProductCard[] }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const layouts = useMemo(() => buildLayouts(cards), [cards]);

  if (!isMounted) {
    return <StaticGrid cards={cards} />;
  }

  return (
    <ResponsiveGridLayout
      className={relatedStyles.gridLayout}
      measureBeforeMount
      isDraggable={false}
      isResizable={false}
      compactType="vertical"
      margin={[16, 16]}
      containerPadding={[0, 0]}
      rowHeight={30}
      layouts={layouts}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      useCSSTransforms={false}
    >
      {cards.map((product) => (
        <div key={product.id} className={relatedStyles.gridItem}>
          <article className={relatedStyles.card}>
            <div className={relatedStyles.cardImageWrapper}>
              {product.primaryImage ? (
                <Image
                  src={product.primaryImage}
                  alt={product.title}
                  fill
                  className={relatedStyles.cardImage}
                  sizes="(max-width: 768px) 100vw, 320px"
                />
              ) : null}
            </div>
            <div className={relatedStyles.cardBody}>
              <h3 className={relatedStyles.cardTitle}>{product.title}</h3>
              {product.shortSummary ? (
                <p className={relatedStyles.cardSummary}>{product.shortSummary}</p>
              ) : null}
              {product.price ? <div className={relatedStyles.cardPrice}>{product.price}</div> : null}
              <div className={relatedStyles.cardFooter}>
                <Link className={relatedStyles.cardLink} href={`/p/${product.slug}`} prefetch>
                  Ver producto
                </Link>
              </div>
            </div>
          </article>
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}

export default ProductListingGrid;
