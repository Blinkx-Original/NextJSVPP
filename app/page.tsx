import HeroHomepage from '@/components/HeroHomepage';
import InlineAlgoliaSearch from '@/components/InlineAlgoliaSearch';

export const revalidate = 60;

export default function HomePage() {
  return (
    <main>
      <HeroHomepage />
      <InlineAlgoliaSearch />
    </main>
  );
}
