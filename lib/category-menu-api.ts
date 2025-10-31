import axios from 'axios';
import type { HeaderCategoryItem } from './category-menu-state';

interface CategoriesResponse {
  ok: boolean;
  categories: HeaderCategoryItem[];
  error_code?: string;
  message?: string;
}

export async function fetchHeaderCategories(signal?: AbortSignal): Promise<HeaderCategoryItem[]> {
  const response = await axios.get<CategoriesResponse>('/api/categories', {
    params: { type: 'product', is_published: 1 },
    signal
  });
  if (!response.data.ok) {
    throw new Error(response.data.message || 'Unable to load categories');
  }
  return response.data.categories;
}
