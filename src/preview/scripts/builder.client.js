// @ts-check
/**
 * Builder client script – Schema-driven URL builder for `/builder/:kind`: Form state, URL and snippet generation, live previews, shareable state, and the searchable icon picker.
 *
 * The pure helpers (encoding, path building, prefill parsing, icon slug resolution) run without a DOM
 * and are exposed as `svgBuilderCore` when no `document` exists, so the test suite verifies them
 * against the Worker's route parser.
 */

(function initBuilderClient() {
  /** @typedef {import('../../types/builder').BuilderField} BuilderField */
  /** @typedef {import('../../types/builder').BuilderOption} BuilderOption */
  /** @typedef {import('../../types/builder').BuilderSchema} BuilderSchema */
  /** @typedef {import('../../types/builder').BuilderServiceOption} BuilderServiceOption */
  /** @typedef {import('../../types/icon').IconPickerIndex} IconPickerIndex */
  /** @typedef {import('../../types/icon').IconPickerSetId} IconPickerSetId */
  /** @typedef {Record<string, string>} BuilderState */
  /** @typedef {{ missing: string[], path: string }} BuildResult */
  /** @typedef {{ html: string, markdown: string, url: string }} SnippetSet */
  /** @typedef {[className: string, text: string]} HighlightToken */
  /** @typedef {{ prefix: string, query: URLSearchParams, segments: string[] }} ParsedRoute */
  /** @typedef {{ page: number, set: IconPickerSetId }} IconLocation */

  // ---------------------------------------- CONSTS ---------------------------------------

  /** Delay in milliseconds before a changed URL is previewed and written to the address bar. */
  const PREVIEW_DEBOUNCE_MS = 250;

  /** Number of icon picker tiles rendered per chunk (more are appended while scrolling). */
  const PICKER_CHUNK_SIZE = 240;

  /** Duration in milliseconds of the share button feedback. */
  const SHARE_FEEDBACK_MS = 1500;

  /** Maximum number of unknown icon slugs listed in a validation hint. */
  const MAX_LISTED_UNKNOWN_ICONS = 6;

  /** Animation modifiers offered per inline data widget kind (parsed by `parsePercentageAndPulse`). */
  /** @type {Readonly<Record<string, readonly string[]>>} */
  const SPECIAL_MODIFIERS = { bar: ['', 'static'], ring: ['', 'pulse'] };

  /** Labels of the inline data widget modifiers. */
  /** @type {Readonly<Record<string, string>>} */
  const MODIFIER_LABELS = { '': 'Default', pulse: 'Pulse', static: 'Static' };

  /** SVG paint attributes of icon picker glyphs per set. */
  /** @type {Readonly<Record<IconPickerSetId, Readonly<Record<string, string>>>>} */
  const GLYPH_PAINT_ATTRS = {
    brands: { fill: 'currentColor' },
    lucide: {
      fill: 'none',
      stroke: 'currentColor',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
    },
  };

  // ------------------------------------ REGEX PATTERNS -----------------------------------

  /** Matches percent-escaped characters that stay readable in paths and query values (`,` `:` `;` `@` `|`). */
  const READABLE_ESCAPE_RX = /%(?:2C|3A|3B|40|7C)/g;

  /** Matches percent-escaped spaces. */
  const ESCAPED_SPACE_RX = /%20/g;

  /** Matches parentheses (escaped so Markdown link targets never end early). */
  const PARENTHESIS_RX = /[()]/g;

  /** Matches `+` characters in URL path segments for space decoding. */
  const PLUS_SIGN_RX = /\+/g;

  /** Matches comma or whitespace separators in list-style payloads. */
  const LIST_SEPARATOR_RX = /[,\s]+/;

  /** Matches stack DSL separators between icon slugs (`,` `|` `;` and whitespace). */
  const STACK_SEPARATOR_RX = /[,|;\s]+/;

  /** Matches a stack DSL separator (or whitespace) at the end of the text before the cursor. */
  const TRAILING_STACK_SEPARATOR_RX = /[,|;\s]$/;

  /** Matches a trailing `:N` column suffix of a stack group. */
  const COLUMN_SUFFIX_RX = /:\d*$/;

  /** Matches line breaks (with surrounding spaces) in the stack groups textarea. */
  const LINE_BREAK_RX = /\s*\n\s*/g;

  /** Matches remaining whitespace in the stack groups textarea. */
  const WHITESPACE_RX = /\s+/g;

  /** Matches hyphen or underscore word separators in icon slugs. */
  const SLUG_SEPARATOR_RX = /[-_]/;

  /** Matches hyphen, underscore, or dot characters in brand icon slugs. */
  const BRAND_SLUG_CLEAN_RX = /[-_.]/g;

  /** Matches characters escaped inside Markdown image alt text. */
  const MARKDOWN_ALT_RX = /[[\]\\]/g;

  /** Matches characters escaped inside HTML attribute values. */
  const HTML_ATTR_RX = /[&"<>]/g;

  // -------------------------------------- INTERNALS --------------------------------------

  /**
   * Encode text for a URL path segment the way `decodeSegment` decodes it (spaces become `+`).
   * @param {string} text   Raw segment text.
   * @returns {string}
   */
  function encodeSegment(text) {
    return encodeURIComponent(text)
      .replace(ESCAPED_SPACE_RX, '+')
      .replace(READABLE_ESCAPE_RX, decodeURIComponent)
      .replace(PARENTHESIS_RX, (char) => (char === '(' ? '%28' : '%29'));
  }

  /**
   * Decode a raw URL path segment exactly like the Worker (`+` becomes a space).
   * @param {string} raw   Raw path segment.
   * @returns {string}
   */
  function decodeSegment(raw) {
    const withSpaces = raw.replace(PLUS_SIGN_RX, ' ');
    try {
      return decodeURIComponent(withSpaces);
    } catch {
      return withSpaces;
    }
  }

  /**
   * Check whether a field is shown for the current state.
   * @param {BuilderField} field
   * @param {BuilderState} state
   * @returns {boolean}
   */
  function isFieldVisible(field, state) {
    return !field.showWhen || field.showWhen.values.includes(state[field.showWhen.field] ?? '');
  }

  /**
   * Find a service preset of the service badge builder.
   * @param {BuilderSchema} schema
   * @param {string | undefined} key   Service route key.
   * @returns {BuilderServiceOption | undefined}
   */
  function findService(schema, key) {
    return schema.services?.find((service) => service.key === key);
  }

  /**
   * Compose an `?icon=` value from its left and right slugs (`none,right` or the `,right` preset shorthand).
   * @param {string} left             Left slug (`''` for none).
   * @param {string} right            Right slug (`''` for none).
   * @param {boolean} hasPresetIcon   Whether an empty left slug keeps a preset icon (service badges).
   * @returns {string}
   */
  function composeIconPair(left, right, hasPresetIcon) {
    const leftSlug = left.trim();
    const rightSlug = right.trim();
    if (!rightSlug) {
      return leftSlug;
    }
    return `${leftSlug || (hasPresetIcon ? '' : 'none')},${rightSlug}`;
  }

  /**
   * Split an `?icon=` value into its left and right slugs.
   * @param {string} value           Serialized value.
   * @param {boolean} hasPresetIcon   Whether `none` is meaningful on the left (service badges).
   * @returns {[left: string, right: string]}
   */
  function splitIconPair(value, hasPresetIcon) {
    const commaIndex = value.indexOf(',');
    if (commaIndex === -1) {
      return [value.trim(), ''];
    }
    const left = value.slice(0, commaIndex).trim();
    const right = value.slice(commaIndex + 1).trim();
    return [left === 'none' && !hasPresetIcon ? '' : left, right];
  }

  /**
   * Compose an `?anim=` value from the sheen toggle and up to two icon motions.
   * @param {boolean} hasSheen   Whether the surface sheen is enabled.
   * @param {string} left        Left (or only) icon motion (`''` for static).
   * @param {string} right       Right icon motion (`''` for static).
   * @returns {string}
   */
  function composeAnim(hasSheen, left, right) {
    const tokens = hasSheen ? ['sheen'] : [];
    if (right) {
      tokens.push(left || 'default', right);
    } else if (left) {
      tokens.push(left);
    }
    return tokens.join(',');
  }

  /**
   * Split an `?anim=` value into the sheen toggle and icon motions.
   * @param {string} value   Serialized value.
   * @returns {{ hasSheen: boolean, left: string, right: string }}
   */
  function splitAnim(value) {
    const motions = [];
    let hasSheen = false;
    for (const token of value.trim().toLowerCase().split(LIST_SEPARATOR_RX)) {
      if (token === 'sheen') {
        hasSheen = true;
      } else if (token) {
        motions.push(token === 'default' ? '' : token);
      }
    }
    return { hasSheen, left: motions[0] ?? '', right: motions[1] ?? '' };
  }

  /**
   * Compose a `?special=` value from the widget kind, payload, and modifier.
   * @param {string} kind       Widget kind (`''` for none).
   * @param {string} payload    Widget data.
   * @param {string} modifier   Optional `pulse` / `static` modifier.
   * @returns {string}
   */
  function composeSpecial(kind, payload, modifier) {
    const cleanPayload = payload.trim();
    if (!kind || !cleanPayload) {
      return '';
    }
    return modifier ? `${kind}:${cleanPayload}:${modifier}` : `${kind}:${cleanPayload}`;
  }

  /**
   * Split a `?special=` value into its widget kind, payload, and modifier.
   * @param {string} value   Serialized value.
   * @returns {{ kind: string, modifier: string, payload: string }}
   */
  function splitSpecial(value) {
    const colonIndex = value.indexOf(':');
    if (colonIndex <= 0) {
      return { kind: '', modifier: '', payload: '' };
    }
    const kind = value.slice(0, colonIndex).trim().toLowerCase();
    let payload = value.slice(colonIndex + 1);
    let modifier = '';
    const modifiers = SPECIAL_MODIFIERS[kind];
    const lastColon = payload.lastIndexOf(':');
    if (modifiers && lastColon !== -1) {
      const candidate = payload
        .slice(lastColon + 1)
        .trim()
        .toLowerCase();
      if (modifiers.includes(candidate)) {
        modifier = candidate;
        payload = payload.slice(0, lastColon);
      }
    }
    return { kind, modifier, payload: payload.trim() };
  }

  /**
   * Split a `?size=` value into a named preset or a custom number.
   * @param {string} value                     Serialized value.
   * @param {readonly BuilderOption[]} options   Named preset options.
   * @returns {{ custom: string, preset: string }}
   */
  function splitSize(value, options) {
    const clean = value.trim().toLowerCase();
    if (!clean) {
      return { custom: '', preset: '' };
    }
    return options.some((option) => option.value === clean)
      ? { custom: '', preset: clean }
      : { custom: clean, preset: 'custom' };
  }

  /**
   * Normalize the stack groups textarea into the `/stack` DSL (line breaks start new row bands).
   * @param {string} value   Raw textarea value.
   * @returns {string}
   */
  function normalizeStackGroups(value) {
    return value.trim().replace(LINE_BREAK_RX, ';').replace(WHITESPACE_RX, '');
  }

  /**
   * Collect the icon slugs of a `/stack` DSL string (without `:N` column suffixes).
   * @param {string} groups   Stack DSL.
   * @returns {string[]}
   */
  function collectStackSlugs(groups) {
    const slugs = [];
    for (const token of normalizeStackGroups(groups).split(STACK_SEPARATOR_RX)) {
      const slug = token.replace(COLUMN_SUFFIX_RX, '');
      if (slug) {
        slugs.push(slug);
      }
    }
    return slugs;
  }

  /**
   * Build the query string of every visible, non-empty query parameter field.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {string} `''` or `?key=value&…`.
   */
  function buildQuery(schema, state) {
    const pairs = [];
    for (const field of schema.fields) {
      const value = (state[field.id] ?? '').trim();
      if (field.param && value && isFieldVisible(field, state)) {
        pairs.push(`${field.param}=${encodeSegment(value)}`);
      }
    }
    return pairs.length > 0 ? `?${pairs.join('&')}` : '';
  }

  /**
   * Read a trimmed state value (`''` when unset).
   * @param {BuilderState} state
   * @param {string} id   Field ID.
   * @returns {string}
   */
  function readState(state, id) {
    return (state[id] ?? '').trim();
  }

  /**
   * Build a `/<prefix>/:label[/:value]` path (badges and buttons; an empty value omits its segment).
   * @param {string} prefix   Route prefix.
   * @param {string} label
   * @param {string} value
   * @returns {string}
   */
  function buildLabelValuePathname(prefix, label, value) {
    return `/${prefix}/${encodeSegment(label)}${value ? `/${encodeSegment(value)}` : ''}`;
  }

  /**
   * Build the `/badge/:service/[:owner/]:target/:metric` path of the service badge builder.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {string}
   */
  function buildServicePathname(schema, state) {
    const service = findService(schema, readState(state, 'service'));
    const owner = service && service.ownerMode !== 'none' ? readState(state, 'owner') : '';
    const rawTarget = readState(state, 'target');
    // Multi-segment targets (e.g., Go module paths) keep their `/` separators between encoded segments.
    const target =
      service && service.maxTargetSegments > 1
        ? rawTarget.split('/').filter(Boolean).map(encodeSegment).join('/')
        : encodeSegment(rawTarget);
    const ownerPart = owner ? `${encodeSegment(owner)}/` : '';
    return `/badge/${encodeSegment(readState(state, 'service'))}/${ownerPart}${target}/${encodeSegment(readState(state, 'metric'))}`;
  }

  /**
   * Build the path segments of an element kind (without the query string).
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {string}
   */
  function buildPathname(schema, state) {
    switch (schema.kind) {
      case 'badge': {
        return readState(state, 'type') === 'status'
          ? `/badge/status/${encodeSegment(readState(state, 'state') || 'online')}/${encodeSegment(readState(state, 'text'))}`
          : buildLabelValuePathname('badge', readState(state, 'label'), readState(state, 'value'));
      }
      case 'button': {
        return buildLabelValuePathname(
          'button',
          readState(state, 'label'),
          readState(state, 'value')
        );
      }
      case 'icon': {
        return `/icon/${encodeSegment(readState(state, 'icon'))}`;
      }
      case 'quote': {
        const author = readState(state, 'author');
        const text = encodeSegment(readState(state, 'text'));
        return author ? `/quote/${encodeSegment(author)}/${text}` : `/quote/${text}`;
      }
      case 'service': {
        return buildServicePathname(schema, state);
      }
      case 'stack': {
        return `/stack/${encodeSegment(normalizeStackGroups(readState(state, 'groups')))}`;
      }
      default: {
        return '/';
      }
    }
  }

  /**
   * Build the root-relative URL of the current state, listing required fields that are still empty.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {BuildResult}
   */
  function buildPath(schema, state) {
    const missing = [];
    for (const field of schema.fields) {
      if (field.isRequired && isFieldVisible(field, state) && !readState(state, field.id)) {
        missing.push(field.label);
      }
    }
    const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
    if (service?.ownerMode === 'required' && !readState(state, 'owner')) {
      missing.push('Owner');
    }
    return { missing, path: `${buildPathname(schema, state)}${buildQuery(schema, state)}` };
  }

  /**
   * Read the first present query parameter of a field (canonical name, then aliases).
   * @param {URLSearchParams} query
   * @param {readonly string[]} names
   * @returns {string | undefined}
   */
  function readQueryParam(query, names) {
    for (const name of names) {
      const value = query.get(name);
      if (value !== null) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * Split a root-relative path or absolute URL into its route prefix, decoded segments, and query.
   * @param {string} rawPath
   * @param {string} origin   Base origin for root-relative paths.
   * @returns {ParsedRoute | undefined}
   */
  function parseRoute(rawPath, origin) {
    if (!URL.canParse(rawPath, origin)) {
      return undefined;
    }
    const url = new URL(rawPath, origin);
    const rawParts = url.pathname.split('/');
    const segments = rawParts.slice(2).map(decodeSegment);
    if (segments.length > 1 && segments.at(-1) === '') {
      segments.pop();
    }
    return { prefix: (rawParts[1] ?? '').toLowerCase(), query: url.searchParams, segments };
  }

  /**
   * Path segment parsers per element kind; Each one fills `state` and reports whether the route belongs to the builder.
   * @type {Readonly<Record<string, (state: BuilderState, route: ParsedRoute, schema: BuilderSchema) => boolean>>}
   */
  const PATH_PARSERS = {
    badge(state, { prefix, segments }) {
      const [first = '', second = '', third = ''] = segments;
      if (prefix !== 'badge' || segments.length > 3) {
        return false;
      }
      if (segments.length === 3) {
        Object.assign(state, { state: second.toLowerCase(), text: third, type: 'status' });
        return first.toLowerCase() === 'status';
      }
      Object.assign(state, { label: first, state: 'online', type: 'static', value: second });
      return true;
    },
    button(state, { prefix, segments }) {
      Object.assign(state, { label: segments[0] ?? '', value: segments[1] ?? '' });
      return (prefix === 'button' || prefix === 'btn') && segments.length <= 2;
    },
    icon(state, { prefix, segments }) {
      state.icon = segments[0] ?? '';
      return prefix === 'icon' && segments.length === 1;
    },
    quote(state, { prefix, query, segments }) {
      const hasAuthorSegment = segments.length === 2;
      state.author = hasAuthorSegment ? (segments[0] ?? '') : (query.get('author') ?? '');
      state.text =
        (hasAuthorSegment ? segments[1] : segments[0]) ||
        (readQueryParam(query, ['text', 'quote']) ?? '');
      const center = query.get('center');
      if (!state.layout && (center === 'true' || center === '1')) {
        state.layout = 'vertical';
      }
      return prefix === 'quote' && segments.length <= 2;
    },
    service(state, { prefix, segments }, schema) {
      const service = findService(schema, (segments[0] ?? '').toLowerCase());
      if (prefix !== 'badge' || !service || segments.length < 3) {
        return false;
      }
      state.service = service.key;
      state.metric = segments.at(-1) ?? '';
      if (service.maxTargetSegments > 1) {
        state.target = segments.slice(1, -1).join('/');
      } else if (segments.length === 4) {
        state.owner = segments[1] ?? '';
        state.target = segments[2] ?? '';
      } else {
        state.target = segments[1] ?? '';
      }
      return true;
    },
    stack(state, { prefix, query, segments }) {
      state.groups = segments[0] || (readQueryParam(query, ['groups', 'icons', 'i']) ?? '');
      return prefix === 'stack' && segments.length <= 1;
    },
  };

  /**
   * Parse an existing SVG URL (path and query) into builder state ("Open in Builder" and shared links).
   * @param {BuilderSchema} schema
   * @param {string} rawPath   Root-relative path or absolute URL.
   * @returns {BuilderState | undefined} State with every field set, or `undefined` when the path belongs to another builder.
   */
  function parsePath(schema, rawPath) {
    const route = parseRoute(rawPath, schema.origin);
    const parsePathSegments = PATH_PARSERS[schema.kind];
    if (!route || !parsePathSegments) {
      return undefined;
    }
    /** @type {BuilderState} */
    const state = {};
    for (const field of schema.fields) {
      state[field.id] = field.param
        ? (readQueryParam(route.query, [field.param, ...(field.aliases ?? [])]) ?? '')
        : '';
    }
    return parsePathSegments(state, route, schema) ? state : undefined;
  }

  /**
   * Build the default alt text of the current state.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {string}
   */
  function buildAltText(schema, state) {
    switch (schema.kind) {
      case 'badge': {
        const parts =
          readState(state, 'type') === 'status'
            ? [`Status ${readState(state, 'state') || 'online'}`, readState(state, 'text')]
            : [readState(state, 'label'), readState(state, 'value')];
        return parts.filter(Boolean).join(': ') || 'Badge';
      }
      case 'button': {
        return (
          [readState(state, 'label'), readState(state, 'value')].filter(Boolean).join(' ') ||
          'Button'
        );
      }
      case 'icon': {
        return readState(state, 'icon') || 'Icon';
      }
      case 'quote': {
        return readState(state, 'author') ? `Quote by ${readState(state, 'author')}` : 'Quote';
      }
      case 'service': {
        const service = findService(schema, readState(state, 'service'));
        return (
          readState(state, 'label') ||
          [service?.title, readState(state, 'target'), readState(state, 'metric')]
            .filter(Boolean)
            .join(' ')
        );
      }
      default: {
        return 'Tech Stack';
      }
    }
  }

  /**
   * Escape a value for a double-quoted HTML attribute.
   * @param {string} value
   * @returns {string}
   */
  function escapeHtmlAttribute(value) {
    return value.replace(HTML_ATTR_RX, (char) => `&#${char.codePointAt(0)};`);
  }

  /**
   * Join highlight tokens into their plain text.
   * @param {HighlightToken[]} tokens
   * @returns {string}
   */
  function joinTokens(tokens) {
    return tokens.map((token) => token[1]).join('');
  }

  /**
   * Split an absolute SVG URL into highlight tokens (base, `?`, keys, `=`, values, `&`).
   * @param {string} url
   * @returns {HighlightToken[]}
   */
  function tokenizeUrl(url) {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) {
      return [['hl-url', url]];
    }
    /** @type {HighlightToken[]} */
    const tokens = [
      ['hl-url', url.slice(0, queryIndex)],
      ['hl-op', '?'],
    ];
    const pairs = url.slice(queryIndex + 1).split('&');
    for (let i = 0; i < pairs.length; i += 1) {
      if (i > 0) {
        tokens.push(['hl-op', '&']);
      }
      const equalsIndex = pairs[i].indexOf('=');
      if (equalsIndex === -1) {
        tokens.push(['hl-key', pairs[i]]);
      } else {
        tokens.push(
          ['hl-key', pairs[i].slice(0, equalsIndex)],
          ['hl-op', '='],
          ['hl-val', pairs[i].slice(equalsIndex + 1)]
        );
      }
    }
    return tokens;
  }

  /**
   * Build the highlight tokens of every snippet format (their joined text is the exact snippet).
   * @param {string} url    Absolute SVG URL.
   * @param {string} alt    Alt text.
   * @param {string} link   Optional link target (`''` for an unlinked image).
   * @returns {Record<keyof SnippetSet, HighlightToken[]>}
   */
  function buildSnippetTokens(url, alt, link) {
    const markdownAlt = alt.replace(MARKDOWN_ALT_RX, String.raw`\$&`);
    const urlTokens = tokenizeUrl(url);
    /** @type {HighlightToken[]} */
    const markdownImage = [
      ['hl-p', '!['],
      ['hl-alt', markdownAlt],
      ['hl-p', ']('],
      ...urlTokens,
      ['hl-p', ')'],
    ];
    /** @type {HighlightToken[]} */
    const htmlImage = [
      ['hl-p', '<img src="'],
      ...tokenizeUrl(escapeHtmlAttribute(url)),
      ['hl-p', '" alt="'],
      ['hl-alt', escapeHtmlAttribute(alt)],
      ['hl-p', '" />'],
    ];
    return {
      html: link
        ? [
            ['hl-p', '<a href="'],
            ['hl-href', escapeHtmlAttribute(link)],
            ['hl-p', '">'],
            ...htmlImage,
            ['hl-p', '</a>'],
          ]
        : htmlImage,
      markdown: link
        ? [['hl-p', '['], ...markdownImage, ['hl-p', ']('], ['hl-href', link], ['hl-p', ')']]
        : markdownImage,
      url: urlTokens,
    };
  }

  /**
   * Build the plain-text snippets of every format.
   * @param {string} url
   * @param {string} alt
   * @param {string} link
   * @returns {SnippetSet}
   */
  function buildSnippets(url, alt, link) {
    const tokens = buildSnippetTokens(url, alt, link);
    return {
      html: joinTokens(tokens.html),
      markdown: joinTokens(tokens.markdown),
      url: joinTokens(tokens.url),
    };
  }

  /**
   * Capitalize every `-`/`_`-separated slug part and join them (mirrors the Worker's Lucide lookup key).
   * @param {string} slug
   * @returns {string}
   */
  function capitalizeSlugParts(slug) {
    let result = '';
    for (const part of slug.split(SLUG_SEPARATOR_RX)) {
      if (part) {
        result += `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
      }
    }
    return result;
  }

  /**
   * Create a slug resolver mirroring `resolveIcon` (aliases, Lucide-first or brand-first lookup).
   * @param {IconPickerIndex} index
   * @returns {{ locate: (slug: string, isBrandFirst: boolean) => (IconLocation & { slug: string }) | undefined, resolve: (slug: string, isBrandFirst: boolean) => IconPickerSetId | 'none' | undefined }}
   */
  function createIconResolver(index) {
    /** @type {Map<string, string>} */
    const lucideByKey = new Map();
    /** @type {Map<string, number>} */
    const lucidePositions = new Map();
    for (let i = 0; i < index.sets.lucide.length; i += 1) {
      lucideByKey.set(capitalizeSlugParts(index.sets.lucide[i]), index.sets.lucide[i]);
      lucidePositions.set(index.sets.lucide[i], i);
    }
    for (const [alias, primary] of Object.entries(index.lucideAliases)) {
      lucideByKey.set(capitalizeSlugParts(alias), primary);
    }
    /** @type {Map<string, number>} */
    const brandPositions = new Map();
    for (let i = 0; i < index.sets.brands.length; i += 1) {
      brandPositions.set(index.sets.brands[i], i);
    }

    /** @param {string} slug @returns {string | undefined} */
    function findLucide(slug) {
      return lucideByKey.get(capitalizeSlugParts(slug));
    }

    /** @param {string} slug @returns {string | undefined} */
    function findBrand(slug) {
      const normalized = slug.replace(BRAND_SLUG_CLEAN_RX, '');
      const parent = index.brandAliases[slug] ?? index.brandAliases[normalized];
      for (const candidate of [slug, normalized, parent]) {
        if (candidate && brandPositions.has(candidate)) {
          return candidate;
        }
      }
      return undefined;
    }

    /**
     * @param {string} slug
     * @param {boolean} isBrandFirst
     * @returns {{ set: IconPickerSetId, slug: string } | 'none' | undefined}
     */
    function lookup(slug, isBrandFirst) {
      const rawSlug = slug.trim().toLowerCase();
      if (!rawSlug || rawSlug === 'none' || rawSlug.length > 64) {
        return rawSlug === 'none' || !rawSlug ? 'none' : undefined;
      }
      const cleanSlug = index.aliases[rawSlug] ?? rawSlug;
      const candidates = cleanSlug === rawSlug ? [cleanSlug] : [cleanSlug, rawSlug];
      /** @type {readonly IconPickerSetId[]} */
      const order = isBrandFirst ? ['brands', 'lucide'] : ['lucide', 'brands'];
      for (const set of order) {
        for (const candidate of candidates) {
          const found = set === 'lucide' ? findLucide(candidate) : findBrand(candidate);
          if (found) {
            return { set, slug: found };
          }
        }
      }
      return undefined;
    }

    return {
      locate(slug, isBrandFirst) {
        const found = lookup(slug, isBrandFirst);
        if (!found || found === 'none') {
          return undefined;
        }
        const position =
          (found.set === 'lucide' ? lucidePositions : brandPositions).get(found.slug) ?? 0;
        return { page: Math.floor(position / index.pageSize), set: found.set, slug: found.slug };
      },
      resolve(slug, isBrandFirst) {
        const found = lookup(slug, isBrandFirst);
        return found === 'none' || found === undefined ? found : found.set;
      },
    };
  }

  // -------------------------------------- PUBLIC API -------------------------------------

  const core = {
    buildAltText,
    buildPath,
    buildSnippets,
    collectStackSlugs,
    composeAnim,
    composeIconPair,
    composeSpecial,
    createIconResolver,
    decodeSegment,
    encodeSegment,
    parsePath,
    splitAnim,
    splitIconPair,
    splitSize,
    splitSpecial,
  };

  if (typeof document === 'undefined') {
    globalThis.svgBuilderCore = core;
    return;
  }

  // ----------------------------------------- MAIN ----------------------------------------
  // Everything below needs the DOM; Helpers close over the page state, so they live inside MAIN.

  const schemaElement = document.getElementById('builder-schema');
  const form = document.getElementById('builder-form');
  if (!schemaElement || !(form instanceof HTMLFormElement)) {
    return;
  }

  /** @type {BuilderSchema} */
  const schema = JSON.parse(schemaElement.textContent ?? '{}');
  const hasPresetIcon = schema.fields.some((field) => field.hasPresetValue === true);
  const previewImage = /** @type {HTMLImageElement | null} */ (
    document.getElementById('builder-preview')
  );
  const previewPlaceholder = document.getElementById('builder-placeholder');
  const statusElement = document.getElementById('builder-status');
  const codeElement = document.querySelector('#builder-code code');
  const altInput = /** @type {HTMLInputElement | null} */ (document.getElementById('builder-alt'));
  const linkInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('builder-link')
  );
  const openLink = /** @type {HTMLAnchorElement | null} */ (
    document.getElementById('builder-open')
  );
  const shareButton = document.getElementById('builder-share');
  const shareLabel = document.getElementById('builder-share-label');
  const resetButton = document.getElementById('builder-reset');
  const picker = document.getElementById('icon-picker');
  const pickerGrid = document.getElementById('icon-picker-grid');
  const pickerSearch = /** @type {HTMLInputElement | null} */ (
    document.getElementById('icon-picker-search')
  );
  const pickerStatus = document.getElementById('icon-picker-status');
  const hasAnchorPositioning = CSS.supports('position-area', 'block-end');
  const hasPopoverApi = 'popover' in HTMLElement.prototype;
  const pickerNoneButton = document.getElementById('icon-picker-none');
  const iconVersion =
    new URL(
      picker?.dataset.indexUrl ?? '/assets/icons.json',
      globalThis.location.href
    ).searchParams.get('v') ?? '';

  /** @type {Map<string, BuilderField>} */
  const fieldsById = new Map(schema.fields.map((field) => [field.id, field]));

  /** @type {BuilderState} */
  let state = { ...schema.initialState };
  let snippetFormat = 'markdown';
  let lastPreviewPath = '';
  let previewTimer = 0;
  let shareTimer = 0;

  /** @type {Promise<IconPickerIndex> | undefined} */
  let iconIndexPromise = undefined;
  /** @type {ReturnType<typeof createIconResolver> | undefined} */
  let iconResolver = undefined;
  /** @type {IconPickerIndex | undefined} */
  let iconIndex = undefined;
  /** @type {Map<string, Promise<Record<string, string>>>} */
  const iconPages = new Map();

  /** @type {HTMLElement | undefined} */
  let pickerTarget = undefined;
  /** @type {HTMLElement | undefined} */
  let pickerTrigger = undefined;
  let isPickerInsertMode = false;
  /** @type {{ set: IconPickerSetId, slug: string }[]} */
  let pickerMatches = [];
  let pickerRendered = 0;
  /** @type {IntersectionObserver | undefined} */
  let tileObserver = undefined;
  /** @type {IntersectionObserver | undefined} */
  let sentinelObserver = undefined;

  /**
   * Find a part control of a field element.
   * @param {Element} fieldElement
   * @param {string} part
   * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined}
   */
  function getPart(fieldElement, part) {
    /** @type {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null} */
    const control = fieldElement.querySelector(`[data-part="${part}"]`);
    return control ?? undefined;
  }

  /**
   * Find the single control of a field (`#field-<id>`).
   * @param {string} id
   * @returns {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | undefined}
   */
  function getControl(id) {
    const element = document.getElementById(`field-${id}`);
    return element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
      ? element
      : undefined;
  }

  /**
   * Close a popover element (native Popover API or the site script's `.is-open` fallback).
   * @param {HTMLElement} popover
   */
  function hidePopoverElement(popover) {
    if (hasPopoverApi && popover.matches(':popover-open')) {
      popover.hidePopover();
    }
    popover.classList.remove('is-open');
  }

  /**
   * Find the parts of a custom dropdown (`[data-select]`).
   * @param {Element} wrapper
   * @returns {{ list: Element | null, menu: HTMLElement | null, search: HTMLInputElement | null, select: HTMLSelectElement | null, trigger: HTMLElement | null }}
   */
  function getSelectParts(wrapper) {
    return {
      list: wrapper.querySelector('.select-options'),
      menu: wrapper.querySelector('.select-menu'),
      search: wrapper.querySelector('.select-search-input'),
      select: wrapper.querySelector('select'),
      trigger: wrapper.querySelector('.select-trigger'),
    };
  }

  /**
   * Create a color swatch dot (dropdown options with a `data-swatch` color).
   * @param {string} color   CSS color.
   * @returns {HTMLSpanElement}
   */
  function createSwatch(color) {
    const swatch = document.createElement('span');
    swatch.className = 'select-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.setProperty('--swatch', color);
    return swatch;
  }

  /**
   * Render the listbox options of a custom dropdown from its native `<select>`, filtered by the search query.
   * @param {Element} wrapper   `[data-select]` element.
   */
  function renderSelectOptions(wrapper) {
    const { list, search, select } = getSelectParts(wrapper);
    if (!list || !select) {
      return;
    }
    const query = (search?.value ?? '').trim().toLowerCase();
    const fragment = document.createDocumentFragment();
    for (const option of select.options) {
      const isMatch =
        !query || option.text.toLowerCase().includes(query) || option.value.includes(query);
      if (isMatch) {
        const item = document.createElement('div');
        item.className = 'select-option';
        item.id = `${select.id}-option-${option.index}`;
        item.dataset.value = option.value;
        item.tabIndex = -1;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.value === select.value));
        if (option.dataset.swatch) {
          item.append(createSwatch(option.dataset.swatch));
        }
        const label = document.createElement('span');
        label.className = 'select-option-label';
        label.textContent = option.text;
        item.append(label);
        fragment.append(item);
      }
    }
    if (fragment.childElementCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'select-empty';
      empty.textContent = 'No matches';
      fragment.append(empty);
    }
    list.replaceChildren(fragment);
  }

  /**
   * Sync a custom dropdown trigger (label and swatch) and its selected option with the native `<select>`.
   * @param {Element} wrapper   `[data-select]` element.
   */
  function syncSelect(wrapper) {
    const { list, select, trigger } = getSelectParts(wrapper);
    if (!select || !trigger) {
      return;
    }
    const [option] = select.selectedOptions;
    const valueElement = trigger.querySelector('.select-value');
    if (valueElement) {
      valueElement.textContent = option?.text ?? '';
    }
    const swatch = trigger.querySelector('.select-swatch');
    if (swatch instanceof HTMLElement) {
      const color = option?.dataset.swatch;
      swatch.hidden = !color;
      swatch.style.setProperty('--swatch', color ?? 'transparent');
    }
    for (const item of list?.querySelectorAll('.select-option') ?? []) {
      item.setAttribute(
        'aria-selected',
        String(item instanceof HTMLElement && item.dataset.value === select.value)
      );
    }
  }

  /** Sync every custom dropdown with its native `<select>` (after programmatic value changes). */
  function syncAllSelects() {
    for (const wrapper of form?.querySelectorAll('[data-select]') ?? []) {
      syncSelect(wrapper);
    }
  }

  /**
   * Replace the options of a native `<select>` and re-render its custom dropdown.
   * @param {HTMLSelectElement} select
   * @param {readonly BuilderOption[]} options
   * @param {string} selectedValue
   */
  function setSelectOptions(select, options, selectedValue) {
    select.replaceChildren();
    for (const option of options) {
      select.add(new Option(option.label, option.value, false, option.value === selectedValue));
    }
    const wrapper = select.closest('[data-select]');
    if (wrapper) {
      renderSelectOptions(wrapper);
      syncSelect(wrapper);
    }
  }

  /**
   * Choose a custom dropdown option: Update the native `<select>`, notify the form, and close the menu.
   * @param {Element} wrapper   `[data-select]` element.
   * @param {string} value
   */
  function chooseSelectOption(wrapper, value) {
    const { menu, select, trigger } = getSelectParts(wrapper);
    if (!select) {
      return;
    }
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncSelect(wrapper);
    if (menu) {
      hidePopoverElement(menu);
    }
    trigger?.focus();
  }

  /**
   * Move the focus between the options of an open custom dropdown.
   * @param {Element} wrapper   `[data-select]` element.
   * @param {number} offset     Option offset (`-Infinity` / `Infinity` for the first / last option).
   */
  function moveOptionFocus(wrapper, offset) {
    const items = [...wrapper.querySelectorAll('.select-option')];
    const current = items.indexOf(document.activeElement ?? wrapper);
    let targetIndex = current + offset;
    if (current === -1 || !Number.isFinite(targetIndex)) {
      targetIndex =
        offset > 0
          ? Math.min(offset, items.length) - 1
          : items.length + Math.max(offset, -items.length);
    }
    const next = items[Math.max(0, Math.min(items.length - 1, targetIndex))];
    if (next instanceof HTMLElement) {
      next.focus();
    }
  }

  /**
   * Handle keys inside an open custom dropdown (arrows, `Home`/`End`, `Enter`/`Space`, and typeahead).
   * @param {KeyboardEvent} event
   * @param {Element} wrapper   `[data-select]` element.
   */
  function handleSelectKeydown(event, wrapper) {
    const { target } = event;
    /** @type {Readonly<Record<string, number>>} */
    const offsets = { ArrowDown: 1, ArrowUp: -1, End: Infinity, Home: -Infinity };
    const offset = offsets[event.key];
    const isSearch = target instanceof HTMLInputElement;
    if (offset !== undefined && !(isSearch && (event.key === 'Home' || event.key === 'End'))) {
      event.preventDefault();
      moveOptionFocus(wrapper, offset);
    } else if (event.key === 'Enter' || (event.key === ' ' && !isSearch)) {
      event.preventDefault();
      const item = isSearch ? wrapper.querySelector('.select-option') : target;
      if (item instanceof HTMLElement && item.dataset.value !== undefined) {
        chooseSelectOption(wrapper, item.dataset.value);
      }
    } else if (!isSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      const key = event.key.toLowerCase();
      const match = [...wrapper.querySelectorAll('.select-option')].find((item) =>
        (item.textContent ?? '').trim().toLowerCase().startsWith(key)
      );
      if (match instanceof HTMLElement) {
        match.focus();
      }
    }
  }

  /**
   * Prepare a custom dropdown menu when it opens: Reset the search, render the options, and focus the search or the selected option.
   * @param {Element} wrapper   `[data-select]` element.
   */
  function openSelectMenu(wrapper) {
    const { menu, search, trigger } = getSelectParts(wrapper);
    if (search) {
      search.value = '';
    }
    renderSelectOptions(wrapper);
    if (menu && trigger && !hasAnchorPositioning) {
      const rect = trigger.getBoundingClientRect();
      menu.style.top = `${rect.bottom + 4}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.minWidth = `${rect.width}px`;
    }
    const selected = wrapper.querySelector('.select-option[aria-selected="true"]');
    const focusTarget = search ?? selected ?? wrapper.querySelector('.select-option');
    if (focusTarget instanceof HTMLElement) {
      focusTarget.focus();
    }
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Bind every custom dropdown: Option clicks, keyboard navigation, search, and opening with the arrow keys. */
  function bindSelects() {
    for (const wrapper of form?.querySelectorAll('[data-select]') ?? []) {
      const { menu, search, trigger } = getSelectParts(wrapper);
      renderSelectOptions(wrapper);
      menu?.addEventListener('toggle', (event) => {
        if (/** @type {ToggleEvent} */ (event).newState === 'open') {
          openSelectMenu(wrapper);
        }
      });
      menu?.addEventListener('click', (event) => {
        const item =
          event.target instanceof Element ? event.target.closest('.select-option') : undefined;
        if (item instanceof HTMLElement && item.dataset.value !== undefined) {
          chooseSelectOption(wrapper, item.dataset.value);
        }
      });
      menu?.addEventListener('keydown', (event) => handleSelectKeydown(event, wrapper));
      search?.addEventListener('input', () => renderSelectOptions(wrapper));
      trigger?.addEventListener('keydown', (event) => {
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu && hasPopoverApi) {
          event.preventDefault();
          menu.showPopover();
        }
      });
    }
  }

  /**
   * Read the serialized value of a field from its control(s).
   * @param {BuilderField} field
   * @param {Element} fieldElement
   * @returns {string}
   */
  function readFieldValue(field, fieldElement) {
    /** @param {string} part @returns {string} */
    function partValue(part) {
      return getPart(fieldElement, part)?.value ?? '';
    }
    switch (field.control) {
      case 'anim': {
        const sheen = getPart(fieldElement, 'sheen');
        return composeAnim(
          sheen instanceof HTMLInputElement && sheen.checked,
          partValue('left'),
          partValue('right')
        );
      }
      case 'color': {
        const checked = fieldElement.querySelector('input:checked');
        return checked instanceof HTMLInputElement ? checked.value : '';
      }
      case 'icon': {
        return partValue('main').trim();
      }
      case 'iconPair': {
        return composeIconPair(partValue('left'), partValue('right'), hasPresetIcon);
      }
      case 'size': {
        const preset = partValue('preset');
        return preset === 'custom' ? partValue('custom').trim() : preset;
      }
      case 'special': {
        return composeSpecial(partValue('kind'), partValue('payload'), partValue('modifier'));
      }
      default: {
        return getControl(field.id)?.value ?? '';
      }
    }
  }

  /**
   * Sync the modifier options and payload placeholder of a `special` field with its widget kind.
   * @param {BuilderField} field
   * @param {Element} fieldElement
   * @param {string} modifier   Modifier to select.
   */
  function syncSpecialParts(field, fieldElement, modifier) {
    const kind = getPart(fieldElement, 'kind')?.value ?? '';
    const payload = getPart(fieldElement, 'payload');
    const modifierSelect = getPart(fieldElement, 'modifier');
    const modifiers = SPECIAL_MODIFIERS[kind] ?? [];
    if (payload instanceof HTMLInputElement) {
      payload.placeholder =
        field.options?.find((option) => option.value === kind)?.placeholder ?? '';
    }
    if (modifierSelect instanceof HTMLSelectElement) {
      setSelectOptions(
        modifierSelect,
        modifiers.map((value) => ({ label: MODIFIER_LABELS[value] ?? value, value })),
        modifier
      );
    }
    fieldElement.querySelector('[data-special-part="payload"]')?.toggleAttribute('hidden', !kind);
    fieldElement
      .querySelector('[data-special-part="modifier"]')
      ?.toggleAttribute('hidden', modifiers.length === 0);
  }

  /**
   * Show the custom pixel input of a `size` field only for the `Custom…` preset.
   * @param {Element} fieldElement
   */
  function syncSizeParts(fieldElement) {
    const isCustom = getPart(fieldElement, 'preset')?.value === 'custom';
    fieldElement.querySelector('[data-size-part="custom"]')?.toggleAttribute('hidden', !isCustom);
  }

  /**
   * Label a service segment field (`Owner :scope`) and set its input placeholder.
   * @param {string} id            Field ID (`'owner'` or `'target'`).
   * @param {string} label         Base label.
   * @param {string} segmentName   Segment name from the service docs (e.g., `':scope'`).
   * @param {string} placeholder
   */
  function labelServiceSegment(id, label, segmentName, placeholder) {
    const labelElement = form?.querySelector(`[data-field="${id}"] .builder-label`);
    if (labelElement) {
      labelElement.textContent = `${label} ${segmentName}`.trim();
    }
    const control = getControl(id);
    if (control instanceof HTMLInputElement) {
      control.placeholder = placeholder;
    }
  }

  /** Sync the owner, target, and metric controls of the service badge builder with the selected service. */
  function syncServiceFields() {
    const service = findService(schema, state.service);
    if (!service) {
      return;
    }
    form
      ?.querySelector('[data-field="owner"]')
      ?.toggleAttribute('hidden', service.ownerMode === 'none');
    labelServiceSegment('owner', 'Owner', service.ownerName ?? '', service.ownerHint ?? '');
    labelServiceSegment(
      'target',
      'Target',
      service.targetName,
      service.targetName.replace(':', '')
    );
    const metricControl = getControl('metric');
    const { metrics } = service;
    if (!metrics.some((metric) => metric.value === state.metric)) {
      state.metric = metrics[0]?.value ?? '';
    }
    if (metricControl instanceof HTMLSelectElement) {
      setSelectOptions(metricControl, metrics, state.metric ?? '');
    }
  }

  /** Show or hide conditional fields for the current state. */
  function syncVisibility() {
    for (const field of schema.fields) {
      if (field.showWhen) {
        form
          ?.querySelector(`[data-field="${field.id}"]`)
          ?.toggleAttribute('hidden', !isFieldVisible(field, state));
      }
    }
  }

  /**
   * Set the value of a part control of a field element (no-op when the part does not exist).
   * @param {Element} fieldElement
   * @param {string} part
   * @param {string} value
   */
  function setPartValue(fieldElement, part, value) {
    const control = getPart(fieldElement, part);
    if (control) {
      control.value = value;
    }
  }
  /**
   * Write a state value into the control(s) of a field.
   * @param {BuilderField} field
   * @param {string} value
   */
  function writeFieldValue(field, value) {
    const fieldElement = form?.querySelector(`[data-field="${field.id}"]`);
    if (!fieldElement) {
      return;
    }

    switch (field.control) {
      case 'anim': {
        const anim = splitAnim(value);
        const sheen = getPart(fieldElement, 'sheen');
        if (sheen instanceof HTMLInputElement) {
          sheen.checked = anim.hasSheen;
        }
        setPartValue(fieldElement, 'left', anim.left);
        setPartValue(fieldElement, 'right', anim.right);
        break;
      }
      case 'color': {
        for (const radio of fieldElement.querySelectorAll('input[type="radio"]')) {
          if (radio instanceof HTMLInputElement) {
            radio.checked = radio.value === value;
          }
        }
        break;
      }
      case 'icon': {
        setPartValue(fieldElement, 'main', value);
        break;
      }
      case 'iconPair': {
        const [left, right] = splitIconPair(value, hasPresetIcon);
        setPartValue(fieldElement, 'left', left);
        setPartValue(fieldElement, 'right', right);
        break;
      }
      case 'size': {
        const size = splitSize(value, field.options ?? []);
        setPartValue(fieldElement, 'preset', size.preset);
        setPartValue(fieldElement, 'custom', size.custom);
        syncSizeParts(fieldElement);
        break;
      }
      case 'special': {
        const special = splitSpecial(value);
        setPartValue(fieldElement, 'kind', special.kind);
        setPartValue(fieldElement, 'payload', special.payload);
        syncSpecialParts(field, fieldElement, special.modifier);
        break;
      }
      default: {
        const control = getControl(field.id);
        if (control) {
          control.value = value;
        }
      }
    }
  }

  /** Write the whole state into the form. */
  function writeState() {
    for (const field of schema.fields) {
      if (field.id !== 'metric') {
        writeFieldValue(field, state[field.id] ?? '');
      }
    }
    if (schema.kind === 'service') {
      syncServiceFields();
    }
    syncVisibility();
  }

  /**
   * Render highlight tokens into the snippet `<code>` element (its text content is the exact snippet).
   * @param {HighlightToken[]} tokens
   */
  function renderCode(tokens) {
    if (!codeElement) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [className, text] of tokens) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      fragment.append(span);
    }
    codeElement.replaceChildren(fragment);
  }

  /**
   * Show a builder status message (`''` clears it).
   * @param {string} message
   * @param {boolean} [isWarning]
   */
  function setStatus(message, isWarning = false) {
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.classList.toggle('is-warning', isWarning);
    }
  }

  /**
   * Load a preview, skipping unchanged paths.
   * @param {string} path   Root-relative SVG path (`''` hides the preview).
   */
  function loadPreview(path) {
    if (!previewImage || path === lastPreviewPath) {
      return;
    }
    lastPreviewPath = path;
    previewImage.toggleAttribute('hidden', !path);
    previewPlaceholder?.toggleAttribute('hidden', Boolean(path));
    if (path) {
      previewImage.classList.add('is-loading');
      previewImage.src = path;
    }
  }

  /**
   * Load (once) the icon picker index.
   * @returns {Promise<IconPickerIndex>}
   */
  function loadIconIndex() {
    iconIndexPromise ??= fetch(picker?.dataset.indexUrl ?? '/assets/icons.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Icon index request failed (${response.status})`);
        }
        return response.json();
      })
      .then((/** @type {IconPickerIndex} */ index) => {
        iconIndex = index;
        iconResolver = createIconResolver(index);
        return index;
      });
    return iconIndexPromise;
  }

  /**
   * Load (once) an icon body page (versioned like the icon index).
   * @param {IconLocation} iconLocation
   * @returns {Promise<Record<string, string>>}
   */
  function loadIconPage(iconLocation) {
    const key = `${iconLocation.set}-${iconLocation.page}`;
    let pagePromise = iconPages.get(key);
    if (!pagePromise) {
      pagePromise = fetch(`/assets/icons-${key}.json?v=${iconVersion}`).then((response) =>
        response.ok ? response.json() : {}
      );
      iconPages.set(key, pagePromise);
    }
    return pagePromise;
  }

  /**
   * Create an inline glyph `<svg>` for an icon body.
   * @param {IconPickerSetId} set
   * @param {string} innerSvg   Trusted icon body markup from `/assets/icons-*.json`.
   * @returns {SVGSVGElement}
   */
  function createGlyph(set, innerSvg) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const [name, value] of Object.entries(GLYPH_PAINT_ATTRS[set])) {
      svg.setAttribute(name, value);
    }
    svg.innerHTML = innerSvg;
    return svg;
  }

  /**
   * Render the glyph preview next to an icon input.
   * @param {HTMLElement} container   `.icon-input-glyph` element.
   * @param {string} slug
   */
  function renderInputGlyph(container, slug) {
    const glyphLocation = iconResolver?.locate(slug, schema.isBrandFirst);
    container.replaceChildren();
    if (!glyphLocation) {
      return;
    }
    loadIconPage(glyphLocation).then(
      (bodies) => {
        const body = bodies[glyphLocation.slug];
        if (body && container.dataset.slug === slug) {
          container.replaceChildren(createGlyph(glyphLocation.set, body));
        }
      },
      () => undefined
    );
  }

  /**
   * Validate one icon input (or the stack groups textarea) and refresh its glyph preview.
   * @param {Element} hint   `[data-validation-for]` hint element.
   * @param {ReturnType<typeof createIconResolver>} resolver
   */
  function validateIconInput(hint, resolver) {
    const inputId = hint.getAttribute('data-validation-for') ?? '';
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return;
    }
    const value = input.value.trim();
    const slugs = input instanceof HTMLTextAreaElement ? collectStackSlugs(value) : [value];
    const unknown = slugs.filter(
      (slug) => slug && resolver.resolve(slug, schema.isBrandFirst) === undefined
    );
    const more = unknown.length > MAX_LISTED_UNKNOWN_ICONS ? ', …' : '';
    hint.textContent =
      unknown.length > 0
        ? `Unknown icon${unknown.length > 1 ? 's' : ''}: ${unknown.slice(0, MAX_LISTED_UNKNOWN_ICONS).join(', ')}${more} (renders a fallback).`
        : '';
    hint.classList.toggle('is-warning', unknown.length > 0);
  }

  /** Sync every icon selector (slug text, placeholder, clear button, and glyph) with its hidden input. */
  function syncIconSelects() {
    for (const trigger of form?.querySelectorAll('.icon-select-trigger') ?? []) {
      const inputId = trigger instanceof HTMLElement ? (trigger.dataset.iconTarget ?? '') : '';
      const input = document.getElementById(inputId);
      const valueElement = trigger.querySelector('.icon-select-value');
      if (input instanceof HTMLInputElement && valueElement instanceof HTMLElement) {
        const slug = input.value.trim();
        valueElement.textContent = slug || (valueElement.dataset.placeholder ?? '');
        valueElement.classList.toggle('is-placeholder', !slug);
        form?.querySelector(`[data-icon-clear="${inputId}"]`)?.toggleAttribute('hidden', !slug);
        const glyph = trigger.querySelector('[data-glyph-for]');
        // Glyphs need the icon index; They are rendered again once it has loaded.
        if (glyph instanceof HTMLElement && iconResolver && glyph.dataset.slug !== slug) {
          glyph.dataset.slug = slug;
          renderInputGlyph(glyph, slug);
        }
      }
    }
  }

  /** Validate every icon input and the stack groups against the icon index (once loaded). */
  function validateIcons() {
    const resolver = iconResolver;
    if (resolver) {
      for (const hint of form?.querySelectorAll('[data-validation-for]') ?? []) {
        validateIconInput(hint, resolver);
      }
    }
  }

  /** Rebuild the URL, snippets, links, and validation for the current state (preview and history are debounced). */
  function update() {
    const { missing, path } = buildPath(schema, state);
    const isComplete = missing.length === 0;
    const absoluteUrl = `${schema.origin}${path}`;
    const autoAlt = buildAltText(schema, state);
    if (altInput) {
      altInput.placeholder = autoAlt;
    }
    const link = (linkInput?.value ?? '').trim() || (schema.kind === 'service' ? absoluteUrl : '');
    renderCode(
      buildSnippetTokens(absoluteUrl, (altInput?.value ?? '').trim() || autoAlt, link)[
        /** @type {keyof SnippetSet} */ (snippetFormat)
      ]
    );
    if (openLink) {
      openLink.href = path;
    }
    document.querySelector('.builder-output')?.classList.toggle('is-incomplete', !isComplete);
    setStatus(isComplete ? '' : `Required: ${missing.join(', ')}`, !isComplete);
    syncAllSelects();
    syncIconSelects();
    validateIcons();

    clearTimeout(previewTimer);
    previewTimer = globalThis.setTimeout(() => {
      loadPreview(isComplete ? path : '');
      const shareUrl = new URL(globalThis.location.href);
      shareUrl.searchParams.set('path', path);
      history.replaceState(history.state, '', shareUrl);
    }, PREVIEW_DEBOUNCE_MS);
  }

  /**
   * Handle input on a field: Read its value, sync dependent controls, and update the outputs.
   * @param {Event} event
   */
  function handleFieldInput(event) {
    const { target } = event;
    const fieldElement = target instanceof Element ? target.closest('[data-field]') : undefined;
    const field = fieldsById.get(fieldElement?.getAttribute('data-field') ?? '');
    if (!fieldElement || !field) {
      return;
    }
    if (
      field.control === 'special' &&
      target instanceof Element &&
      target.matches('[data-part="kind"]')
    ) {
      syncSpecialParts(field, fieldElement, '');
    }
    if (field.control === 'size') {
      syncSizeParts(fieldElement);
    }
    state[field.id] = readFieldValue(field, fieldElement);
    if (field.id === 'service') {
      syncServiceFields();
    }
    syncVisibility();
    update();
  }

  /**
   * Select a snippet format tab.
   * @param {HTMLElement} tab
   */
  function selectTab(tab) {
    snippetFormat = tab.dataset.format ?? 'markdown';
    for (const otherTab of document.querySelectorAll('.builder-tab')) {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle('is-active', isSelected);
      otherTab.setAttribute('aria-selected', String(isSelected));
      otherTab.setAttribute('tabindex', isSelected ? '0' : '-1');
    }
    document.getElementById('builder-code')?.setAttribute('aria-labelledby', tab.id);
    update();
  }

  /**
   * Compute the filtered icon picker matches for the active set tab and search query.
   * @param {IconPickerIndex} index
   * @returns {{ set: IconPickerSetId, slug: string }[]}
   */
  function computePickerMatches(index) {
    const checkedTab = picker?.querySelector('input[name="icon-picker-set"]:checked');
    const tab = checkedTab instanceof HTMLInputElement ? checkedTab.value : 'all';
    const query = (pickerSearch?.value ?? '').trim().toLowerCase();
    /** @type {IconPickerSetId[]} */
    const sets = tab === 'all' ? ['lucide', 'brands'] : [/** @type {IconPickerSetId} */ (tab)];
    /** @type {Set<string>} */
    const aliasHits = new Set();
    if (query) {
      for (const [alias, primary] of Object.entries(index.lucideAliases)) {
        if (alias.includes(query)) {
          aliasHits.add(primary);
        }
      }
    }
    const prefixMatches = [];
    const otherMatches = [];
    for (const set of sets) {
      for (const slug of index.sets[set]) {
        // Only offer icons that render as shown (e.g., Lucide wins slug collisions outside tech stacks).
        if (iconResolver?.resolve(slug, schema.isBrandFirst) === set) {
          if (!query || slug.startsWith(query)) {
            prefixMatches.push({ set, slug });
          } else if (slug.includes(query) || (set === 'lucide' && aliasHits.has(slug))) {
            otherMatches.push({ set, slug });
          }
        }
      }
    }
    return [...prefixMatches, ...otherMatches];
  }

  /**
   * Fill the glyph of a visible picker tile.
   * @param {HTMLElement} tile
   */
  function fillTile(tile) {
    const tileLocation = iconResolver?.locate(tile.dataset.slug ?? '', schema.isBrandFirst);
    if (!tileLocation || tile.dataset.filled) {
      return;
    }
    tile.dataset.filled = 'true';
    loadIconPage(tileLocation).then(
      (bodies) => {
        const body = bodies[tileLocation.slug];
        if (body) {
          tile.replaceChildren(createGlyph(tileLocation.set, body));
        }
      },
      () => {
        delete tile.dataset.filled;
      }
    );
  }

  /** Append the next chunk of picker tiles. */
  function renderPickerChunk() {
    if (!pickerGrid) {
      return;
    }
    const fragment = document.createDocumentFragment();
    const end = Math.min(pickerMatches.length, pickerRendered + PICKER_CHUNK_SIZE);
    const currentSlug =
      !isPickerInsertMode && pickerTarget instanceof HTMLInputElement
        ? pickerTarget.value.trim().toLowerCase()
        : '';
    for (let i = pickerRendered; i < end; i += 1) {
      const match = pickerMatches[i];
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'icon-tile';
      tile.dataset.slug = match.slug;
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-label', match.slug);
      tile.setAttribute('aria-selected', String(match.slug === currentSlug));
      tile.title = match.slug;
      tile.tabIndex = i === 0 ? 0 : -1;
      fragment.append(tile);
      tileObserver?.observe(tile);
    }
    pickerGrid.querySelector('.icon-picker-sentinel')?.remove();
    pickerGrid.append(fragment);
    pickerRendered = end;
    if (pickerRendered < pickerMatches.length) {
      const sentinel = document.createElement('div');
      sentinel.className = 'icon-picker-sentinel';
      pickerGrid.append(sentinel);
      sentinelObserver?.observe(sentinel);
    }
  }

  /** Re-render the icon picker grid for the current tab and query. */
  function renderPicker() {
    if (!iconIndex || !pickerGrid) {
      return;
    }
    pickerMatches = computePickerMatches(iconIndex);
    pickerRendered = 0;
    pickerGrid.replaceChildren();
    pickerGrid.scrollTop = 0;
    renderPickerChunk();
    if (pickerStatus) {
      pickerStatus.textContent =
        pickerMatches.length === 0
          ? 'No icons found.'
          : `${pickerMatches.length.toLocaleString('en-US')} icon${pickerMatches.length === 1 ? '' : 's'}`;
    }
  }

  /**
   * Insert or set a picked slug into the picker target.
   * @param {string} slug
   */
  function applyPickedSlug(slug) {
    const target = pickerTarget;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    if (isPickerInsertMode) {
      const cursor = target.selectionStart ?? target.value.length;
      const before = target.value.slice(0, cursor);
      const after = target.value.slice(target.selectionEnd ?? cursor);
      const needsSeparator = before.length > 0 && !TRAILING_STACK_SEPARATOR_RX.test(before);
      const insertion = `${needsSeparator ? ',' : ''}${slug}`;
      target.value = `${before}${insertion}${after}`;
      const cursorAfter = before.length + insertion.length;
      target.setSelectionRange(cursorAfter, cursorAfter);
    } else {
      target.value = slug;
    }
    target.dispatchEvent(new Event('input', { bubbles: true }));
    if (picker) {
      hidePopoverElement(picker);
    }
    (target instanceof HTMLTextAreaElement ? target : (pickerTrigger ?? target)).focus();
  }

  /**
   * Move the roving focus within the picker grid.
   * @param {HTMLElement} tile   Currently focused tile.
   * @param {number} offset      Tile offset (negative or positive).
   */
  function moveTileFocus(tile, offset) {
    const tiles = [...(pickerGrid?.querySelectorAll('.icon-tile') ?? [])];
    const index = tiles.indexOf(tile);
    const next = tiles[Math.max(0, Math.min(tiles.length - 1, index + offset))];
    if (next instanceof HTMLElement) {
      tile.tabIndex = -1;
      next.tabIndex = 0;
      next.focus();
    }
  }

  /** @returns {number} Number of columns in the picker grid. */
  function getPickerColumns() {
    if (!pickerGrid) {
      return 1;
    }
    return Math.max(1, getComputedStyle(pickerGrid).gridTemplateColumns.split(' ').length);
  }

  /** Read every field control back into the state (normalizes composite values after `writeState`). */
  function syncStateFromForm() {
    for (const field of schema.fields) {
      const fieldElement = form?.querySelector(`[data-field="${field.id}"]`);
      if (fieldElement) {
        state[field.id] = readFieldValue(field, fieldElement);
      }
    }
  }

  /**
   * Replace the state, write it into the form, and refresh every output.
   * @param {BuilderState} nextState
   */
  function applyState(nextState) {
    state = { ...nextState };
    writeState();
    syncStateFromForm();
    update();
  }

  /** Apply the initial state: A shared or "Open in Builder" path wins over the example state. */
  function initializeState() {
    const sharedPath = new URL(globalThis.location.href).searchParams.get('path');
    const parsedState = sharedPath ? parsePath(schema, sharedPath) : undefined;
    applyState(parsedState ?? schema.initialState);
    if (sharedPath && !parsedState) {
      setStatus('The shared link belongs to another builder; Showing the example instead.', true);
    }
  }

  /** Copy a shareable builder link (with the current `?path=`) to the clipboard. */
  function copyShareLink() {
    const shareUrl = new URL(globalThis.location.href);
    shareUrl.searchParams.set('path', buildPath(schema, state).path);
    navigator.clipboard?.writeText(shareUrl.href).then(
      () => {
        if (shareLabel) {
          shareLabel.textContent = 'Link copied';
          clearTimeout(shareTimer);
          shareTimer = globalThis.setTimeout(() => {
            shareLabel.textContent = 'Copy builder link';
          }, SHARE_FEEDBACK_MS);
        }
      },
      () => setStatus('Copying the link failed; Copy it from the address bar instead.', true)
    );
  }

  /**
   * Handle arrow keys on the snippet format tabs (roving selection).
   * @param {KeyboardEvent} event
   */
  function handleTabKeydown(event) {
    const tabs = [...document.querySelectorAll('.builder-tab')];
    const current = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    /** @type {Readonly<Record<string, number>>} */
    const offsets = { ArrowLeft: -1, ArrowRight: 1 };
    const offset = offsets[event.key];
    const next =
      offset === undefined ? undefined : tabs[(current + offset + tabs.length) % tabs.length];
    if (next instanceof HTMLElement) {
      selectTab(next);
      next.focus();
    }
  }

  /** Bind the form, snippet option, preview, tab, and action events. */
  function bindBuilderEvents() {
    form?.addEventListener('input', handleFieldInput);
    form?.addEventListener('change', handleFieldInput);
    form?.addEventListener('submit', (event) => event.preventDefault());
    altInput?.addEventListener('input', update);
    linkInput?.addEventListener('input', update);
    if (linkInput && schema.kind === 'service') {
      linkInput.placeholder = 'Badge URL (redirects to the upstream page)';
    }

    previewImage?.addEventListener('load', () => {
      previewImage.classList.remove('is-loading');
    });
    previewImage?.addEventListener('error', () => {
      previewImage.classList.remove('is-loading');
      setStatus('The preview could not be loaded; Check the route values.', true);
    });

    const tabList = document.querySelector('.builder-tabs');
    tabList?.addEventListener('click', (event) => {
      const tab =
        event.target instanceof Element ? event.target.closest('.builder-tab') : undefined;
      if (tab instanceof HTMLElement) {
        selectTab(tab);
      }
    });
    tabList?.addEventListener('keydown', (event) =>
      handleTabKeydown(/** @type {KeyboardEvent} */ (event))
    );

    form?.addEventListener('click', (event) => {
      const clearButton =
        event.target instanceof Element ? event.target.closest('[data-icon-clear]') : undefined;
      const input = clearButton
        ? document.getElementById(clearButton.getAttribute('data-icon-clear') ?? '')
        : undefined;
      if (input instanceof HTMLInputElement) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const trigger = form?.querySelector(`[data-icon-target="${input.id}"]`);
        if (trigger instanceof HTMLElement) {
          trigger.focus();
        }
      }
    });
    bindSelects();

    resetButton?.addEventListener('click', () => {
      if (altInput) {
        altInput.value = '';
      }
      if (linkInput) {
        linkInput.value = '';
      }
      applyState(schema.initialState);
    });
    shareButton?.addEventListener('click', copyShareLink);
  }

  /**
   * Remember the picker target of a clicked picker button and anchor the popover to it.
   * @param {HTMLElement} pickerElement
   * @param {HTMLElement} button   `[data-icon-target]` button.
   */
  function targetPicker(pickerElement, button) {
    pickerTarget = document.getElementById(button.dataset.iconTarget ?? '') ?? undefined;
    pickerTrigger = button;
    isPickerInsertMode = button.dataset.iconInsert === 'true';
    pickerNoneButton?.toggleAttribute('hidden', button.dataset.iconNone !== 'true');
    for (const anchored of document.querySelectorAll('[data-icon-target]')) {
      if (anchored instanceof HTMLElement) {
        anchored.style.removeProperty('anchor-name');
      }
    }
    button.style.setProperty('anchor-name', '--icon-picker');
    if (!hasAnchorPositioning) {
      const rect = button.getBoundingClientRect();
      pickerElement.style.top = `${Math.min(rect.bottom + 8, globalThis.innerHeight - 420)}px`;
      pickerElement.style.left = `${Math.max(8, Math.min(rect.left, globalThis.innerWidth - 380))}px`;
    }
  }

  /**
   * Handle keys in the picker search (`ArrowDown` focuses the grid, `Enter` picks the first match).
   * @param {KeyboardEvent} event
   * @param {HTMLElement} gridElement
   */
  function handlePickerSearchKeydown(event, gridElement) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const firstTile = gridElement.querySelector('.icon-tile');
      if (firstTile instanceof HTMLElement) {
        firstTile.focus();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const [firstMatch] = pickerMatches;
      if (firstMatch) {
        applyPickedSlug(firstMatch.slug);
      }
    }
  }

  /**
   * Handle arrow, `Home`, and `End` keys in the picker grid (roving focus).
   * @param {KeyboardEvent} event
   */
  function handlePickerGridKeydown(event) {
    const tile =
      event.target instanceof HTMLElement ? event.target.closest('.icon-tile') : undefined;
    if (!(tile instanceof HTMLElement)) {
      return;
    }
    const columns = getPickerColumns();
    /** @type {Readonly<Record<string, number>>} */
    const offsets = {
      ArrowDown: columns,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      End: pickerRendered,
      Home: -pickerRendered,
    };
    const offset = offsets[event.key];
    if (offset !== undefined) {
      event.preventDefault();
      moveTileFocus(tile, offset);
    }
  }

  /**
   * Show the slug of a hovered or focused picker tile in the picker footer.
   * @param {Event} event
   */
  function showTileSlug(event) {
    const tile = event.target instanceof Element ? event.target.closest('.icon-tile') : undefined;
    if (tile instanceof HTMLElement && pickerStatus) {
      pickerStatus.textContent = tile.dataset.slug ?? '';
    }
  }

  /**
   * Bind the icon picker: Lazy glyph loading, chunked rendering, targeting, search, tabs, and keyboard navigation.
   * @param {HTMLElement} pickerElement
   * @param {HTMLElement} gridElement
   */
  function bindIconPicker(pickerElement, gridElement) {
    tileObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            fillTile(entry.target);
            tileObserver?.unobserve(entry.target);
          }
        }
      },
      { root: gridElement, rootMargin: '160px 0px' }
    );
    sentinelObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          renderPickerChunk();
        }
      },
      { root: gridElement, rootMargin: '240px 0px' }
    );

    document.addEventListener('click', (event) => {
      const button =
        event.target instanceof Element ? event.target.closest('[data-icon-target]') : undefined;
      if (button instanceof HTMLElement) {
        targetPicker(pickerElement, button);
      }
    });
    pickerElement.addEventListener('toggle', (event) => {
      if (/** @type {ToggleEvent} */ (event).newState === 'open') {
        if (pickerSearch) {
          pickerSearch.value = '';
          pickerSearch.focus();
        }
        renderPicker();
      }
    });
    pickerElement.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === 'icon-picker-set') {
        renderPicker();
      }
    });
    pickerSearch?.addEventListener('input', renderPicker);
    pickerSearch?.addEventListener('keydown', (event) =>
      handlePickerSearchKeydown(event, gridElement)
    );

    gridElement.addEventListener('click', (event) => {
      const tile = event.target instanceof Element ? event.target.closest('.icon-tile') : undefined;
      if (tile instanceof HTMLElement && tile.dataset.slug) {
        applyPickedSlug(tile.dataset.slug);
      }
    });
    gridElement.addEventListener('keydown', handlePickerGridKeydown);
    pickerNoneButton?.addEventListener('click', () => applyPickedSlug('none'));
    gridElement.addEventListener('focusin', showTileSlug);
    gridElement.addEventListener('pointerover', showTileSlug);
  }

  initializeState();
  bindBuilderEvents();
  if (picker && pickerGrid) {
    bindIconPicker(picker, pickerGrid);
  }

  // Icon index: Load in the background for validation, glyph previews, and the picker.
  loadIconIndex().then(
    () => {
      syncIconSelects();
      validateIcons();
      if (picker?.matches(':popover-open')) {
        renderPicker();
      }
    },
    () => {
      if (pickerStatus) {
        pickerStatus.textContent = 'Icons could not be loaded.';
      }
    }
  );
})();
