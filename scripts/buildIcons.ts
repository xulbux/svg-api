/**
 * Icon Asset Packer
 *
 * Pre-packs stripped stroke/brand icon datasets and the searchable picker index
 * into `dist/client/*.iconpack` text assets for zero-AST Worker cold starts.
 */

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { icons as deviconPlainSet } from '@iconify-json/devicon-plain';
import { icons as fileIconSet } from '@iconify-json/file-icons';
import { icons as simpleIconSet } from '@iconify-json/simple-icons';
// oxlint-disable-next-line import/no-namespace -- Lucide exports one binding per icon; The whole namespace is the slug lookup table.
import * as lucideIcons from 'lucide-static';
import type { IconPickerIndex, PackedFileIconEntry, PackedSimpleIconSet } from '@/types';

// ---------------------------------------- TYPES ----------------------------------------

/** Evaluated exports of `src/config/icons.ts` loaded dynamically at build time. */
interface IconConfigModule {
  /** Default coordinate box size of File Icons (`512x512`). */
  FILE_ICONS_DEFAULT_SIZE: number;
  /** Number of icons per icon picker body asset page. */
  ICON_PICKER_PAGE_SIZE: number;
  /** Common icon slug aliases mapped to their canonical icon set slugs. */
  ICON_SLUG_ALIASES: Readonly<Record<string, string>>;
  /** Extract the inner markup of an `<svg>` document string. */
  extractInnerSvg: (rawSvg: string) => string | undefined;
  /** Convert a PascalCase Lucide export name into its kebab-case slug. */
  formatLucideSlug: (exportName: string) => string;
  /** Strip redundant attributes from a filled Iconify SVG body. */
  sanitizeBrandIconBody: (rawBody: string) => string;
  /** Sanitize a Devicon Plain SVG body and collapse uniform `currentColor` gradients. */
  sanitizeDeviconPlainBody: (rawBody: string) => string;
}

/** Evaluated exports of `src/site/shared/encoding.ts` loaded dynamically at build time. */
interface EncodingModule {
  /** Matches `[-_.]` characters stripped from brand icon slugs before lookup. */
  BRAND_SLUG_CLEAN_RX: RegExp;
  /** Capitalize `-`/`_`-separated slug parts and join them with `joiner`. */
  capitalizeSlugParts: (slug: string, joiner?: string) => string;
  /** Safe own-property lookup helper. */
  getOwnValue: <V>(record: Readonly<Record<string, V>>, key: string) => V | undefined;
}

// ---------------------------------------- CONSTS ---------------------------------------

/** Generated `.iconpack` file names inside `dist/client/`. */
const ICON_PACK_FILES = [
  'icons-devicon.iconpack',
  'icons-file.iconpack',
  'icons-index.iconpack',
  'icons-lucide.iconpack',
  'icons-simple.iconpack',
] as const;

/** Source `package.json` paths whose version/integrity govern packed icon outputs. */
const UPSTREAM_ICON_PACKAGE_JSONS = [
  'node_modules/@iconify-json/devicon-plain/package.json',
  'node_modules/@iconify-json/file-icons/package.json',
  'node_modules/@iconify-json/simple-icons/package.json',
  'node_modules/lucide-static/package.json',
] as const;

// -------------------------------------- INTERNALS --------------------------------------

/** Compute a SHA-256 source digest over upstream icon package manifests, `src/config/icons.ts`, and this builder script. */
async function computeIconSourceDigest(repoRoot: string): Promise<string> {
  const hash = createHash('sha256');
  const trackedInputs = [
    ...UPSTREAM_ICON_PACKAGE_JSONS,
    'src/config/icons.ts',
    'src/site/shared/encoding.ts',
    'scripts/buildIcons.ts',
  ];
  const contents = await Promise.all(
    trackedInputs.map((relPath) => readFile(path.resolve(repoRoot, relPath)))
  );
  for (let i = 0; i < trackedInputs.length; i += 1) {
    hash.update(trackedInputs[i] ?? '');
    hash.update('\0');
    const fileBytes = contents[i];
    if (fileBytes) {
      hash.update(fileBytes);
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Check whether `dist/client/icons.sha256` matches `expectedDigest` and every `.iconpack` output file exists. */
async function hasUpToDateIconPacks(outDir: string, expectedDigest: string): Promise<boolean> {
  try {
    const rawDigest = await readFile(path.resolve(outDir, 'icons.sha256'), 'utf8');
    if (rawDigest.trim() !== expectedDigest) {
      return false;
    }
    await Promise.all(ICON_PACK_FILES.map((fileName) => access(path.resolve(outDir, fileName))));
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge a secondary brand icon set into `brandSlugs`, deduplicating by both exact and cleaned
 * (`[-_.]`-stripped) slug so preferred sets always win and hyphenated duplicates become aliases.
 */
function mergeBrandIconSet(
  slugs: readonly string[],
  cleanRx: RegExp,
  brandSlugs: Set<string>,
  canonicalByCleanSlug: Map<string, string>,
  brandAliases: Record<string, string>
): void {
  for (const slug of slugs) {
    const cleanSlug = slug.replace(cleanRx, '');
    const existingCanonical = canonicalByCleanSlug.get(cleanSlug);
    if (existingCanonical === undefined) {
      brandSlugs.add(slug);
      canonicalByCleanSlug.set(cleanSlug, slug);
    } else if (slug !== existingCanonical) {
      brandAliases[slug] = existingCanonical;
    }
  }
}

/** Build the searchable `IconPickerIndex` from raw upstream icon packages and `ICON_SLUG_ALIASES`. */
function buildPackedPickerIndex(
  lucideIconMap: Readonly<Record<string, unknown>>,
  lucideTagMap: Readonly<Record<string, readonly string[]>>,
  iconConfig: IconConfigModule,
  encoding: EncodingModule
): IconPickerIndex {
  const { ICON_PICKER_PAGE_SIZE, ICON_SLUG_ALIASES, formatLucideSlug } = iconConfig;
  const { BRAND_SLUG_CLEAN_RX, capitalizeSlugParts, getOwnValue } = encoding;

  const primaryByGlyph = new Map<string, string>();
  const lucideSlugs: string[] = [];
  const lucideAliases: Record<string, string> = {};
  const lucideTags: Record<string, string> = {};

  for (const [slug, tagList] of Object.entries(lucideTagMap)) {
    const glyph = getOwnValue(lucideIconMap, capitalizeSlugParts(slug, ''));
    if (typeof glyph === 'string') {
      const primarySlug = primaryByGlyph.get(glyph);
      if (primarySlug === undefined) {
        primaryByGlyph.set(glyph, slug);
        lucideSlugs.push(slug);
        if (tagList.length > 0) {
          lucideTags[slug] = tagList.join(' ').toLowerCase();
        }
      } else {
        lucideAliases[slug] = primarySlug;
      }
    }
  }

  for (const [exportName, glyph] of Object.entries(lucideIconMap)) {
    const slug = formatLucideSlug(exportName);
    if (typeof glyph === 'string' && capitalizeSlugParts(slug, '') === exportName) {
      const primarySlug = primaryByGlyph.get(glyph);
      if (primarySlug === undefined) {
        primaryByGlyph.set(glyph, slug);
        lucideSlugs.push(slug);
      } else if (slug !== primarySlug) {
        lucideAliases[slug] = primarySlug;
      }
    }
  }

  const brandSlugs = new Set<string>();
  const canonicalByCleanSlug = new Map<string, string>();
  const brandAliases: Record<string, string> = {};
  for (const slug of Object.keys(simpleIconSet.icons)) {
    brandSlugs.add(slug);
    const cleanSlug = slug.replace(BRAND_SLUG_CLEAN_RX, '');
    canonicalByCleanSlug.set(cleanSlug, slug);
    if (cleanSlug !== slug) {
      brandAliases[cleanSlug] = slug;
    }
  }

  for (const [alias, entry] of Object.entries(simpleIconSet.aliases ?? {})) {
    brandAliases[alias] = entry.parent;
    const cleanAlias = alias.replace(BRAND_SLUG_CLEAN_RX, '');
    if (!canonicalByCleanSlug.has(cleanAlias)) {
      canonicalByCleanSlug.set(cleanAlias, entry.parent);
    }
  }

  for (const [alias, target] of Object.entries(ICON_SLUG_ALIASES)) {
    if (
      brandSlugs.has(target) ||
      getOwnValue(deviconPlainSet.icons, target) !== undefined ||
      Object.hasOwn(fileIconSet.icons, target)
    ) {
      const cleanAlias = alias.replace(BRAND_SLUG_CLEAN_RX, '');
      if (!canonicalByCleanSlug.has(cleanAlias)) {
        canonicalByCleanSlug.set(cleanAlias, target);
        brandAliases[cleanAlias] = target;
      }
    }
  }

  mergeBrandIconSet(
    Object.keys(deviconPlainSet.icons),
    BRAND_SLUG_CLEAN_RX,
    brandSlugs,
    canonicalByCleanSlug,
    brandAliases
  );
  mergeBrandIconSet(
    Object.keys(fileIconSet.icons),
    BRAND_SLUG_CLEAN_RX,
    brandSlugs,
    canonicalByCleanSlug,
    brandAliases
  );

  return {
    aliases: { ...ICON_SLUG_ALIASES },
    brandAliases,
    lucideAliases,
    lucideTags,
    pageSize: ICON_PICKER_PAGE_SIZE,
    sets: { brands: [...brandSlugs].toSorted(), lucide: lucideSlugs },
  };
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Generate `dist/client/icons-*.iconpack` plain-text JSON assets when upstream icon packages or `src/config/icons.ts` change.
 * @param repoRoot   Absolute repository root directory.
 */
export async function buildPackedIconAssets(repoRoot: string): Promise<void> {
  const outDir = path.resolve(repoRoot, 'dist', 'client');
  const sourceDigest = await computeIconSourceDigest(repoRoot);
  if (await hasUpToDateIconPacks(outDir, sourceDigest)) {
    return;
  }

  const iconConfigUrl = pathToFileURL(path.resolve(repoRoot, 'src', 'config', 'icons.ts')).href;
  const encodingUrl = pathToFileURL(
    path.resolve(repoRoot, 'src', 'site', 'shared', 'encoding.ts')
  ).href;
  const [iconConfig, encoding] = (await Promise.all([
    import(iconConfigUrl),
    import(encodingUrl),
  ])) as [IconConfigModule, EncodingModule];

  const requireModule = createRequire(import.meta.url);
  const lucideTagMap = requireModule('lucide-static/tags.json') as Record<string, string[]>;
  const lucideIconMap: Readonly<Record<string, unknown>> = lucideIcons;

  const packedLucide: Record<string, string> = {};
  for (const [exportName, rawSvg] of Object.entries(lucideIconMap)) {
    if (typeof rawSvg === 'string') {
      const innerSvg = iconConfig.extractInnerSvg(rawSvg);
      if (innerSvg) {
        packedLucide[exportName] = innerSvg;
      }
    }
  }

  const packedSimpleIcons: Record<string, string> = {};
  for (const [slug, entry] of Object.entries(simpleIconSet.icons)) {
    if (entry.body) {
      packedSimpleIcons[slug] = iconConfig.sanitizeBrandIconBody(entry.body);
    }
  }
  const packedSimpleAliases: Record<string, string> = {};
  for (const [alias, entry] of Object.entries(simpleIconSet.aliases ?? {})) {
    packedSimpleAliases[alias] = entry.parent;
  }
  const packedSimple: PackedSimpleIconSet = {
    aliases: packedSimpleAliases,
    icons: packedSimpleIcons,
  };

  const packedDevicon: Record<string, string> = {};
  for (const [slug, entry] of Object.entries(deviconPlainSet.icons)) {
    if (entry.body) {
      packedDevicon[slug] = iconConfig.sanitizeDeviconPlainBody(entry.body);
    }
  }

  const defaultBoxSize = iconConfig.FILE_ICONS_DEFAULT_SIZE;
  const packedFile: Record<string, PackedFileIconEntry> = {};
  for (const [slug, entry] of Object.entries(fileIconSet.icons)) {
    if (entry.body) {
      const cleanBody = iconConfig.sanitizeBrandIconBody(entry.body);
      const width = entry.width ?? defaultBoxSize;
      const height = entry.height ?? defaultBoxSize;
      packedFile[slug] =
        width === defaultBoxSize && height === defaultBoxSize
          ? cleanBody
          : [cleanBody, width, height];
    }
  }

  const pickerIndex = buildPackedPickerIndex(lucideIconMap, lucideTagMap, iconConfig, encoding);

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.resolve(outDir, 'icons-lucide.iconpack'), JSON.stringify(packedLucide), 'utf8'),
    writeFile(path.resolve(outDir, 'icons-simple.iconpack'), JSON.stringify(packedSimple), 'utf8'),
    writeFile(
      path.resolve(outDir, 'icons-devicon.iconpack'),
      JSON.stringify(packedDevicon),
      'utf8'
    ),
    writeFile(path.resolve(outDir, 'icons-file.iconpack'), JSON.stringify(packedFile), 'utf8'),
    writeFile(path.resolve(outDir, 'icons-index.iconpack'), JSON.stringify(pickerIndex), 'utf8'),
  ]);
  await writeFile(path.resolve(outDir, 'icons.sha256'), `${sourceDigest}\n`, 'utf8');
}
