import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/urls';

export default function robots(): MetadataRoute.Robots {
  const host = headers().get('host') ?? undefined;
  const siteUrl = getSiteUrl(host);

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/'
      }
    ],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
