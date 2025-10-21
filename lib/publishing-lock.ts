export type PublishingLockType = 'sitemap' | 'algolia';

const locks: Record<PublishingLockType, boolean> = {
  sitemap: false,
  algolia: false
};

export function acquirePublishingLock(type: PublishingLockType): boolean {
  if (locks[type]) {
    return false;
  }
  locks[type] = true;
  return true;
}

export function releasePublishingLock(type: PublishingLockType): void {
  locks[type] = false;
}

export function isPublishingLockActive(type: PublishingLockType): boolean {
  return locks[type];
}
