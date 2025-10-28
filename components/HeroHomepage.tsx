import Link from 'next/link';
import styles from './HeroHomepage.module.css';

export default function HeroHomepage() {
  /* ========= EDITABLE ========= */
  const copy = {
    black: 'BlinkX arranges the industrial world. From suppliers to components.',
    grey: 'Find, analyze, and connect with what matters.'
  };

  const ctas = {
    primary: { label: 'Information For Investors', href: '/investors' },
    secondary: { label: 'Rules Of Engagement', href: '/rules' }
  };

  // Gris ya más claro que el del mock. Cambia 500→400 si lo quieres aún más claro.
  const GREY_CLASS = styles.greyText;
  /* ======== /EDITABLE ========= */

  return (
    <section aria-label="Homepage hero" className={styles.hero}>
      <div className={styles.card}>
        <div className={styles.inner}>
          <h1 className={styles.title}>
            <span className={styles.titleBlack}>{copy.black}</span>
            <span className={`${styles.titleGrey} ${GREY_CLASS}`}>{copy.grey}</span>
          </h1>

          <div className={styles.ctas}>
            <Link href={ctas.primary.href} className={styles.primaryCta}>
              {ctas.primary.label}
            </Link>

            <Link href={ctas.secondary.href} className={styles.secondaryCta}>
              {ctas.secondary.label}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
