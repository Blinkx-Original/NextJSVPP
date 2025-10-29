import './globals.css';
import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';

import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Virtual Product Pages';

// Drop your favicon at app/icon.png (Next.js will use it automatically).

export const metadata: Metadata = {
  title: {
    default: siteName,
    template: `%s | ${siteName}`
  },
  description: 'Virtual Product Pages built with Next.js and TiDB.',
  openGraph: {
    title: siteName,
    siteName
  },
  twitter: {
    card: 'summary_large_image'
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
