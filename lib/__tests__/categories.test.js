import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';

const moduleCache = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

function loadTsModule(filePath) {
  const withExtension = filePath.endsWith('.ts') ? filePath : `${filePath}.ts`;
  const absolutePath = path.resolve(withExtension);

  if (moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true
    },
    fileName: absolutePath
  });

  const module = { exports: {} };
  moduleCache.set(absolutePath, module.exports);

  const localRequire = (specifier) => {
    if (specifier.startsWith('.')) {
      const nextPath = path.resolve(path.dirname(absolutePath), specifier);
      return loadTsModule(nextPath);
    }
    return require(specifier);
  };

  const wrapper = new Function('require', 'module', 'exports', '__dirname', '__filename', transpiled.outputText);
  wrapper(localRequire, module, module.exports, path.dirname(absolutePath), absolutePath);

  moduleCache.set(absolutePath, module.exports);
  return module.exports;
}

const { buildCategoryVariants } = loadTsModule(path.resolve(__dirname, '..', 'categories.ts'));

test('buildCategoryVariants matches Industrial Robots rows', () => {
  const variants = buildCategoryVariants({ slug: 'industrial-robots', name: 'Industrial Robots' });

  assert.ok(variants.includes('industrial-robots'), 'includes original slug');

  const normalizedRow = 'Industrial Robots'.trim().toLowerCase();
  assert.ok(variants.includes(normalizedRow), 'matches normalized category value');

  assert.ok(variants.includes('industrialrobots'), 'includes collapsed variant');
});
