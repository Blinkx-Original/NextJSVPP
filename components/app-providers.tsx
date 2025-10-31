"use client";

import { ReactNode } from 'react';
import { RecoilRoot } from 'recoil';

export function AppProviders({ children }: { children: ReactNode }) {
  return <RecoilRoot>{children}</RecoilRoot>;
}
