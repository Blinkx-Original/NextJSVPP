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
const KV_STATE_KEY = 'nextjsvpp:publishing-activity';

interface PublishingActivityState {
  counter: number;
  entries: PublishingActivityEntry[];
}

interface PublishingActivityStateStore {
  read(): Promise<PublishingActivityState>;
  write(state: PublishingActivityState): Promise<void>;
}

function createInitialState(): PublishingActivityState {
  return { counter: 0, entries: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function cloneErrorItem(item: PublishingActivityErrorItem): PublishingActivityErrorItem {
  const clone: PublishingActivityErrorItem = { message: item.message };
  if (item.slug !== undefined) {
    clone.slug = item.slug;
  }
  if (item.code !== undefined) {
    clone.code = item.code;
  }
  if (item.identifier !== undefined) {
    clone.identifier = item.identifier;
  }
  return clone;
}

function cloneEntry(entry: PublishingActivityEntry): PublishingActivityEntry {
  return {
    ...entry,
    metadata: entry.metadata ? { ...entry.metadata } : null,
    error_items: entry.error_items ? entry.error_items.map((item) => cloneErrorItem(item)) : undefined
  };
}

function restoreErrorItemFromState(value: unknown): PublishingActivityErrorItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const message = typeof value.message === 'string' ? value.message : null;
  if (!message) {
    return null;
  }
  const item: PublishingActivityErrorItem = { message };
  if (typeof value.slug === 'string') {
    item.slug = value.slug;
  }
  if (typeof value.code === 'string') {
    item.code = value.code;
  } else if (value.code === null) {
    item.code = null;
  }
  if (typeof value.identifier === 'string') {
    item.identifier = value.identifier;
  }
  return item;
}

function restoreEntryFromState(value: unknown): PublishingActivityEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id : null;
  const type = value.type === 'sitemap' || value.type === 'algolia' ? value.type : null;
  const requested = toInteger(value.requested);
  const processed = toInteger(value.processed);
  const success = toInteger(value.success);
  const skipped = toInteger(value.skipped);
  const errors = toInteger(value.errors);
  const duration = toInteger(value.duration_ms);
  const finishedAt = typeof value.finished_at === 'string' ? value.finished_at : null;

  if (
    !id ||
    !type ||
    requested === null ||
    processed === null ||
    success === null ||
    skipped === null ||
    errors === null ||
    duration === null ||
    !finishedAt
  ) {
    return null;
  }

  const entry: PublishingActivityEntry = {
    id,
    type,
    requested,
    processed,
    success,
    skipped,
    errors,
    duration_ms: duration,
    finished_at: finishedAt,
    metadata: isRecord(value.metadata) ? { ...(value.metadata as Record<string, unknown>) } : null
  };

  if (typeof value.message === 'string') {
    entry.message = value.message;
  } else if (value.message === null) {
    entry.message = null;
  }

  if (Array.isArray(value.error_items)) {
    entry.error_items = value.error_items
      .map((item) => restoreErrorItemFromState(item))
      .filter((item): item is PublishingActivityErrorItem => Boolean(item));
  }

  return entry;
}

function restoreStateFromStorage(value: unknown): PublishingActivityState {
  if (!isRecord(value)) {
    return createInitialState();
  }

  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const entries: PublishingActivityEntry[] = [];
  for (const raw of rawEntries) {
    const entry = restoreEntryFromState(raw);
    if (entry) {
      entries.push(entry);
    }
    if (entries.length >= MAX_ENTRIES) {
      break;
    }
  }

  const counter = (() => {
    const parsed = toInteger(value.counter);
    if (parsed !== null && parsed >= 0) {
      return parsed;
    }
    return entries.length;
  })();

  return {
    counter,
    entries
  };
}

class InMemoryPublishingActivityStore implements PublishingActivityStateStore {
  private state: PublishingActivityState = createInitialState();

  async read(): Promise<PublishingActivityState> {
    return {
      counter: this.state.counter,
      entries: this.state.entries.map((entry) => cloneEntry(entry))
    };
  }

  async write(state: PublishingActivityState): Promise<void> {
    const counter = state.counter >= 0 && Number.isFinite(state.counter) ? Math.trunc(state.counter) : 0;
    const entries = state.entries.slice(0, MAX_ENTRIES).map((entry) => cloneEntry(entry));
    this.state = { counter, entries };
  }
}

class KvPublishingActivityStore implements PublishingActivityStateStore {
  private readonly headers: Record<string, string>;

  constructor(private readonly url: string, token: string) {
    this.headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  private async send<T>(command: (string | number)[]): Promise<T | null> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: this.headers,
      cache: 'no-store',
      body: JSON.stringify(command)
    });

    if (!response.ok) {
      throw new Error(`KV request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { result?: T; error?: string | null };
    if (payload.error) {
      throw new Error(payload.error);
    }
    if (payload.result === undefined || payload.result === null) {
      return null;
    }
    return payload.result;
  }

  async read(): Promise<PublishingActivityState> {
    const raw = await this.send<string | null>(['get', KV_STATE_KEY]);
    if (!raw) {
      return createInitialState();
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      return restoreStateFromStorage(parsed);
    } catch {
      return createInitialState();
    }
  }

  async write(state: PublishingActivityState): Promise<void> {
    const counter = state.counter >= 0 && Number.isFinite(state.counter) ? Math.trunc(state.counter) : 0;
    const entries = state.entries.slice(0, MAX_ENTRIES).map((entry) => cloneEntry(entry));
    const serialized = JSON.stringify({ counter, entries });
    await this.send(['set', KV_STATE_KEY, serialized]);
  }
}

function createPublishingActivityStateStore(): PublishingActivityStateStore {
  const kvUrl = process.env.KV_URL?.trim();
  const kvToken = process.env.KV_TOKEN?.trim();
  if (kvUrl && kvToken) {
    return new KvPublishingActivityStore(kvUrl, kvToken);
  }
  return new InMemoryPublishingActivityStore();
}

const globalForPublishing = globalThis as typeof globalThis & {
  __nextjsvppPublishingActivityStore?: PublishingActivityStateStore;
};

function getPublishingActivityStateStore(): PublishingActivityStateStore {
  if (!globalForPublishing.__nextjsvppPublishingActivityStore) {
    globalForPublishing.__nextjsvppPublishingActivityStore = createPublishingActivityStateStore();
  }
  return globalForPublishing.__nextjsvppPublishingActivityStore;
}

export async function recordPublishingActivity(
  entry: Omit<PublishingActivityEntry, 'id' | 'finished_at'> & {
    finished_at?: string;
  }
): Promise<PublishingActivityEntry> {
  const store = getPublishingActivityStateStore();
  const state = await store.read();
  const currentCounter = state.counter >= 0 && Number.isFinite(state.counter) ? Math.trunc(state.counter) : 0;
  const nextCounter = currentCounter + 1;
  const finalized: PublishingActivityEntry = {
    ...entry,
    id: `run-${nextCounter}`,
    finished_at: entry.finished_at ?? new Date().toISOString(),
    metadata: entry.metadata ? { ...entry.metadata } : null,
    error_items: entry.error_items ? entry.error_items.map((item) => cloneErrorItem(item)) : undefined
  };

  const entries = [finalized, ...state.entries];
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }

  const nextState: PublishingActivityState = {
    counter: nextCounter,
    entries: entries.map((item) => cloneEntry(item))
  };

  await store.write(nextState);
  return cloneEntry(finalized);
}

export async function getPublishingActivity(): Promise<PublishingActivityEntry[]> {
  const store = getPublishingActivityStateStore();
  const state = await store.read();
  return state.entries.map((entry) => cloneEntry(entry));
}

export async function getPublishingActivityById(id: string): Promise<PublishingActivityEntry | null> {
  const store = getPublishingActivityStateStore();
  const state = await store.read();
  const entry = state.entries.find((item) => item.id === id);
  return entry ? cloneEntry(entry) : null;
}

export async function clearPublishingActivity(): Promise<void> {
  const store = getPublishingActivityStateStore();
  await store.write(createInitialState());
}
