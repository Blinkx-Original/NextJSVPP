'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import styles from './ProductImageCarousel.module.css';

interface ProductImageCarouselProps {
  images: readonly string[];
  title: string;
  className?: string;
}

export function ProductImageCarousel({ images, title, className }: ProductImageCarouselProps) {
  const sanitizedImages = useMemo(
    () => images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0),
    [images]
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [sanitizedImages]);

  if (sanitizedImages.length === 0) {
    return null;
  }

  const showControls = sanitizedImages.length > 1;

  const handlePrevious = () => {
    setActiveIndex((index) => (index === 0 ? sanitizedImages.length - 1 : index - 1));
  };

  const handleNext = () => {
    setActiveIndex((index) => (index === sanitizedImages.length - 1 ? 0 : index + 1));
  };

  const activeImage = sanitizedImages[activeIndex];

  return (
    <div className={[styles.carousel, className].filter(Boolean).join(' ')}>
      <div className={styles.viewport}>
        <Image
          key={activeImage}
          src={activeImage}
          alt={title}
          width={1200}
          height={675}
          sizes="(max-width: 900px) 100vw, 720px"
          priority={activeIndex === 0}
          className={styles.image}
        />
        {showControls ? (
          <>
            <button
              type="button"
              className={[styles.navButton, styles.navButtonPrevious].join(' ')}
              onClick={handlePrevious}
              aria-label="View previous image"
            >
              <span aria-hidden="true">&#8592;</span>
            </button>
            <button
              type="button"
              className={[styles.navButton, styles.navButtonNext].join(' ')}
              onClick={handleNext}
              aria-label="View next image"
            >
              <span aria-hidden="true">&#8594;</span>
            </button>
          </>
        ) : null}
      </div>
      {showControls ? (
        <div className={styles.thumbnailList}>
          {sanitizedImages.map((image, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                type="button"
                key={`${image}-${index}`}
                className={[styles.thumbnailButton, isActive ? styles.thumbnailButtonActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveIndex(index)}
                aria-label={`View image ${index + 1}`}
                aria-current={isActive ? 'true' : undefined}
              >
                <Image
                  src={image}
                  alt=""
                  width={160}
                  height={90}
                  sizes="80px"
                  className={styles.thumbnailImage}
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
