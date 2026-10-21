// @ts-check
/**
 * Builder client script – Schema-driven URL builder for `/builder/:kind`: Form state, URL and snippet generation, live previews, shareable state, and the searchable icon picker.
 *
 * The pure helpers (encoding, path building, prefill parsing, snippets, icon slug resolution) run without a DOM
 * and are exposed as `svgBuilderCore` when no `document` exists, so the test suite verifies them against the
 * Worker's route parser. The DOM part relies on the popover and clipboard helpers of the site script (`svgSite`).
 */

(function initBuilderClient() {
  // ---------------------------------------- TYPES ----------------------------------------

  /** @typedef {import('../../types/builder').BuilderField} BuilderField */
  /** @typedef {import('../../types/builder').BuilderOption} BuilderOption */
  /** @typedef {import('../../types/builder').BuilderSchema} BuilderSchema */
  /** @typedef {import('../../types/builder').BuilderServiceOption} BuilderServiceOption */
  /** @typedef {import('../../types/icon').IconPickerIndex} IconPickerIndex */
  /** @typedef {import('../../types/icon').IconPickerSetId} IconPickerSetId */
  /** @typedef {import('../../types/preview').HighlightToken} HighlightToken */
  /** @typedef {Record<string, string>} BuilderState */
  /** @typedef {{ missing: string[], path: string }} BuildResult */
  /** @typedef {{ html: string, markdown: string, url: string }} SnippetSet */
  /** @typedef {Record<keyof SnippetSet, HighlightToken[]>} SnippetTokenSet */
  /** @typedef {{ prefix: string, query: URLSearchParams, segments: string[] }} ParsedRoute */
  /** @typedef {{ set: IconPickerSetId, slug: string }} IconMatch */
  /** @typedef {IconMatch & { page: number }} IconLocation */
  /** @typedef {{ locate: (slug: string, isBrandFirst: boolean) => IconLocation | undefined, resolve: (slug: string, isBrandFirst: boolean) => IconPickerSetId | 'none' | undefined }} IconResolver */
  /** @typedef {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} FieldControl */
  /** @typedef {{ list: Element | null, menu: HTMLElement | null, search: HTMLInputElement | null, select: HTMLSelectElement | null, trigger: HTMLElement | null }} SelectParts */

  // ---------------------------------------- CONSTS ---------------------------------------

  /** Delay in milliseconds before a changed URL is previewed and written to the address bar. */
  const PREVIEW_DEBOUNCE_MS = 250;

  /** Number of icon picker tiles rendered per chunk (more are appended while scrolling). */
  const PICKER_CHUNK_SIZE = 240;

  /** Maximum number of unknown icon slugs listed in a validation hint. */
  const MAX_LISTED_UNKNOWN_ICONS = 6;

  /** Query parameter pair appended to reduced-motion previews (stops sheens, icon motions, widgets, and dots). */
  const STATIC_ANIM_PAIR = 'anim=none';

  /** Normalized `?center=` values that select the vertical quote layout (mirrors `resolveQuoteLayout`; drift-tested). */
  const CENTER_FLAG_VALUES = new Set(['1', 'true', 'yes']);

  /** Entity replacements of characters escaped inside double-quoted HTML attribute values. */
  /** @type {Readonly<Record<string, string>>} */
  const HTML_ENTITIES = { '"': '&quot;', '&': '&amp;', '<': '&lt;', '>': '&gt;' };

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

  /** Matches characters escaped with a backslash inside Markdown image alt text (same rule as the server Markdown). */
  const MARKDOWN_ALT_RX = /[[\]\\]/g;

  /** Matches characters percent-encoded inside Markdown link destinations (same rule as the server Markdown). */
  const MARKDOWN_DESTINATION_RX = /[ ()<>]/g;

  /** Matches characters escaped inside double-quoted HTML attribute values. */
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
    for (const service of schema.services ?? []) {
      if (service.key === key) {
        return service;
      }
    }
    return undefined;
  }

  /**
   * Find the option with a value in an option list.
   * @template {BuilderOption} T
   * @param {readonly T[] | undefined} options
   * @param {string} value
   * @returns {T | undefined}
   */
  function findOption(options, value) {
    for (const option of options ?? []) {
      if (option.value === value) {
        return option;
      }
    }
    return undefined;
  }

  /**
   * Find a field of a schema.
   * @param {BuilderSchema} schema
   * @param {string} id   Field ID.
   * @returns {BuilderField | undefined}
   */
  function findField(schema, id) {
    for (const field of schema.fields) {
      if (field.id === id) {
        return field;
      }
    }
    return undefined;
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
   * @param {string} value            Serialized value.
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
   * @param {string} modifier   Optional modifier of the kind (e.g., `static`).
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
   * Split a `?special=` value into its widget kind, payload, and modifier (modifiers come from the kind options).
   * @param {string} value                       Serialized value.
   * @param {readonly BuilderOption[]} options   Widget kind options of the `special` field.
   * @returns {{ kind: string, modifier: string, payload: string }}
   */
  function splitSpecial(value, options) {
    const colonIndex = value.indexOf(':');
    if (colonIndex <= 0) {
      return { kind: '', modifier: '', payload: '' };
    }
    const kind = value.slice(0, colonIndex).trim().toLowerCase();
    let payload = value.slice(colonIndex + 1);
    let modifier = '';
    const lastColon = payload.lastIndexOf(':');
    const modifiers = findOption(options, kind)?.modifiers;
    if (modifiers && lastColon !== -1) {
      const candidate = payload
        .slice(lastColon + 1)
        .trim()
        .toLowerCase();
      if (candidate && findOption(modifiers, candidate)) {
        modifier = candidate;
        payload = payload.slice(0, lastColon);
      }
    }
    return { kind, modifier, payload: payload.trim() };
  }

  /**
   * Split a `?size=` value into a named preset or a custom number.
   * @param {string} value                       Serialized value.
   * @param {readonly BuilderOption[]} options   Named preset options.
   * @returns {{ custom: string, preset: string }}
   */
  function splitSize(value, options) {
    const clean = value.trim().toLowerCase();
    if (!clean) {
      return { custom: '', preset: '' };
    }
    if (findOption(options, clean)) {
      return { custom: '', preset: clean };
    }
    return Number.isFinite(Number(clean))
      ? { custom: clean, preset: 'custom' }
      : { custom: '', preset: '' };
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
   * @param {string} label    Label segment.
   * @param {string} value    Optional value segment.
   * @returns {string}
   */
  function buildLabelValuePathname(prefix, label, value) {
    return `/${prefix}/${encodeSegment(label)}${value ? `/${encodeSegment(value)}` : ''}`;
  }

  /**
   * Encode a service target (multi-segment targets, e.g., Go module paths, keep their `/` separators).
   * @param {BuilderServiceOption | undefined} service
   * @param {string} rawTarget   Raw target text.
   * @returns {string}
   */
  function encodeServiceTarget(service, rawTarget) {
    if (!service || service.maxTargetSegments <= 1) {
      return encodeSegment(rawTarget);
    }
    const encodedSegments = [];
    for (const segment of rawTarget.split('/')) {
      if (segment) {
        encodedSegments.push(encodeSegment(segment));
      }
    }
    return encodedSegments.join('/');
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
    const target = encodeServiceTarget(service, readState(state, 'target'));
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
   * Build the preview URL of a path: Reduced motion previews append `anim=none` (an `<img>` keeps playing SMIL).
   * @param {string} path               Root-relative SVG path with an optional query string.
   * @param {boolean} isReducedMotion   Whether the user prefers reduced motion.
   * @returns {string}
   */
  function buildPreviewPath(path, isReducedMotion) {
    if (!isReducedMotion || !path) {
      return path;
    }
    const queryIndex = path.indexOf('?');
    const pairs = [];
    if (queryIndex !== -1) {
      for (const pair of path.slice(queryIndex + 1).split('&')) {
        if (pair && !pair.startsWith('anim=')) {
          pairs.push(pair);
        }
      }
    }
    pairs.push(STATIC_ANIM_PAIR);
    return `${queryIndex === -1 ? path : path.slice(0, queryIndex)}?${pairs.join('&')}`;
  }

  /**
   * Read the first non-empty query parameter of a list of names (empty values fall through like in the Worker).
   * @param {URLSearchParams} query
   * @param {readonly string[]} names   Parameter names in precedence order.
   * @returns {string}
   */
  function readQueryParam(query, names) {
    for (const name of names) {
      const value = query.get(name);
      if (value) {
        return value;
      }
    }
    return '';
  }

  /**
   * Read the first non-empty query fallback (`aliases`) of a path segment field (e.g., `?groups=` for `/stack`).
   * @param {BuilderSchema} schema
   * @param {URLSearchParams} query
   * @param {string} id   Field ID.
   * @returns {string}
   */
  function readSegmentFallback(schema, query, id) {
    return readQueryParam(query, findField(schema, id)?.aliases ?? []);
  }

  /**
   * Normalize a prefilled option value like the Worker parsers: Case-insensitive, option aliases map onto their
   * option, and unknown values fall back to the default (`''`, which renders identically).
   * @param {BuilderField} field
   * @param {string} raw   Raw query parameter value.
   * @returns {string}
   */
  function normalizeOptionValue(field, raw) {
    if (field.control === 'number') {
      const clean = raw.trim();
      return clean && Number.isFinite(Number(clean)) ? clean : '';
    }
    if (field.control === 'size') {
      const clean = raw.trim().toLowerCase();
      return clean && (findOption(field.options, clean) || Number.isFinite(Number(clean)))
        ? clean
        : '';
    }
    if (field.control !== 'select' && field.control !== 'color') {
      return raw;
    }
    const clean = raw.trim().toLowerCase();
    for (const option of field.options ?? []) {
      if (option.value === clean || option.aliases?.includes(clean)) {
        return option.value;
      }
    }
    return '';
  }

  /**
   * Canonicalize a requested service metric like the Worker (case-insensitive, metric aliases).
   * @param {BuilderServiceOption} service
   * @param {string} raw   Raw metric segment.
   * @returns {string}
   */
  function canonicalizeMetric(service, raw) {
    const clean = raw.trim().toLowerCase();
    const aliases = service.metricAliases;
    return aliases && Object.hasOwn(aliases, clean) ? (aliases[clean] ?? clean) : clean;
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
    const segments = [];
    for (const rawSegment of rawParts.slice(2)) {
      segments.push(decodeSegment(rawSegment));
    }
    if (segments.length > 1 && segments.at(-1) === '') {
      segments.pop();
    }
    // Route prefixes are case-sensitive in the Worker (`/Badge/…` is not an SVG route).
    return { prefix: rawParts[1] ?? '', query: url.searchParams, segments };
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
    quote(state, { prefix, query, segments }, schema) {
      const hasAuthorSegment = segments.length === 2;
      state.author = hasAuthorSegment
        ? (segments[0] ?? '')
        : readSegmentFallback(schema, query, 'author');
      state.text =
        (hasAuthorSegment ? segments[1] : segments[0]) ||
        readSegmentFallback(schema, query, 'text');
      // `?center=` only counts when neither `?layout=` nor one of its aliases has a value.
      const layoutField = findField(schema, 'layout');
      const layoutNames = layoutField?.param
        ? [layoutField.param, ...(layoutField.aliases ?? [])]
        : [];
      const center = (query.get('center') ?? '').trim().toLowerCase();
      if (!readQueryParam(query, layoutNames).trim() && CENTER_FLAG_VALUES.has(center)) {
        state.layout = 'vertical';
      }
      return prefix === 'quote' && segments.length <= 2;
    },
    service(state, { prefix, segments }, schema) {
      const service = findService(schema, (segments[0] ?? '').toLowerCase());
      if (prefix !== 'badge' || !service || segments.length < 3) {
        return false;
      }
      const middle = segments.slice(1, -1);
      state.service = service.key;
      state.metric = canonicalizeMetric(service, segments.at(-1) ?? '');
      if (service.maxTargetSegments > 1) {
        // Multi-segment targets span every middle segment, except a leading required owner segment.
        const hasOwnerSegment = service.ownerMode === 'required';
        const targetSegments = hasOwnerSegment ? middle.slice(1) : middle;
        state.owner = hasOwnerSegment ? (middle[0] ?? '') : '';
        state.target = targetSegments.join('/');
        return targetSegments.length >= 1 && targetSegments.length <= service.maxTargetSegments;
      }
      if (middle.length === 2) {
        state.owner = middle[0] ?? '';
        state.target = middle[1] ?? '';
        return service.ownerMode !== 'none';
      }
      state.target = middle[0] ?? '';
      return middle.length === 1;
    },
    stack(state, { prefix, query, segments }, schema) {
      state.groups = segments[0] || readSegmentFallback(schema, query, 'groups');
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
      const raw = field.param
        ? readQueryParam(route.query, [field.param, ...(field.aliases ?? [])])
        : '';
      state[field.id] = normalizeOptionValue(field, raw);
    }
    return parsePathSegments(state, route, schema) ? state : undefined;
  }

  /**
   * Join non-empty parts with a separator.
   * @param {readonly string[]} parts
   * @param {string} separator
   * @returns {string}
   */
  function joinNonEmpty(parts, separator) {
    let joined = '';
    for (const part of parts) {
      if (part) {
        joined = joined ? `${joined}${separator}${part}` : part;
      }
    }
    return joined;
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
        return joinNonEmpty(parts, ': ') || 'Badge';
      }
      case 'button': {
        return (
          joinNonEmpty([readState(state, 'label'), readState(state, 'value')], ' ') || 'Button'
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
          joinNonEmpty(
            [service?.title ?? '', readState(state, 'target'), readState(state, 'metric')],
            ' '
          )
        );
      }
      default: {
        return 'Tech Stack';
      }
    }
  }

  /**
   * Escape a value for a double-quoted HTML attribute (`&amp;`, `&quot;`, `&lt;`, `&gt;`).
   * @param {string} value
   * @returns {string}
   */
  function escapeHtmlAttribute(value) {
    return value.replace(HTML_ATTR_RX, (char) => HTML_ENTITIES[char] ?? char);
  }

  /**
   * Percent-encode the characters that would end or break a Markdown link destination (space, `(`, `)`, `<`, `>`).
   * @param {string} text
   * @returns {string}
   */
  function encodeMarkdownDestination(text) {
    return text.replace(
      MARKDOWN_DESTINATION_RX,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }

  /**
   * Join highlight tokens into their plain text.
   * @param {readonly HighlightToken[]} tokens
   * @returns {string}
   */
  function joinTokens(tokens) {
    let text = '';
    for (const token of tokens) {
      text += token[1];
    }
    return text;
  }

  /**
   * Split a URL into highlight tokens (base, `?`, keys, `=`, values, `&`); Same algorithm as `tokenizeUrl` in
   * `src/preview/components.ts` (guarded by a parity test).
   * @param {string} url   Raw (unescaped) URL.
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
    for (const [i, pair] of url
      .slice(queryIndex + 1)
      .split('&')
      .entries()) {
      if (i > 0) {
        tokens.push(['hl-op', '&']);
      }
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex === -1) {
        tokens.push(['hl-key', pair]);
      } else {
        tokens.push(
          ['hl-key', pair.slice(0, equalsIndex)],
          ['hl-op', '='],
          ['hl-val', pair.slice(equalsIndex + 1)]
        );
      }
    }
    return tokens;
  }

  /**
   * Build the highlight tokens of every snippet format (their joined text is the exact snippet): The raw URL is
   * tokenized first, then each token is escaped for its format.
   * @param {string} url    Absolute SVG URL.
   * @param {string} alt    Alt text.
   * @param {string} link   Optional link target (`''` for an unlinked image).
   * @returns {SnippetTokenSet}
   */
  function buildSnippetTokens(url, alt, link) {
    const urlTokens = tokenizeUrl(url);
    /** @type {HighlightToken[]} */
    const markdown = link ? [['hl-p', '[']] : [];
    markdown.push(
      ['hl-p', '!['],
      ['hl-alt', alt.replace(MARKDOWN_ALT_RX, String.raw`\$&`)],
      ['hl-p', '](']
    );
    /** @type {HighlightToken[]} */
    const html = link
      ? [
          ['hl-p', '<a href="'],
          ['hl-href', escapeHtmlAttribute(link)],
          ['hl-p', '">'],
        ]
      : [];
    html.push(['hl-p', '<img src="']);
    for (const [className, text] of urlTokens) {
      markdown.push([className, encodeMarkdownDestination(text)]);
      html.push([className, escapeHtmlAttribute(text)]);
    }
    markdown.push(['hl-p', ')']);
    if (link) {
      markdown.push(['hl-p', ']('], ['hl-href', encodeMarkdownDestination(link)], ['hl-p', ')']);
    }
    html.push(['hl-p', '" alt="'], ['hl-alt', escapeHtmlAttribute(alt)], ['hl-p', '" />']);
    if (link) {
      html.push(['hl-p', '</a>']);
    }
    return { html, markdown, url: urlTokens };
  }

  /**
   * Build the plain-text snippets of every format.
   * @param {string} url    Absolute SVG URL.
   * @param {string} alt    Alt text.
   * @param {string} link   Optional link target.
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

  /** Cached compiled regex for `BuilderSchema.redirectValuePattern` (`undefined` until first used). */
  /** @type {RegExp | undefined} */
  let cachedRedirectPatternRx = undefined;
  let cachedRedirectPatternSource = '';

  /**
   * Build the upstream page URL of a service badge from its metric's redirect template, or `''` when the metric
   * has no template or a value is outside the verified character set.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @returns {string}
   */
  function buildServiceRedirectUrl(schema, state) {
    const service = findService(schema, readState(state, 'service'));
    const template = findOption(service?.metrics, readState(state, 'metric'))?.redirect;
    if (!service || !template || !schema.redirectValuePattern) {
      return '';
    }
    if (!cachedRedirectPatternRx || schema.redirectValuePattern !== cachedRedirectPatternSource) {
      cachedRedirectPatternSource = schema.redirectValuePattern;
      cachedRedirectPatternRx = new RegExp(schema.redirectValuePattern);
    }
    const valuePattern = cachedRedirectPatternRx;
    const explicitOwner = service.ownerMode === 'none' ? '' : readState(state, 'owner');
    const owner = explicitOwner || service.defaultOwner || '';
    const target = readState(state, 'target');
    const targetSegments = target.split('/');
    if (targetSegments.length > service.maxTargetSegments || (owner && !valuePattern.test(owner))) {
      return '';
    }
    for (const segment of targetSegments) {
      if (!valuePattern.test(segment)) {
        return '';
      }
    }
    return template.replaceAll('{owner}', owner).replaceAll('{target}', target);
  }

  /**
   * Build the default link target wrapped around the image when the link field is empty: Service badges link to
   * their upstream page (filled from the metric's redirect template) or, without a template, to their query-free
   * badge path, which the Worker redirects to the same page on document navigations; Other elements stay unlinked.
   * @param {BuilderSchema} schema
   * @param {BuilderState} state
   * @param {string} url   Absolute SVG URL.
   * @returns {string} Link target (`''` for an unlinked image).
   */
  function buildDefaultLinkTarget(schema, state, url) {
    if (schema.kind !== 'service') {
      return '';
    }
    const upstreamUrl = buildServiceRedirectUrl(schema, state);
    if (upstreamUrl) {
      return upstreamUrl;
    }
    const queryIndex = url.indexOf('?');
    return queryIndex === -1 ? url : url.slice(0, queryIndex);
  }

  /**
   * Build a shareable builder URL with the current path, alt text, and link target.
   * @param {string} href   Current builder page URL.
   * @param {string} path   Root-relative SVG path.
   * @param {string} alt    Custom alt text (`''` omits the parameter).
   * @param {string} link   Custom link target (`''` omits the parameter).
   * @returns {string}
   */
  function buildShareUrl(href, path, alt, link) {
    const shareUrl = new URL(href);
    shareUrl.searchParams.set('path', path);
    for (const [name, value] of Object.entries({ alt, link })) {
      if (value) {
        shareUrl.searchParams.set(name, value);
      } else {
        shareUrl.searchParams.delete(name);
      }
    }
    return shareUrl.href;
  }

  /**
   * Compute the tile index a grid navigation key moves the roving focus to (arrows by cell or row, `Home` / `End`
   * to the first / last match, including matches that are not rendered yet).
   * @param {string} key       `KeyboardEvent.key`.
   * @param {number} index     Current tile index.
   * @param {number} columns   Number of grid columns.
   * @param {number} total     Number of matches.
   * @returns {number | undefined} Target index, or `undefined` for other keys.
   */
  function computeGridFocusIndex(key, index, columns, total) {
    /** @type {Readonly<Record<string, number>>} */
    const targets = {
      ArrowDown: index + columns,
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index - columns,
      End: total - 1,
      Home: 0,
    };
    if (total <= 0 || !Object.hasOwn(targets, key)) {
      return undefined;
    }
    return Math.max(0, Math.min(total - 1, targets[key] ?? 0));
  }

  /**
   * Create a keyed promise cache that forgets rejected loads, so failed requests are retried on the next call.
   * @template T
   * @param {(key: string) => Promise<T>} load   Loader per key.
   * @returns {(key: string) => Promise<T>}
   */
  function createAsyncCache(load) {
    /** @type {Map<string, Promise<T>>} */
    const promises = new Map();
    return (key) => {
      let promise = promises.get(key);
      if (!promise) {
        const pending = load(key);
        pending.catch(() => {
          if (promises.get(key) === pending) {
            promises.delete(key);
          }
        });
        promises.set(key, pending);
        promise = pending;
      }
      return promise;
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
   * Create a slug resolver mirroring `resolveIcon` (aliases, Lucide-first or brand-first lookup, slug length limit).
   * @param {IconPickerIndex} index
   * @param {number} maxSlugLength   Maximum slug length (`BuilderSchema.maxIconSlugLength`).
   * @returns {IconResolver}
   */
  function createIconResolver(index, maxSlugLength) {
    /** @type {Map<string, string>} */
    const lucideByKey = new Map();
    /** @type {Map<string, number>} */
    const lucidePositions = new Map();
    for (const [i, slug] of index.sets.lucide.entries()) {
      lucideByKey.set(capitalizeSlugParts(slug), slug);
      lucidePositions.set(slug, i);
    }
    for (const [alias, primary] of Object.entries(index.lucideAliases)) {
      lucideByKey.set(capitalizeSlugParts(alias), primary);
    }
    /** @type {Map<string, number>} */
    const brandPositions = new Map();
    for (const [i, slug] of index.sets.brands.entries()) {
      brandPositions.set(slug, i);
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
     * @returns {IconMatch | 'none' | undefined}
     */
    function lookup(slug, isBrandFirst) {
      const rawSlug = slug.trim().toLowerCase();
      if (!rawSlug || rawSlug === 'none') {
        return 'none';
      }
      if (rawSlug.length > maxSlugLength) {
        return undefined;
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
    buildDefaultLinkTarget,
    buildPath,
    buildPreviewPath,
    buildShareUrl,
    buildSnippetTokens,
    buildSnippets,
    collectStackSlugs,
    composeAnim,
    composeIconPair,
    composeSpecial,
    computeGridFocusIndex,
    createAsyncCache,
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

  const site = globalThis.svgSite;
  const schemaElement = document.getElementById('builder-schema');
  const form = document.getElementById('builder-form');
  if (!site || !schemaElement || !(form instanceof HTMLFormElement)) {
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
  const outputElement = document.querySelector('.builder-output');
  const codeElement = document.querySelector('#builder-code code');
  const altInput = /** @type {HTMLInputElement | null} */ (document.getElementById('builder-alt'));
  const linkInput = /** @type {HTMLInputElement | null} */ (
    document.getElementById('builder-link')
  );
  const openLink = /** @type {HTMLAnchorElement | null} */ (
    document.getElementById('builder-open')
  );
  const copyButton = /** @type {HTMLButtonElement | null} */ (
    document.getElementById('builder-copy')
  );
  const shareButton = document.getElementById('builder-share');
  const resetButton = document.getElementById('builder-reset');
  const picker = document.getElementById('icon-picker');
  const pickerGrid = document.getElementById('icon-picker-grid');
  const pickerSearch = /** @type {HTMLInputElement | null} */ (
    document.getElementById('icon-picker-search')
  );
  const pickerStatus = document.getElementById('icon-picker-status');
  const pickerNoneButton = document.getElementById('icon-picker-none');
  const glyphTemplates = document.getElementById('icon-glyph-templates');
  const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
  const iconIndexUrl = picker?.dataset.indexUrl ?? '/assets/icons.json';
  const iconVersion = new URL(iconIndexUrl, globalThis.location.href).searchParams.get('v') ?? '';

  /** @type {Map<string, BuilderField>} */
  const fieldsById = new Map();
  /** @type {Map<string, Element>} */
  const fieldElements = new Map();
  /** IDs of fields whose value shows or hides other fields. */
  /** @type {Set<string>} */
  const visibilityControllers = new Set();
  for (const field of schema.fields) {
    fieldsById.set(field.id, field);
    const fieldElement = form.querySelector(`[data-field="${field.id}"]`);
    if (fieldElement) {
      fieldElements.set(field.id, fieldElement);
    }
    if (field.showWhen) {
      visibilityControllers.add(field.showWhen.field);
    }
  }

  /** @type {Map<string, FieldControl | undefined>} */
  const controlCache = new Map();
  /** @type {WeakMap<Element, SelectParts>} */
  const selectPartsCache = new WeakMap();

  /** @type {BuilderState} */
  let state = { ...schema.initialState };
  /** @type {keyof SnippetSet} */
  let snippetFormat = 'markdown';
  let lastPreviewSrc = '';
  let currentPreviewPath = '';
  let previewTimer = 0;
  let pickerSearchFrame = 0;

  /** @type {IconPickerIndex | undefined} */
  let iconIndex = undefined;
  /** @type {IconResolver | undefined} */
  let iconResolver = undefined;
  /** Renderable picker slugs per set (slugs that resolve to their own set in this builder), built once. */
  /** @type {Record<IconPickerSetId, string[]> | undefined} */
  let pickerCatalog = undefined;

  /** @type {HTMLElement | undefined} */
  let pickerTarget = undefined;
  /** @type {HTMLElement | undefined} */
  let pickerTrigger = undefined;
  let isPickerInsertMode = false;
  /** @type {IconMatch[]} */
  let pickerMatches = [];
  let pickerRendered = 0;
  let pickerSelectedSlug = '';
  /** @type {IntersectionObserver | undefined} */
  let tileObserver = undefined;
  /** @type {IntersectionObserver | undefined} */
  let sentinelObserver = undefined;

  const loadIconIndexOnce = createAsyncCache(() =>
    fetch(iconIndexUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Icon index request failed (${response.status})`);
      }
      return /** @type {Promise<IconPickerIndex>} */ (response.json());
    })
  );

  const loadIconPageOnce = createAsyncCache((key) =>
    fetch(`/assets/icons-${key}.json?v=${iconVersion}`).then((response) => {
      if (!response.ok) {
        throw new Error(`Icon page request failed (${response.status})`);
      }
      return /** @type {Promise<Record<string, string>>} */ (response.json());
    })
  );

  /**
   * Find a part control of a field element.
   * @param {Element} fieldElement
   * @param {string} part
   * @returns {FieldControl | undefined}
   */
  function getPart(fieldElement, part) {
    /** @type {FieldControl | null} */
    const control = fieldElement.querySelector(`[data-part="${part}"]`);
    return control ?? undefined;
  }

  /**
   * Find (once) the single control of a field (`#field-<id>`).
   * @param {string} id   Field ID.
   * @returns {FieldControl | undefined}
   */
  function getControl(id) {
    if (!controlCache.has(id)) {
      const element = document.getElementById(`field-${id}`);
      controlCache.set(
        id,
        element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
          ? element
          : undefined
      );
    }
    return controlCache.get(id);
  }

  /**
   * Find (once) the parts of a custom dropdown (`[data-select]`).
   * @param {Element} wrapper
   * @returns {SelectParts}
   */
  function getSelectParts(wrapper) {
    let parts = selectPartsCache.get(wrapper);
    if (!parts) {
      parts = {
        list: wrapper.querySelector('.select-options'),
        menu: wrapper.querySelector('.select-menu'),
        search: wrapper.querySelector('.select-search-input'),
        select: wrapper.querySelector('select'),
        trigger: wrapper.querySelector('.select-trigger'),
      };
      selectPartsCache.set(wrapper, parts);
    }
    return parts;
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
   * Render the listbox options of a custom dropdown from its native `<select>`, filtered by the search query
   * (only while the menu is open).
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
   * Sync a custom dropdown trigger (label and swatch) and its rendered options with the native `<select>`.
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

  /**
   * Sync every custom dropdown inside a scope with its native `<select>`.
   * @param {ParentNode} scope   Changed field element or the whole form.
   */
  function syncSelects(scope) {
    for (const wrapper of scope.querySelectorAll('[data-select]')) {
      syncSelect(wrapper);
    }
  }

  /**
   * Replace the options of a native `<select>` and sync its custom dropdown trigger.
   * @param {HTMLSelectElement} select
   * @param {readonly BuilderOption[]} options
   * @param {string} selectedValue
   */
  function setSelectOptions(select, options, selectedValue) {
    select.replaceChildren();
    for (const option of options) {
      const optionElement = new Option(
        option.label,
        option.value,
        false,
        option.value === selectedValue
      );
      if (option.swatch) {
        optionElement.dataset.swatch = option.swatch;
      }
      select.add(optionElement);
    }
    const wrapper = select.closest('[data-select]');
    if (wrapper) {
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
      site?.closePopover(menu);
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
   * Focus the first rendered option whose label starts with a typed character (typeahead).
   * @param {Element} wrapper   `[data-select]` element.
   * @param {string} key        Typed character (lowercase).
   */
  function focusTypeaheadOption(wrapper, key) {
    for (const item of wrapper.querySelectorAll('.select-option')) {
      if (
        item instanceof HTMLElement &&
        (item.textContent ?? '').trim().toLowerCase().startsWith(key)
      ) {
        item.focus();
        return;
      }
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
      focusTypeaheadOption(wrapper, event.key.toLowerCase());
    }
  }

  /**
   * Prepare a custom dropdown menu when it opens: Reset the search, render the options, position the menu
   * without anchor positioning, and focus the search or the selected option.
   * @param {Element} wrapper   `[data-select]` element.
   */
  function openSelectMenu(wrapper) {
    const { menu, search, trigger } = getSelectParts(wrapper);
    if (search) {
      search.value = '';
    }
    renderSelectOptions(wrapper);
    if (menu && trigger) {
      site?.placePopover(menu, trigger, { gap: 4, isWidthMatched: true });
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

  /** Bind every custom dropdown: Lazy option rendering, clicks, keyboard navigation, search, focus loss, and arrow keys. */
  function bindSelects() {
    for (const wrapper of form?.querySelectorAll('[data-select]') ?? []) {
      const { menu, search, trigger } = getSelectParts(wrapper);
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
      // Keyboard focus leaving the dropdown (e.g., `Tab`) closes the menu; Pointer dismissal is native.
      menu?.addEventListener('focusout', (event) => {
        if (event.relatedTarget instanceof Node && !wrapper.contains(event.relatedTarget)) {
          site?.closePopover(menu);
        }
      });
      search?.addEventListener('input', () => renderSelectOptions(wrapper));
      trigger?.addEventListener('keydown', (event) => {
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu?.showPopover) {
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
    function readPartValue(part) {
      return getPart(fieldElement, part)?.value ?? '';
    }
    switch (field.control) {
      case 'anim': {
        const sheen = getPart(fieldElement, 'sheen');
        return composeAnim(
          sheen instanceof HTMLInputElement && sheen.checked,
          readPartValue('left'),
          readPartValue('right')
        );
      }
      case 'color': {
        const checked = fieldElement.querySelector('input:checked');
        return checked instanceof HTMLInputElement ? checked.value : '';
      }
      case 'icon': {
        return readPartValue('main').trim();
      }
      case 'iconPair': {
        return composeIconPair(readPartValue('left'), readPartValue('right'), hasPresetIcon);
      }
      case 'size': {
        const preset = readPartValue('preset');
        return preset === 'custom' ? readPartValue('custom').trim() : preset;
      }
      case 'special': {
        return composeSpecial(
          readPartValue('kind'),
          readPartValue('payload'),
          readPartValue('modifier')
        );
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
    const kindOption = findOption(field.options, kind);
    const modifiers = kindOption?.modifiers ?? [];
    const payload = getPart(fieldElement, 'payload');
    const modifierSelect = getPart(fieldElement, 'modifier');
    if (payload instanceof HTMLInputElement) {
      payload.placeholder = kindOption?.placeholder ?? '';
    }
    if (modifierSelect instanceof HTMLSelectElement) {
      setSelectOptions(modifierSelect, modifiers, modifier);
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
   * Label a service segment field (`Owner :scope`), toggle its required state, and set its input placeholder;
   * Only the label text span changes, so the required mark survives.
   * @param {string} id            Field ID (`'owner'` or `'target'`).
   * @param {string} label         Base label.
   * @param {string} segmentName   Segment name from the service docs (e.g., `':scope'`).
   * @param {string} placeholder   Input placeholder.
   * @param {boolean} isRequired   Whether the segment is required.
   */
  function labelServiceSegment(id, label, segmentName, placeholder, isRequired) {
    const fieldElement = fieldElements.get(id);
    const textElement = fieldElement?.querySelector('.builder-label-text');
    if (textElement) {
      textElement.textContent = `${label} ${segmentName}`.trim();
    }
    fieldElement?.querySelector('.builder-required')?.toggleAttribute('hidden', !isRequired);
    const control = getControl(id);
    if (control instanceof HTMLInputElement) {
      control.placeholder = placeholder;
      control.toggleAttribute('aria-required', isRequired);
    }
  }

  /** Sync the owner, target, and metric controls of the service badge builder with the selected service. */
  function syncServiceFields() {
    const service = findService(schema, state.service);
    if (!service) {
      return;
    }
    fieldElements.get('owner')?.toggleAttribute('hidden', service.ownerMode === 'none');
    labelServiceSegment(
      'owner',
      'Owner',
      service.ownerName ?? '',
      service.ownerHint ?? '',
      service.ownerMode === 'required'
    );
    labelServiceSegment(
      'target',
      'Target',
      service.targetName,
      service.targetName.replace(':', ''),
      true
    );
    const metricControl = getControl('metric');
    const { metrics } = service;
    if (!findOption(metrics, state.metric ?? '')) {
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
        fieldElements.get(field.id)?.toggleAttribute('hidden', !isFieldVisible(field, state));
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
    const fieldElement = fieldElements.get(field.id);
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
        const special = splitSpecial(value, field.options ?? []);
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
   * @param {readonly HighlightToken[]} tokens
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
   * Load a preview, skipping unchanged sources (reduced motion previews are static).
   * @param {string} path   Root-relative SVG path (`''` hides the preview).
   */
  function loadPreview(path) {
    currentPreviewPath = path;
    const previewSrc = buildPreviewPath(path, reducedMotionQuery.matches);
    if (!previewImage || previewSrc === lastPreviewSrc) {
      return;
    }
    lastPreviewSrc = previewSrc;
    previewImage.toggleAttribute('hidden', !previewSrc);
    previewPlaceholder?.toggleAttribute('hidden', Boolean(previewSrc));
    if (previewSrc) {
      previewImage.classList.add('is-loading');
      previewImage.src = previewSrc;
    }
  }

  /**
   * Load (once, retried after failures) the icon picker index and build the resolver and picker catalog.
   * @returns {Promise<IconPickerIndex>}
   */
  function loadIconIndex() {
    return loadIconIndexOnce('').then((index) => {
      if (!iconIndex) {
        const resolver = createIconResolver(index, schema.maxIconSlugLength);
        /** @type {Record<IconPickerSetId, string[]>} */
        const catalog = { brands: [], lucide: [] };
        for (const set of /** @type {const} */ (['lucide', 'brands'])) {
          for (const slug of index.sets[set]) {
            // Only offer icons that render as shown (e.g., Lucide wins slug collisions outside tech stacks).
            if (resolver.resolve(slug, schema.isBrandFirst) === set) {
              catalog[set].push(slug);
            }
          }
        }
        iconIndex = index;
        iconResolver = resolver;
        pickerCatalog = catalog;
      }
      return index;
    });
  }

  /**
   * Load (once per page, retried after failures) an icon body page (versioned like the icon index).
   * @param {IconLocation} iconLocation
   * @returns {Promise<Record<string, string>>}
   */
  function loadIconPage(iconLocation) {
    return loadIconPageOnce(`${iconLocation.set}-${iconLocation.page}`);
  }

  /**
   * Create an inline glyph `<svg>` for an icon body from the page's glyph templates (paint attributes per set).
   * @param {IconPickerSetId} set
   * @param {string} innerSvg   Trusted icon body markup from `/assets/icons-*.json`.
   * @returns {SVGSVGElement}
   */
  function createGlyph(set, innerSvg) {
    const template =
      glyphTemplates instanceof HTMLTemplateElement
        ? glyphTemplates.content.querySelector(`svg[data-set="${set}"]`)
        : undefined;
    const glyph = template ? document.importNode(template, false) : undefined;
    const svg =
      glyph instanceof SVGSVGElement
        ? glyph
        : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.removeAttribute('data-set');
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
      () => {
        // Render again on the next change (the failed page is retried then).
        delete container.dataset.slug;
      }
    );
  }

  /**
   * Validate one icon input (or the stack groups textarea) against the icon index.
   * @param {Element} hint           `[data-validation-for]` hint element.
   * @param {IconResolver} resolver
   */
  function validateIconInput(hint, resolver) {
    const inputId = hint.getAttribute('data-validation-for') ?? '';
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
      return;
    }
    const value = input.value.trim();
    const slugs = input instanceof HTMLTextAreaElement ? collectStackSlugs(value) : [value];
    const unknown = [];
    for (const slug of slugs) {
      if (slug && resolver.resolve(slug, schema.isBrandFirst) === undefined) {
        unknown.push(slug);
      }
    }
    const more = unknown.length > MAX_LISTED_UNKNOWN_ICONS ? ', …' : '';
    hint.textContent =
      unknown.length > 0
        ? `Unknown icon${unknown.length > 1 ? 's' : ''}: ${unknown.slice(0, MAX_LISTED_UNKNOWN_ICONS).join(', ')}${more} (renders a fallback).`
        : '';
    hint.classList.toggle('is-warning', unknown.length > 0);
  }

  /**
   * Sync every icon selector inside a scope (slug text, placeholder, clear button, and glyph) with its hidden input.
   * @param {ParentNode} scope   Changed field element or the whole form.
   */
  function syncIconSelects(scope) {
    for (const trigger of scope.querySelectorAll('.icon-select-trigger')) {
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

  /**
   * Validate every icon input and the stack groups inside a scope (once the icon index has loaded).
   * @param {ParentNode} scope   Changed field element or the whole form.
   */
  function validateIcons(scope) {
    const resolver = iconResolver;
    if (resolver) {
      for (const hint of scope.querySelectorAll('[data-validation-for]')) {
        validateIconInput(hint, resolver);
      }
    }
  }

  /**
   * Enable or disable the URL outputs: Incomplete URLs have no Open SVG target, no copy action, and a hint.
   * @param {BuildResult} result
   */
  function syncOutputAvailability(result) {
    const isComplete = result.missing.length === 0;
    if (openLink) {
      if (isComplete) {
        openLink.href = result.path;
        openLink.tabIndex = 0;
        openLink.removeAttribute('aria-disabled');
      } else {
        openLink.removeAttribute('href');
        openLink.tabIndex = -1;
        openLink.setAttribute('aria-disabled', 'true');
      }
    }
    if (copyButton) {
      copyButton.disabled = !isComplete;
    }
    outputElement?.classList.toggle('is-incomplete', !isComplete);
    setStatus(
      isComplete
        ? ''
        : `Required: ${result.missing.join(', ')}. Fill in every required field to preview and copy the snippet.`,
      !isComplete
    );
  }

  /** Read the custom alt text and link target of the snippet options. */
  function readSnippetOptions() {
    return { alt: (altInput?.value ?? '').trim(), link: (linkInput?.value ?? '').trim() };
  }

  /** Rebuild the URL, snippets, links, and output availability for the current state (preview and history are debounced). */
  function renderOutputs() {
    const result = buildPath(schema, state);
    const isComplete = result.missing.length === 0;
    const absoluteUrl = `${schema.origin}${result.path}`;
    const autoAlt = buildAltText(schema, state);
    const options = readSnippetOptions();
    const alt = options.alt || autoAlt;
    if (altInput) {
      altInput.placeholder = autoAlt;
    }
    if (previewImage) {
      previewImage.alt = alt;
    }
    const link = options.link || buildDefaultLinkTarget(schema, state, absoluteUrl);
    renderCode(buildSnippetTokens(absoluteUrl, alt, link)[snippetFormat]);
    syncOutputAvailability(result);

    clearTimeout(previewTimer);
    previewTimer = globalThis.setTimeout(() => {
      loadPreview(isComplete ? result.path : '');
      history.replaceState(
        history.state,
        '',
        buildShareUrl(globalThis.location.href, result.path, options.alt, options.link)
      );
    }, PREVIEW_DEBOUNCE_MS);
  }

  /**
   * Refresh the outputs and sync the dropdowns, icon selectors, and icon validation of the changed controls.
   * @param {ParentNode} scope   Changed field element, or the whole form after a state replacement.
   */
  function update(scope) {
    renderOutputs();
    syncSelects(scope);
    syncIconSelects(scope);
    validateIcons(scope);
  }

  /**
   * Handle input on a field: Read its value, sync dependent controls, and update the outputs. Text-like controls
   * report through `input` only; `change` is handled for the (programmatically changed) native selects.
   * @param {Event} event
   */
  function handleFieldInput(event) {
    const { target } = event;
    if (event.type === 'change' && !(target instanceof HTMLSelectElement)) {
      return;
    }
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
    if (visibilityControllers.has(field.id)) {
      syncVisibility();
    }
    update(fieldElement);
  }

  /**
   * Select a snippet format tab.
   * @param {HTMLElement} tab
   */
  function selectTab(tab) {
    const { format } = tab.dataset;
    snippetFormat = format === 'html' || format === 'url' ? format : 'markdown';
    for (const otherTab of document.querySelectorAll('.builder-tab')) {
      const isSelected = otherTab === tab;
      otherTab.classList.toggle('is-active', isSelected);
      otherTab.setAttribute('aria-selected', String(isSelected));
      otherTab.setAttribute('tabindex', isSelected ? '0' : '-1');
    }
    document.getElementById('builder-code')?.setAttribute('aria-labelledby', tab.id);
    renderOutputs();
  }

  /**
   * Compute the filtered icon picker matches for the active set tab and search query (prefix matches first).
   * @param {IconPickerIndex} index
   * @param {Record<IconPickerSetId, string[]>} catalog
   * @returns {IconMatch[]}
   */
  function computePickerMatches(index, catalog) {
    const checkedTab = picker?.querySelector('input[name="icon-picker-set"]:checked');
    const tab = checkedTab instanceof HTMLInputElement ? checkedTab.value : 'all';
    const query = (pickerSearch?.value ?? '').trim().toLowerCase();
    /** @type {IconPickerSetId[]} */
    const sets = tab === 'lucide' || tab === 'brands' ? [tab] : ['lucide', 'brands'];
    /** @type {Set<string>} */
    const aliasHits = new Set();
    if (query) {
      for (const [alias, primary] of Object.entries(index.lucideAliases)) {
        if (alias.includes(query)) {
          aliasHits.add(primary);
        }
      }
    }
    /** @type {IconMatch[]} */
    const matches = [];
    /** @type {IconMatch[]} */
    const otherMatches = [];
    for (const set of sets) {
      for (const slug of catalog[set]) {
        if (!query || slug.startsWith(query)) {
          matches.push({ set, slug });
        } else if (slug.includes(query) || (set === 'lucide' && aliasHits.has(slug))) {
          otherMatches.push({ set, slug });
        }
      }
    }
    for (const match of otherMatches) {
      matches.push(match);
    }
    return matches;
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
    for (let i = pickerRendered; i < end; i += 1) {
      const match = pickerMatches[i];
      // `end` never exceeds `pickerMatches.length`; The guard only narrows the indexed access.
      if (match === undefined) {
        break;
      }
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'icon-tile';
      tile.dataset.index = String(i);
      tile.dataset.slug = match.slug;
      tile.setAttribute('role', 'option');
      tile.setAttribute('aria-label', match.slug);
      tile.setAttribute('aria-selected', String(match.slug === pickerSelectedSlug));
      tile.title = match.slug;
      tile.tabIndex = -1;
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

  /**
   * Render picker chunks until a match index is rendered.
   * @param {number} index   Match index.
   */
  function renderPickerUntil(index) {
    while (pickerRendered <= index && pickerRendered < pickerMatches.length) {
      renderPickerChunk();
    }
  }

  /**
   * Find a rendered picker tile by its match index.
   * @param {number} index   Match index.
   * @returns {HTMLElement | undefined}
   */
  function getTileAt(index) {
    const tile = pickerGrid?.children[index];
    return tile instanceof HTMLElement && tile.classList.contains('icon-tile') ? tile : undefined;
  }

  /**
   * Move the roving tab stop of the picker grid to a tile (optionally focusing it).
   * @param {HTMLElement} tile
   * @param {boolean} isFocused   Whether the tile receives the focus.
   */
  function setRovingTile(tile, isFocused) {
    for (const otherTile of pickerGrid?.querySelectorAll('.icon-tile[tabindex="0"]') ?? []) {
      if (otherTile instanceof HTMLElement) {
        otherTile.tabIndex = -1;
      }
    }
    tile.tabIndex = 0;
    if (isFocused) {
      tile.focus();
    }
  }

  /** Render the picker's empty state with a clear-search action (handled by the grid's click listener). */
  function renderPickerEmpty() {
    const empty = document.createElement('div');
    empty.className = 'icon-picker-empty';
    empty.append('No icons found.');
    if (pickerSearch?.value.trim()) {
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'text-btn';
      clearButton.dataset.pickerClear = 'true';
      clearButton.textContent = 'Clear search';
      empty.append(' ', clearButton);
    }
    pickerGrid?.append(empty);
  }

  /**
   * Find the match index of the picker target's current icon (`-1` when none or in insert mode).
   * @returns {number}
   */
  function findSelectedMatchIndex() {
    if (!pickerSelectedSlug) {
      return -1;
    }
    return pickerMatches.findIndex((match) => match.slug === pickerSelectedSlug);
  }

  /**
   * Re-render the icon picker grid for the current tab and query.
   * @param {boolean} isOpening   Whether the picker just opened (scrolls to and highlights the current icon).
   */
  function renderPicker(isOpening) {
    if (!iconIndex || !pickerCatalog || !pickerGrid) {
      return;
    }
    pickerSearchFrame = 0;
    const currentSlug =
      !isPickerInsertMode && pickerTarget instanceof HTMLInputElement ? pickerTarget.value : '';
    pickerSelectedSlug = iconResolver?.locate(currentSlug, schema.isBrandFirst)?.slug ?? '';
    pickerMatches = computePickerMatches(iconIndex, pickerCatalog);
    pickerRendered = 0;
    // Disconnect before dropping the old tiles, so detached tiles are never kept alive by the observers.
    tileObserver?.disconnect();
    sentinelObserver?.disconnect();
    pickerGrid.replaceChildren();
    pickerGrid.scrollTop = 0;
    if (pickerMatches.length === 0) {
      renderPickerEmpty();
    } else {
      const selectedIndex = isOpening ? findSelectedMatchIndex() : -1;
      renderPickerUntil(Math.max(0, selectedIndex));
      const rovingTile = getTileAt(Math.max(0, selectedIndex));
      if (rovingTile) {
        setRovingTile(rovingTile, false);
        if (selectedIndex > 0) {
          rovingTile.scrollIntoView({ block: 'center' });
        }
      }
    }
    if (pickerStatus) {
      pickerStatus.textContent =
        pickerMatches.length === 0
          ? 'No icons found.'
          : `${pickerMatches.length.toLocaleString('en-US')} icon${pickerMatches.length === 1 ? '' : 's'}`;
    }
  }

  /** Re-render the picker in the next animation frame (coalesces fast typing in the search field). */
  function scheduleRenderPicker() {
    cancelAnimationFrame(pickerSearchFrame);
    pickerSearchFrame = requestAnimationFrame(() => renderPicker(false));
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
      site?.closePopover(picker);
    }
    (target instanceof HTMLTextAreaElement ? target : (pickerTrigger ?? target)).focus();
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
      const fieldElement = fieldElements.get(field.id);
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
    update(form ?? document);
  }

  /** Apply the initial state: A shared or "Open in Builder" link (path, alt text, link target) wins over the example. */
  function initializeState() {
    const pageParams = new URL(globalThis.location.href).searchParams;
    const sharedPath = pageParams.get('path');
    const parsedState = sharedPath ? parsePath(schema, sharedPath) : undefined;
    if (altInput) {
      altInput.value = pageParams.get('alt') ?? '';
    }
    if (linkInput) {
      linkInput.value = pageParams.get('link') ?? '';
    }
    applyState(parsedState ?? schema.initialState);
    if (sharedPath && !parsedState) {
      setStatus('The shared link belongs to another builder; Showing the example instead.', true);
    }
  }

  /** Copy a shareable builder link (path, alt text, and link target) with copy feedback on the share button. */
  function copyShareLink() {
    const options = readSnippetOptions();
    if (shareButton) {
      site?.copyText(
        buildShareUrl(
          globalThis.location.href,
          buildPath(schema, state).path,
          options.alt,
          options.link
        ),
        shareButton
      );
    }
  }

  /**
   * Handle arrow keys on the snippet format tabs (roving selection).
   * @param {KeyboardEvent} event
   */
  function handleTabKeydown(event) {
    /** @type {Readonly<Record<string, number>>} */
    const offsets = { ArrowLeft: -1, ArrowRight: 1 };
    const offset = offsets[event.key];
    if (offset === undefined) {
      return;
    }
    const tabs = [...document.querySelectorAll('.builder-tab')];
    let current = 0;
    for (const [i, tab] of tabs.entries()) {
      if (tab.getAttribute('aria-selected') === 'true') {
        current = i;
      }
    }
    const next = tabs[(current + offset + tabs.length) % tabs.length];
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
    altInput?.addEventListener('input', renderOutputs);
    linkInput?.addEventListener('input', renderOutputs);
    if (linkInput && schema.kind === 'service') {
      linkInput.placeholder = 'Upstream page of the service';
    }

    previewImage?.addEventListener('load', () => {
      previewImage.classList.remove('is-loading');
      if (buildPath(schema, state).missing.length === 0) {
        setStatus('');
      }
    });
    previewImage?.addEventListener('error', () => {
      previewImage.classList.remove('is-loading');
      setStatus('The preview could not be loaded; Check the route values.', true);
    });
    reducedMotionQuery.addEventListener('change', () => loadPreview(currentPreviewPath));

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
   * Remember the picker target and trigger of a clicked picker button.
   * @param {HTMLElement} button   `[data-icon-target]` button.
   */
  function targetPicker(button) {
    pickerTarget = document.getElementById(button.dataset.iconTarget ?? '') ?? undefined;
    pickerTrigger = button;
    isPickerInsertMode = button.dataset.iconInsert === 'true';
    pickerNoneButton?.toggleAttribute('hidden', button.dataset.iconNone !== 'true');
  }

  /** Prepare the opened picker: Position it, reset the search, and render it (loading the index first if needed). */
  function openPicker() {
    if (picker && pickerTrigger) {
      site?.placePopover(picker, pickerTrigger, { gap: 6 });
    }
    if (pickerSearch) {
      pickerSearch.value = '';
      pickerSearch.focus();
    }
    if (iconIndex) {
      renderPicker(true);
      return;
    }
    if (pickerStatus) {
      pickerStatus.textContent = 'Loading icons…';
    }
    loadIconIndex().then(
      () => {
        syncIconSelects(form ?? document);
        validateIcons(form ?? document);
        if (picker && site?.isPopoverOpen(picker)) {
          renderPicker(true);
        }
      },
      () => {
        if (pickerStatus) {
          pickerStatus.textContent = 'Icons could not be loaded; Reopen the picker to retry.';
        }
      }
    );
  }

  /**
   * Handle keys in the picker search (`ArrowDown` focuses the grid, `Enter` picks the first match).
   * @param {KeyboardEvent} event
   */
  function handlePickerSearchKeydown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const rovingTile = pickerGrid?.querySelector('.icon-tile[tabindex="0"]');
      if (rovingTile instanceof HTMLElement) {
        rovingTile.focus();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (pickerSearchFrame) {
        cancelAnimationFrame(pickerSearchFrame);
        renderPicker(false);
      }
      const [firstMatch] = pickerMatches;
      if (firstMatch) {
        applyPickedSlug(firstMatch.slug);
      }
    }
  }

  /**
   * Handle arrow, `Home`, and `End` keys in the picker grid (roving focus across all matches).
   * @param {KeyboardEvent} event
   */
  function handlePickerGridKeydown(event) {
    const tile =
      event.target instanceof HTMLElement ? event.target.closest('.icon-tile') : undefined;
    if (!(tile instanceof HTMLElement)) {
      return;
    }
    const targetIndex = computeGridFocusIndex(
      event.key,
      Number(tile.dataset.index ?? 0),
      getPickerColumns(),
      pickerMatches.length
    );
    if (targetIndex === undefined) {
      return;
    }
    event.preventDefault();
    renderPickerUntil(targetIndex);
    const targetTile = getTileAt(targetIndex);
    if (targetTile) {
      setRovingTile(targetTile, true);
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
        for (const entry of entries) {
          if (entry.isIntersecting) {
            renderPickerChunk();
            return;
          }
        }
      },
      { root: gridElement, rootMargin: '240px 0px' }
    );

    document.addEventListener('click', (event) => {
      const button =
        event.target instanceof Element ? event.target.closest('[data-icon-target]') : undefined;
      if (button instanceof HTMLElement) {
        targetPicker(button);
      }
    });
    pickerElement.addEventListener('toggle', (event) => {
      if (/** @type {ToggleEvent} */ (event).newState === 'open') {
        openPicker();
      }
    });
    pickerElement.addEventListener('focusout', (event) => {
      if (
        event.relatedTarget instanceof Node &&
        !pickerElement.contains(event.relatedTarget) &&
        (!pickerTrigger || !pickerTrigger.contains(event.relatedTarget))
      ) {
        site?.closePopover(pickerElement);
      }
    });
    pickerElement.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement && event.target.name === 'icon-picker-set') {
        renderPicker(false);
      }
    });
    pickerSearch?.addEventListener('input', scheduleRenderPicker);
    pickerSearch?.addEventListener('keydown', handlePickerSearchKeydown);

    gridElement.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : undefined;
      if (target?.closest('[data-picker-clear]') && pickerSearch) {
        pickerSearch.value = '';
        pickerSearch.focus();
        renderPicker(false);
        return;
      }
      const tile = target?.closest('.icon-tile');
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

  // Icon index: Load in the background for validation and glyph previews (the picker retries failed loads).
  loadIconIndex().then(
    () => {
      syncIconSelects(form);
      validateIcons(form);
      if (picker && site.isPopoverOpen(picker)) {
        renderPicker(true);
      }
    },
    () => undefined
  );
})();
