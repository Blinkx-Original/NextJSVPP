import HeroHomepage from '@/components/HeroHomepage';
import HeadlinePills from '@/components/HeadlinePills';
import InlineAlgoliaSearch from '@/components/InlineAlgoliaSearch';

export const revalidate = 60;

export default function HomePage() {
  return (
    <main>
      <HeroHomepage />
      <InlineAlgoliaSearch />
      <HeadlinePills />
    </main>
  );
}
