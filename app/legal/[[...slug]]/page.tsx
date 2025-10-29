import { redirect } from 'next/navigation';

interface LegacyLegalPageProps {
  params: { slug?: string[] };
}

export default function LegacyLegalPage({ params }: LegacyLegalPageProps) {
  const slugSegments = params.slug?.filter(Boolean) ?? [];

  if (slugSegments.length === 0) {
    redirect('/');
  }

  const targetPath = `/${slugSegments.join('/')}`;
  redirect(targetPath);
}
