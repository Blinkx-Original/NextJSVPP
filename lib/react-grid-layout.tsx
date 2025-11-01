'use client';

import React, { useEffect, useMemo, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';

export interface Layout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
}

export type Layouts = Record<string, Layout[]>;

export interface ResponsiveProps {
  className?: string;
  children?: ReactNode;
  layouts: Layouts;
  breakpoints: Record<string, number>;
  cols: Record<string, number>;
  margin?: [number, number];
  containerPadding?: [number, number];
  rowHeight?: number;
  measureBeforeMount?: boolean;
  isDraggable?: boolean;
  isResizable?: boolean;
  compactType?: 'vertical' | 'horizontal' | null;
  useCSSTransforms?: boolean;
}

function selectBreakpoint(width: number, breakpoints: Record<string, number>): string {
  const entries = Object.entries(breakpoints).sort(([, a], [, b]) => a - b);
  let current = entries[0]?.[0] ?? 'lg';
  for (const [key, value] of entries) {
    if (width >= value) {
      current = key;
    }
  }
  return current;
}

function normalizeChildren(children: ResponsiveProps['children']): ReactElement[] {
  return React.Children.toArray(children).filter((child): child is ReactElement => React.isValidElement(child));
}

export function Responsive(props: ResponsiveProps) {
  const {
    className,
    children,
    layouts,
    breakpoints,
    cols,
    margin = [0, 0],
    containerPadding = [0, 0]
  } = props;

  const initialWidth = typeof window === 'undefined' ? Math.max(...Object.values(breakpoints)) : window.innerWidth;
  const [width, setWidth] = useState<number>(initialWidth);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleResize = () => {
      setWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [breakpoints]);

  const activeBreakpoint = useMemo(() => selectBreakpoint(width, breakpoints), [width, breakpoints]);
  const activeLayout = useMemo(() => layouts[activeBreakpoint] ?? [], [layouts, activeBreakpoint]);
  const columnCount = cols[activeBreakpoint] ?? activeLayout.length || 1;
  const baseWidth = activeLayout[0]?.w ?? columnCount;
  const itemsPerRow = Math.max(1, Math.floor(columnCount / Math.max(baseWidth, 1)));

  const orderedChildren = useMemo(() => {
    if (!activeLayout.length) {
      return normalizeChildren(children);
    }
    const orderMap = new Map<string, number>();
    activeLayout.forEach((item, index) => {
      orderMap.set(item.i, index);
    });
    return normalizeChildren(children).sort((a, b) => {
      const aKey = a.key?.toString() ?? '';
      const bKey = b.key?.toString() ?? '';
      return (orderMap.get(aKey) ?? 0) - (orderMap.get(bKey) ?? 0);
    });
  }, [children, activeLayout]);

  const gapX = margin[0] ?? 0;
  const gapY = margin[1] ?? 0;
  const paddingX = containerPadding[0] ?? 0;
  const paddingY = containerPadding[1] ?? 0;

  return (
    <div
      className={`rgl-container ${className ?? ''}`.trim()}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${itemsPerRow}, minmax(0, 1fr))`,
        gap: `${gapY}px ${gapX}px`,
        padding: `${paddingY}px ${paddingX}px`
      }}
    >
      {orderedChildren.map((child) => (
        <div key={child.key ?? undefined} className="rgl-item">
          {child}
        </div>
      ))}
    </div>
  );
}

export function WidthProvider<TProps extends object>(Component: ComponentType<TProps>) {
  const Wrapped: ComponentType<TProps> = (props) => <Component {...props} />;
  Wrapped.displayName = `WidthProvider(${Component.displayName ?? Component.name ?? 'Component'})`;
  return Wrapped;
}

export default Responsive;
