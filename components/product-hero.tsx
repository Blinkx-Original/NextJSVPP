import Image from 'next/image';
import { resolveCtaLabel } from '@/lib/product-cta';
import { Product, resolvePrimaryCta } from '@/lib/products';
import { CtaButton } from './cta-button';

interface Props {
  product: Product;
}

export function ProductHero({ product }: Props) {
  const primary = resolvePrimaryCta(product);
  const ctas = [
    {
      type: 'lead' as const,
      url: product.ctas.lead,
      label: resolveCtaLabel('lead', product.ctaLabels.lead)
    },
    {
      type: 'affiliate' as const,
      url: product.ctas.affiliate,
      label: resolveCtaLabel('affiliate', product.ctaLabels.affiliate)
    },
    {
      type: 'stripe' as const,
      url: product.ctas.stripe,
      label: resolveCtaLabel('stripe', product.ctaLabels.stripe)
    },
    {
      type: 'paypal' as const,
      url: product.ctas.paypal,
      label: resolveCtaLabel('paypal', product.ctaLabels.paypal)
    }
  ].filter((cta) => Boolean(cta.url));

  const gallery = product.images.length > 0 ? product.images : ['https://dummyimage.com/1200x675/0f172a/ffffff&text=Producto'];

  return (
    <article style={{ padding: '4rem 1.5rem', maxWidth: 960, margin: '0 auto' }}>
      <header>
        {product.brand ? (
          <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', fontSize: '0.875rem' }}>
            {product.brand}
          </p>
        ) : null}
        <h1 style={{ fontSize: '2.75rem', marginBottom: '0.75rem', color: '#0f172a' }}>{product.title}</h1>
        {product.model ? (
          <p style={{ fontWeight: 600, color: '#1e293b' }}>{product.model}</p>
        ) : null}
        {product.sku ? (
          <p style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.95rem' }}>SKU: {product.sku}</p>
        ) : null}
        {product.shortSummary ? (
          <p style={{ marginTop: '1.5rem', fontSize: '1.125rem', lineHeight: 1.7, color: '#334155' }}>{product.shortSummary}</p>
        ) : null}
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 420 }}>
          {ctas.map((cta) => {
            const isPrimary = primary?.type === cta.type;
            return (
              <CtaButton
                key={cta.type}
                href={cta.url!}
                variant={isPrimary ? 'primary' : 'secondary'}
                analyticsId={`cta-${cta.type}`}
              >
                {cta.label}
              </CtaButton>
            );
          })}
        </div>
      </header>
      <section style={{ marginTop: '3rem', display: 'grid', gap: '1rem' }}>
        {gallery.map((src, index) => (
          <figure
            key={src}
            style={{
              borderRadius: '1rem',
              overflow: 'hidden',
              backgroundColor: '#e2e8f0',
              border: '1px solid #cbd5f5'
            }}
          >
            <Image
              src={src}
              alt={`${product.title} imagen ${index + 1}`}
              width={1280}
              height={720}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />
          </figure>
        ))}
      </section>
      {product.descriptionHtml ? (
        <section style={{ marginTop: '3rem', color: '#1f2937', fontSize: '1.05rem', lineHeight: 1.75 }}>
          <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        </section>
      ) : null}
    </article>
  );
}
