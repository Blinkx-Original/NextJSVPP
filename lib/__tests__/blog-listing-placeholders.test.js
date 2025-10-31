import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const moduleCache = new Map();

function loadTsModule(filePath, overrides = {}) {
  const resolvedPath = filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? filePath : `${filePath}.ts`;
  const absolutePath = path.resolve(resolvedPath);

  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      jsx: ts.JsxEmit.React
    },
    fileName: absolutePath
  });

  const moduleShim = { exports: {} };
  moduleCache.set(absolutePath, moduleShim.exports);

  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) {
      return overrides[specifier];
    }

    if (specifier.endsWith('.css') || specifier.endsWith('.module.css')) {
      return {};
    }

    if (specifier.startsWith('.')) {
      const nextPath = path.resolve(path.dirname(absolutePath), specifier);
      return loadTsModule(nextPath, overrides);
    }

    if (specifier.startsWith('@/')) {
      const nextPath = path.resolve(projectRoot, specifier.slice(2));
      return loadTsModule(nextPath, overrides);
    }

    return require(specifier);
  };

  const wrapper = new Function('require', 'module', 'exports', '__dirname', '__filename', transpiled.outputText);
  wrapper(localRequire, moduleShim, moduleShim.exports, path.dirname(absolutePath), absolutePath);

  moduleCache.set(absolutePath, moduleShim.exports);
  return moduleShim.exports;
}

test('blog listing placeholders slugify and load products', async () => {
  const productCalls = [];

  const overrides = {
    'next/image': function Image() {
      return null;
    },
    'next/link': function Link() {
      return null;
    },
    'next/headers': {
      headers: () => ({
        get: () => null
      })
    },
    'next/navigation': {
      notFound: () => {
        throw new Error('notFound');
      }
    },
    '@/lib/product-cta': {
      CTA_DEFAULT_LABELS: {},
      resolveCtaLabel: () => 'CTA'
    },
    '@/lib/blog-posts': {
      getNormalizedPublishedBlogPost: async () => null
    },
    '@/lib/categories': {
      createVirtualProductCategoryFromSlug: (slug) => ({
        id: BigInt(0),
        type: 'product',
        slug,
        name: slug,
        shortDescription: null,
        longDescription: null,
        heroImageUrl: null,
        lastUpdatedAt: null
      }),
      getPublishedCategoryBySlug: async (slug) => {
        productCalls.push({ fn: 'getPublishedCategoryBySlug', slug });
        return {
          id: BigInt(42),
          type: 'product',
          slug,
          name: 'Máquinas CNC',
          shortDescription: null,
          longDescription: null,
          heroImageUrl: null,
          lastUpdatedAt: null
        };
      },
      resolveProductCategoryBySlugOrName: async () => null,
      getPublishedProductsForCategory: async (category) => {
        productCalls.push({ fn: 'getPublishedProductsForCategory', slug: category.slug });
        return {
          products: [
            {
              id: BigInt(7),
              slug: `${category.slug}-product`,
              title: 'Stub Product',
              shortSummary: 'Summary',
              price: '$100',
              primaryImage: null
            }
          ],
          totalCount: 1
        };
      }
    },
    '@/lib/products': {
      getPublishedProductsBySlugs: async () => []
    },
    '@/lib/request-id': {
      createRequestId: () => 'test-request-id'
    },
    '@/lib/urls': {
      buildBlogPostUrl: () => 'https://example.com/posts/test'
    },
    '@/lib/blog-seo': {
      buildBlogSeo: () => ({ description: '', canonical: 'https://example.com/posts/test', jsonLd: '{}' }),
      buildBlogMetaTitle: () => 'Test Blog Post'
    },
    '@/lib/search-params': {
      parsePageParam: (value) => {
        const parsed = Number.parseInt(value ?? '1', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      },
      resolveSearchParam: (value) => (Array.isArray(value) ? value[0] : value ?? null)
    }
  };

  const modulePath = path.resolve(projectRoot, 'app/b/[slug]/page.tsx');
  const module = loadTsModule(modulePath, overrides);

  const { extractProductListingPlaceholders, loadCategoryListing } = module;

  const html = '<p>Contenido</p><!-- product listing Máquinas CNC -->';
  const extraction = extractProductListingPlaceholders(html);
  assert.equal(extraction.placeholders.length, 1, 'expected a single placeholder');

  const placeholder = extraction.placeholders[0];
  assert.equal(placeholder.config.type, 'category');
  assert.equal(placeholder.config.slug, 'maquinas-cnc');

  const listing = await loadCategoryListing({
    slug: placeholder.config.slug ?? '',
    pageParam: 1,
    pageKey: 'page',
    requestId: 'test'
  });

  assert.ok(listing, 'expected listing data');
  assert.equal(listing.cards.length, 1);
  assert.equal(listing.cards[0].slug, 'maquinas-cnc-product');

  const categoryCall = productCalls.find((entry) => entry.fn === 'getPublishedProductsForCategory');
  assert.ok(categoryCall, 'expected products to be loaded');
  assert.equal(categoryCall.slug, 'maquinas-cnc');
});
