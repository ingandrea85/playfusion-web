// Style-Dictionary pipeline (ADR-008 PS-B). Source tokens are the Figma export under
// design/figma-export/; outputs the CSS custom properties (src/tokens.css) and the ES6
// token constants (src/lib/tokens.generated.ts) consumed by @playfusion/ui.
//
// Co-located inside libs/tokens so the design system is self-contained in the monorepo.
// Run with `npm run tokens:build -w @playfusion/tokens` (or `npm run tokens:build` at root).
import StyleDictionary from 'style-dictionary';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..'); // libs/tokens

const SOURCE_GLOB = 'design/figma-export/**/*.json';
const SOURCE_DIR = 'design/figma-export';
const CSS_OUT_DIR = 'src/';
const TS_OUT_DIR = 'src/lib/';
const CSS_OUT_FILE = 'tokens.css';
const TS_OUT_FILE = 'tokens.generated.ts';

const sourceDirAbs = resolve(ROOT, SOURCE_DIR);
if (!existsSync(sourceDirAbs)) {
  console.error(`✗ Source directory not found: ${sourceDirAbs}`);
  process.exit(1);
}

const sd = new StyleDictionary({
  source: [resolve(ROOT, SOURCE_GLOB)],
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: resolve(ROOT, CSS_OUT_DIR) + '/',
      files: [
        {
          destination: CSS_OUT_FILE,
          format: 'css/variables',
          // outputReferences preserves alias relationships once Tokens Studio introduces them
          options: { outputReferences: true },
        },
      ],
    },
    ts: {
      transformGroup: 'js',
      buildPath: resolve(ROOT, TS_OUT_DIR) + '/',
      files: [
        {
          destination: TS_OUT_FILE,
          format: 'javascript/es6',
        },
      ],
    },
  },
});

try {
  await sd.buildAllPlatforms();
} catch (err) {
  console.error('✗ Style Dictionary build failed:', err.message);
  process.exit(1);
}

const cssOutPath = resolve(ROOT, CSS_OUT_DIR, CSS_OUT_FILE);
const cssContent = readFileSync(cssOutPath, 'utf8');
if (!cssContent.includes('--')) {
  console.error(`✗ Generated ${CSS_OUT_FILE} contains no custom properties — source JSON may be empty`);
  process.exit(1);
}

console.log('✓ Tokens built');
