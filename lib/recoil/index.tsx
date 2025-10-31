"use client";

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react';

type Listener = () => void;

interface Store {
  values: Map<string, unknown>;
  listeners: Map<string, Set<Listener>>;
}

interface AtomOptions<T> {
  key: string;
  default: T;
}

export interface Atom<T> {
  key: string;
  default: T;
}

const RecoilContext = createContext<Store | null>(null);

function ensureStore(store: Store, atom: Atom<unknown>) {
  if (!store.values.has(atom.key)) {
    store.values.set(atom.key, atom.default);
  }
}

function subscribe(store: Store, key: string, listener: Listener) {
  let listeners = store.listeners.get(key);
  if (!listeners) {
    listeners = new Set();
    store.listeners.set(key, listeners);
  }
  listeners.add(listener);
  return () => {
    const current = store.listeners.get(key);
    current?.delete(listener);
    if (current && current.size === 0) {
      store.listeners.delete(key);
    }
  };
}

function notify(store: Store, key: string) {
  const listeners = store.listeners.get(key);
  if (!listeners) {
    return;
  }
  listeners.forEach((listener) => listener());
}

export function RecoilRoot({ children }: { children: ReactNode }) {
  const storeRef = useRef<Store>();
  if (!storeRef.current) {
    storeRef.current = { values: new Map(), listeners: new Map() };
  }
  const value = useMemo(() => storeRef.current!, []);
  return <RecoilContext.Provider value={value}>{children}</RecoilContext.Provider>;
}

export function atom<T>(options: AtomOptions<T>): Atom<T> {
  return { key: options.key, default: options.default };
}

function useStore(): Store {
  const store = useContext(RecoilContext);
  if (!store) {
    throw new Error('Recoil hooks must be used inside a <RecoilRoot>.');
  }
  return store;
}

export function useRecoilState<T>(atomDefinition: Atom<T>): [T, (value: T | ((previous: T) => T)) => void] {
  const store = useStore();
  ensureStore(store, atomDefinition);
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  useEffect(() => subscribe(store, atomDefinition.key, forceUpdate), [store, atomDefinition.key]);

  const setValue = useCallback(
    (value: T | ((previous: T) => T)) => {
      ensureStore(store, atomDefinition);
      const current = store.values.get(atomDefinition.key) as T;
      const next = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
      store.values.set(atomDefinition.key, next);
      notify(store, atomDefinition.key);
    },
    [store, atomDefinition]
  );

  const currentValue = store.values.get(atomDefinition.key) as T;
  return [currentValue, setValue];
}

export function useRecoilValue<T>(atomDefinition: Atom<T>): T {
  const [value] = useRecoilState(atomDefinition);
  return value;
}

export function useSetRecoilState<T>(atomDefinition: Atom<T>): (value: T | ((previous: T) => T)) => void {
  const [, setValue] = useRecoilState(atomDefinition);
  return setValue;
}
