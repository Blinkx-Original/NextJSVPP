'use client';

import { ReactNode } from 'react';

interface Props {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  analyticsId?: string;
}

export function CtaButton({ href, children, variant = 'secondary', analyticsId }: Props) {
  const background = variant === 'primary' ? '#0f172a' : '#e2e8f0';
  const color = variant === 'primary' ? '#f8fafc' : '#0f172a';
  return (
    <a
      href={href}
      data-analytics-id={analyticsId}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem 1.5rem',
        borderRadius: '999px',
        background,
        color,
        fontWeight: 600,
        textDecoration: 'none',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        boxShadow: variant === 'primary' ? '0 10px 30px rgba(15,23,42,0.3)' : 'none'
      }}
    >
      {children}
    </a>
  );
}
