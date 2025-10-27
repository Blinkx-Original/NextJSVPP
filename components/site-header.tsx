import Image from 'next/image';
import Link from 'next/link';

const SUPPORT_PHONE = '1-800-925-6278';
const CUSTOMER_SERVICE_PHONE = '1-801-985-8965';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__logo" aria-label="Home">
          <Image src="/logo.svg" alt="Blinkx" width={96} height={24} priority />
        </Link>
        <nav className="site-header__menu" aria-label="Contact information">
          <a className="site-header__menu-item" href={`tel:${SUPPORT_PHONE.replace(/[^0-9+]/g, '')}`}>
            <span aria-hidden="true" className="site-header__menu-icon">💬</span>
            <span className="site-header__menu-label">Support</span>
            <span className="site-header__menu-value">{SUPPORT_PHONE}</span>
          </a>
          <a className="site-header__menu-item" href={`tel:${CUSTOMER_SERVICE_PHONE.replace(/[^0-9+]/g, '')}`}>
            <span aria-hidden="true" className="site-header__menu-icon">💬</span>
            <span className="site-header__menu-label">Customer Service</span>
            <span className="site-header__menu-value">{CUSTOMER_SERVICE_PHONE}</span>
          </a>
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
