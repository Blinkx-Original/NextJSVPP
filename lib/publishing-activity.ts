export type PublishingActivityType = 'sitemap' | 'algolia';

export interface PublishingActivityErrorItem {
  slug?: string;
  message: string;
  code?: string | null;
  identifier?: string;
}

export interface PublishingActivityEntry {
  id: string;
  type: PublishingActivityType;
  requested: number;
  processed: number;
  success: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  finished_at: string;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  error_items?: PublishingActivityErrorItem[];
}

const MAX_ENTRIES = 40;

let counter = 0;
const activity: PublishingActivityEntry[] = [];

function nextId(): string {
  counter += 1;
  return `run-${counter}`;
}

function cloneEntry(entry: PublishingActivityEntry): PublishingActivityEntry {
  return {
    ...entry,
    metadata: entry.metadata ? { ...entry.metadata } : null,
    error_items: entry.error_items ? entry.error_items.map((item) => ({ ...item })) : undefined
  };
}

export function recordPublishingActivity(
  entry: Omit<PublishingActivityEntry, 'id' | 'finished_at'> & {
    finished_at?: string;
  }
): PublishingActivityEntry {
  const finalized: PublishingActivityEntry = {
    ...entry,
    id: nextId(),
    finished_at: entry.finished_at ?? new Date().toISOString(),
    metadata: entry.metadata ? { ...entry.metadata } : null,
    error_items: entry.error_items ? entry.error_items.map((item) => ({ ...item })) : undefined
  };

  activity.unshift(finalized);
  if (activity.length > MAX_ENTRIES) {
    activity.length = MAX_ENTRIES;
  }

  return cloneEntry(finalized);
}

export function getPublishingActivity(): PublishingActivityEntry[] {
  return activity.map(cloneEntry);
}

export function getPublishingActivityById(id: string): PublishingActivityEntry | null {
  const entry = activity.find((item) => item.id === id);
  return entry ? cloneEntry(entry) : null;
}

export function clearPublishingActivity(): void {
  activity.length = 0;
  counter = 0;
}
