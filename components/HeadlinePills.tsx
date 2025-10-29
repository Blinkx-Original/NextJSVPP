import Link from "next/link";

import styles from "./HeadlinePills.module.css";

/* =================== EDITABLE CONTENT =================== */
const copy = {
  headingSegments: [
    "Navigate industrial data sets through our",
    "Understand how",
    "and how we protect our",
  ],
  pills: [
    { label: "catalogs", href: "https://blinkx.com/p-cat/industrial/" },
    { label: "we work", href: "/about" },
    { label: "investors", href: "/investors" },
  ],
  footerLink: {
    label: "Explore all capabilities",
    href: "/capabilities",
  },
};
/* ================= /EDITABLE CONTENT ==================== */

export default function HeadlinePills({ className = "" }: { className?: string }) {
  const { headingSegments, pills, footerLink } = copy;
  const combined = headingSegments.flatMap((segment, index) => {
    const elements = [
      <span key={`segment-${index}`} className={styles.textSegment}>
        {segment}
      </span>,
    ];

    if (pills[index]) {
      const pill = pills[index];
      elements.push(
        <Link key={`pill-${index}`} href={pill.href} className={styles.pill}>
          <span>{pill.label}</span>
        </Link>,
      );
    }

    return elements;
  });

  return (
    <section className={`${styles.wrapper} ${className}`} aria-label="Key highlights">
      <div className={styles.card}>
        <h2 className={styles.headline}>{combined}</h2>
        {footerLink ? (
          <p className={styles.footer}>
            <Link href={footerLink.href}>{footerLink.label}</Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
