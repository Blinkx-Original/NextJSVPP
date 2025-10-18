import Link from 'next/link';

export const revalidate = 60;

export default function HomePage() {
  return (
    <section style={{ padding: '4rem 1.5rem', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Virtual Product Pages</h1>
      <p style={{ fontSize: '1.125rem', lineHeight: 1.6 }}>
        Este panel Next.js replica el modelo Virtual Product Pages (VPP) con TiDB, Algolia e integración Cloudflare.
      </p>
      <p style={{ marginTop: '2rem' }}>
        <Link href="/admin">Ir al panel de administración →</Link>
      </p>
    </section>
  );
}
