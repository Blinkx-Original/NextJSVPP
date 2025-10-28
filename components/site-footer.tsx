import Link from 'next/link';

import { getFooterLinks, isExternalLink } from '@/lib/footer-links';

export function SiteFooter() {
  const links = getFooterLinks();
  const currentYear = new Date().getFullYear();
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Virtual Product Pages';

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <nav className="site-footer__links" aria-label="Enlaces del footer">
          {links.map((link) => {
            const external = isExternalLink(link);
            const linkLabel = (
              <span className="site-footer__link-label">{link.title}</span>
            );

            if (external) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className="site-footer__link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkLabel}
                  <span aria-hidden className="site-footer__link-icon">
                    ↗
                  </span>
                  <span className="sr-only">(se abre en una pestaña nueva)</span>
                </a>
              );
            }

            return (
              <Link key={link.href} href={link.href} className="site-footer__link">
                {linkLabel}
              </Link>
            );
          })}
        </nav>
        <p className="site-footer__copyright">
          © {currentYear} {siteName} — All Rights Reserved
        </p>
      </div>
    </footer>
  );
}
