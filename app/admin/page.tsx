export const revalidate = 0;

export default function AdminPage() {
  return (
    <section style={{ padding: '4rem 1.5rem', maxWidth: 880, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', color: '#0f172a' }}>Panel de Administración</h1>
      <p style={{ marginTop: '1rem', color: '#475569' }}>
        Esta sección está protegida con Basic Auth. La funcionalidad completa de edición y Cloudflare se implementará en las fases posteriores.
      </p>
    </section>
  );
}
