import { atom } from 'recoil';

export interface HeaderCategoryItem {
  slug: string;
  name: string;
}

export const headerCategoryListState = atom<HeaderCategoryItem[]>({
  key: 'headerCategoryListState',
  default: []
});

export const activeHeaderCategoryState = atom<string | null>({
  key: 'activeHeaderCategoryState',
  default: null
});
