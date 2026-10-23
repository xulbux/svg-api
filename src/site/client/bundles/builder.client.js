'use strict';
(() => {
  // src/site/shared/snippets.ts
  var HTML_ENTITIES = { '"': '&quot;', '<': '&lt;', '>': '&gt;' };
  var MARKDOWN_ALT_RX = /[[\]\\]/g;
  var MARKDOWN_DESTINATION_RX = /[ ()<>]/g;
  var HTML_ATTR_RX = /["<>]/g;
  function escapeHtmlAttribute(value) {
    return value.replace(HTML_ATTR_RX, (char) => HTML_ENTITIES[char] ?? char);
  }
  function joinTokens(tokens) {
    let text = '';
    for (const token of tokens) {
      text += token[1];
    }
    return text;
  }
  function encodeMarkdownDestination(text) {
    return text.replace(
      MARKDOWN_DESTINATION_RX,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  }
  function tokenizeUrl(url) {
    const queryIndex = url.indexOf('?');
    const base = queryIndex === -1 ? url : url.slice(0, queryIndex);
    const schemeEnd = base.indexOf('://');
    const endpointSlash = schemeEnd === -1 ? base.indexOf('/') : base.indexOf('/', schemeEnd + 3);
    const pathSlash = endpointSlash === -1 ? -1 : base.indexOf('/', endpointSlash + 1);
    const tokens =
      pathSlash === -1
        ? [['hl-url', base]]
        : [
            ['hl-url', base.slice(0, pathSlash)],
            ['hl-path', base.slice(pathSlash)],
          ];
    if (queryIndex === -1) {
      return tokens;
    }
    for (const [i, pair] of url
      .slice(queryIndex + 1)
      .split('&')
      .entries()) {
      const prefix = i === 0 ? '?' : '&';
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex === -1) {
        tokens.push(['hl-key', `${prefix}${pair}`]);
      } else {
        tokens.push(['hl-key', `${prefix}${pair.slice(0, equalsIndex + 1)}`]);
        const value = pair.slice(equalsIndex + 1);
        if (value) {
          tokens.push(['hl-val', value]);
        }
      }
    }
    return tokens;
  }
  function buildMarkdownSnippetTokens(url, alt, href) {
    const tokens = href ? [['hl-p', '[']] : [];
    tokens.push(
      ['hl-p', '!['],
      ['hl-alt', alt.replace(MARKDOWN_ALT_RX, String.raw`\$&`)],
      ['hl-p', '](']
    );
    for (const [className, text] of tokenizeUrl(url)) {
      tokens.push([className, encodeMarkdownDestination(text)]);
    }
    tokens.push(['hl-p', ')']);
    if (href) {
      tokens.push(['hl-p', ']('], ['hl-href', encodeMarkdownDestination(href)], ['hl-p', ')']);
    }
    return tokens;
  }
  function buildSnippetTokens(url, alt, link) {
    const urlTokens = tokenizeUrl(url);
    const markdown = buildMarkdownSnippetTokens(url, alt, link || undefined);
    const html = link
      ? [
          ['hl-p', '<a href="'],
          ['hl-href', escapeHtmlAttribute(link)],
          ['hl-p', '">'],
        ]
      : [];
    html.push(['hl-p', '<img src="']);
    for (const [className, text] of urlTokens) {
      html.push([className, escapeHtmlAttribute(text)]);
    }
    html.push(['hl-p', '" alt="'], ['hl-alt', escapeHtmlAttribute(alt)], ['hl-p', '" />']);
    if (link) {
      html.push(['hl-p', '</a>']);
    }
    return { html, markdown, url: urlTokens };
  }
  function buildSnippets(url, alt, link) {
    const tokens = buildSnippetTokens(url, alt, link);
    return {
      html: joinTokens(tokens.html),
      markdown: joinTokens(tokens.markdown),
      url: joinTokens(tokens.url),
    };
  }

  // src/site/shared/url.ts
  var MAX_STACK_BAND_COLUMNS = 8;
  var MAX_PER_LINE_COLUMNS = 20;
  var STATIC_ANIM_PAIR = 'anim=none';
  var CENTER_FLAG_VALUES = /* @__PURE__ */ new Set(['1', 'true', 'yes']);
  var READABLE_ESCAPE_RX = /%(?:2C|3A|3B|40|7C)/g;
  var ESCAPED_SPACE_RX = /%20/g;
  var PARENTHESIS_RX = /[()]/g;
  var PLUS_SIGN_RX = /\+/g;
  var LIST_SEPARATOR_RX = /[,\s]+/;
  var STACK_GROUP_SEPARATOR_RX = /[;|]+/;
  var COLUMN_SUFFIX_RX = /(?<=.):\d+$/;
  var LINE_BREAK_RX = /\s*\n\s*/g;
  var WHITESPACE_RX = /\s+/g;
  var HINT_ICON_REST_RX = /^(?<slug>[^\s:]+)(?:[\s:]+(?<text>[\s\S]*))?$/;
  function encodeSegment(text) {
    return encodeURIComponent(text)
      .replace(ESCAPED_SPACE_RX, '+')
      .replace(READABLE_ESCAPE_RX, decodeURIComponent)
      .replace(PARENTHESIS_RX, (char) => (char === '(' ? '%28' : '%29'));
  }
  function decodeSegment(raw) {
    const withSpaces = raw.replace(PLUS_SIGN_RX, ' ');
    try {
      return decodeURIComponent(withSpaces);
    } catch {
      return withSpaces;
    }
  }
  function findService(schema, key) {
    for (const service of schema.services ?? []) {
      if (service.key === key) {
        return service;
      }
    }
    return undefined;
  }
  function findOption(options, value) {
    for (const option of options ?? []) {
      if (option.value === value) {
        return option;
      }
    }
    return undefined;
  }
  function findField(schema, id) {
    for (const field of schema.fields) {
      if (field.id === id) {
        return field;
      }
    }
    return undefined;
  }
  function readState(state, id) {
    return (state[id] ?? '').trim();
  }
  function normalizeStackGroups(value) {
    return value.trim().replace(LINE_BREAK_RX, ';').replace(WHITESPACE_RX, '');
  }
  function normalizeTypingLinesInput(value) {
    return value.trim().replace(LINE_BREAK_RX, ';');
  }
  function formatStackBand(bandGroups, maxBandCols = MAX_STACK_BAND_COLUMNS) {
    let bandRows = 1;
    let totalCount = 0;
    let minGroupCount = Infinity;
    let maxGroupCount = 0;
    for (const group of bandGroups) {
      bandRows = Math.max(bandRows, Math.ceil(group.length / maxBandCols));
      totalCount += group.length;
      minGroupCount = Math.min(minGroupCount, group.length);
      maxGroupCount = Math.max(maxGroupCount, group.length);
    }
    if (
      bandRows === 1 &&
      bandGroups.length === 2 &&
      totalCount > maxBandCols &&
      maxGroupCount >= 6 &&
      minGroupCount >= 3
    ) {
      bandRows = 2;
    }
    if (bandRows > 1 && bandGroups.length > 2) {
      return undefined;
    }
    const groupStrings = [];
    let totalCols = 0;
    for (const group of bandGroups) {
      const count = group.length;
      const maxGroupRows = count < 3 ? 1 : Math.ceil(count / 2);
      const rows = Math.max(Math.ceil(count / maxBandCols), Math.min(bandRows, maxGroupRows));
      const cols = Math.ceil(count / rows);
      totalCols += cols;
      groupStrings.push(cols < count ? `${group.join(',')}:${cols}` : group.join(','));
    }
    return bandGroups.length > 1 && totalCols > maxBandCols ? undefined : groupStrings.join('|');
  }
  function parsePerLineValues(rawPerLine) {
    const values = [];
    for (const part of rawPerLine.trim().split(LIST_SEPARATOR_RX)) {
      const cleaned = part.trim();
      const parsed = cleaned ? Number(cleaned) : Number.NaN;
      const rounded = Math.round(parsed);
      values.push(
        Number.isFinite(parsed) && parsed >= 1
          ? Math.min(MAX_PER_LINE_COLUMNS, Math.max(1, rounded))
          : undefined
      );
    }
    while (values.length > 0 && values.at(-1) === undefined) {
      values.pop();
    }
    return values;
  }
  function composeStackWithExplicitPerLine(categoryGroups, perLineValues) {
    const defaultPerLine = perLineValues[0] ?? MAX_STACK_BAND_COLUMNS;
    const explicitBands = [];
    let bandTokens = [];
    let bandCols = 0;
    let bandMaxRows = 1;
    let groupIndex = 0;
    for (const group of categoryGroups) {
      const tokens = group.filter(Boolean);
      if (tokens.length > 0) {
        const groupPerLine =
          perLineValues[Math.min(groupIndex, perLineValues.length - 1)] ?? defaultPerLine;
        const groupRows = Math.ceil(tokens.length / groupPerLine);
        const groupCols = Math.ceil(tokens.length / groupRows);
        const groupToken =
          groupCols < tokens.length && groupCols !== groupPerLine
            ? `${tokens.join(',')}:${groupCols}`
            : tokens.join(',');
        const nextMaxRows = Math.max(bandMaxRows, groupRows);
        if (
          bandTokens.length > 0 &&
          (bandCols + groupCols > MAX_STACK_BAND_COLUMNS ||
            (nextMaxRows > 1 && bandTokens.length >= 2))
        ) {
          explicitBands.push(bandTokens.join('|'));
          bandTokens = [groupToken];
          bandCols = groupCols;
          bandMaxRows = groupRows;
        } else {
          bandTokens.push(groupToken);
          bandCols += groupCols;
          bandMaxRows = nextMaxRows;
        }
        groupIndex += 1;
      }
    }
    if (bandTokens.length > 0) {
      explicitBands.push(bandTokens.join('|'));
    }
    return explicitBands.join(';');
  }
  function buildLabelValuePathname(prefix, label, value) {
    if (!label && !value) {
      return `/${prefix}`;
    }
    return `/${prefix}/${encodeSegment(label)}${value ? `/${encodeSegment(value)}` : ''}`;
  }
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
  function buildServicePathname(schema, state) {
    const service = findService(schema, readState(state, 'service'));
    const owner = service && service.ownerMode !== 'none' ? readState(state, 'owner') : '';
    const target = encodeServiceTarget(service, readState(state, 'target'));
    const ownerPart = owner ? `${encodeSegment(owner)}/` : '';
    return `/badge/${encodeSegment(readState(state, 'service'))}/${ownerPart}${target}/${encodeSegment(readState(state, 'metric'))}`;
  }
  function buildPathname(schema, state) {
    switch (schema.kind) {
      case 'badge': {
        return buildLabelValuePathname(
          'badge',
          readState(state, 'label'),
          readState(state, 'value')
        );
      }
      case 'button': {
        return buildLabelValuePathname(
          'button',
          readState(state, 'label'),
          readState(state, 'value')
        );
      }
      case 'icon': {
        const icon = encodeSegment(readState(state, 'icon'));
        return icon ? `/icon/${icon}` : '/icon';
      }
      case 'quote': {
        const author = readState(state, 'author');
        const text = encodeSegment(readState(state, 'text'));
        if (author) {
          return `/quote/${encodeSegment(author)}/${text}`;
        }
        return text ? `/quote/${text}` : '/quote';
      }
      case 'service': {
        return buildServicePathname(schema, state);
      }
      case 'stack': {
        const groups = encodeSegment(normalizeStackGroups(readState(state, 'groups')));
        return groups ? `/stack/${groups}` : '/stack';
      }
      case 'typing': {
        const prefix = readState(state, 'prefix');
        const lines = encodeSegment(normalizeTypingLinesInput(readState(state, 'lines')));
        if (prefix) {
          return `/typing/${encodeSegment(prefix)}/${lines}`;
        }
        return lines ? `/typing/${lines}` : '/typing';
      }
      default: {
        return '/';
      }
    }
  }
  function isTypingFieldActiveForLayout(fieldId, layoutValue) {
    const effectiveLayout = layoutValue.trim().toLowerCase() || 'window';
    if (fieldId === 'title') {
      return effectiveLayout === 'window' || effectiveLayout === 'ide';
    }
    if (fieldId === 'hint') {
      return effectiveLayout !== 'none';
    }
    if (fieldId === 'align') {
      return effectiveLayout !== 'browser' && effectiveLayout !== 'ide';
    }
    return true;
  }
  function buildQuery(schema, state) {
    const pairs = [];
    const typingLayout = schema.kind === 'typing' ? readState(state, 'layout') : '';
    for (const field of schema.fields) {
      const value = (state[field.id] ?? '').trim();
      const isFieldActive =
        schema.kind !== 'typing' || isTypingFieldActiveForLayout(field.id, typingLayout);
      if (field.param && value && isFieldActive) {
        pairs.push(`${field.param}=${encodeSegment(value)}`);
      }
    }
    return pairs.length > 0 ? `?${pairs.join('&')}` : '';
  }
  function readQueryParam(query, names) {
    for (const name of names) {
      const value = query.get(name);
      if (value) {
        return value;
      }
    }
    return '';
  }
  function readSegmentFallback(schema, query, id) {
    return readQueryParam(query, findField(schema, id)?.aliases ?? []);
  }
  function resolveAnimOptionToken(token, options) {
    if (token === 'default') {
      return '';
    }
    if (!options) {
      return token;
    }
    for (const option of options) {
      if (option.value === token || option.aliases?.includes(token)) {
        return option.value;
      }
    }
    return undefined;
  }
  function composeAnim(hasSheen, left, right) {
    const tokens = hasSheen ? ['sheen'] : [];
    if (right) {
      tokens.push(left || 'default', right);
    } else if (left) {
      tokens.push(left);
    }
    return tokens.join(',');
  }
  function splitAnim(value, options) {
    const motions = [];
    let hasSheen = false;
    for (const token of value.trim().toLowerCase().split(LIST_SEPARATOR_RX)) {
      if (token === 'sheen') {
        if (hasSheen && options) {
          return { hasSheen: false, left: '', right: '' };
        }
        hasSheen = true;
      } else if (token) {
        const resolved = resolveAnimOptionToken(token, options);
        if (resolved === undefined) {
          return { hasSheen: false, left: '', right: '' };
        }
        motions.push(resolved);
      }
    }
    if (options && motions.length > 2) {
      return { hasSheen: false, left: '', right: '' };
    }
    const left = motions[0] ?? '';
    const right = motions[1] ?? '';
    if (hasSheen && !right && left === 'none') {
      return { hasSheen, left: '', right: '' };
    }
    return { hasSheen, left, right };
  }
  function normalizeOptionValue(field, raw) {
    if (field.control === 'number') {
      const clean2 = raw.trim();
      return clean2 && Number.isFinite(Number(clean2)) ? clean2 : '';
    }
    if (field.control === 'size') {
      const clean2 = raw.trim().toLowerCase();
      return clean2 && (findOption(field.options, clean2) || Number.isFinite(Number(clean2)))
        ? clean2
        : '';
    }
    if (field.control === 'anim') {
      const anim = splitAnim(raw, field.options);
      if (field.animScope === 'stack' && anim.right) {
        return '';
      }
      return composeAnim(anim.hasSheen, anim.left, field.animScope === 'pair' ? anim.right : '');
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
  function canonicalizeMetric(service, raw) {
    const clean = raw.trim().toLowerCase();
    const aliases = service.metricAliases;
    return aliases && Object.hasOwn(aliases, clean) ? (aliases[clean] ?? clean) : clean;
  }
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
    if (segments.at(-1) === '') {
      segments.pop();
    }
    return { prefix: rawParts[1] ?? '', query: url.searchParams, segments };
  }
  var PATH_PARSERS = {
    badge(state, { prefix, segments }) {
      Object.assign(state, { label: segments[0] ?? '', value: segments[1] ?? '' });
      return prefix === 'badge' && segments.length <= 2;
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
    typing(state, { prefix, query, segments }, schema) {
      const hasPrefixSegment = segments.length === 2;
      state.prefix = hasPrefixSegment
        ? (segments[0] ?? '')
        : readSegmentFallback(schema, query, 'prefix');
      state.lines =
        (hasPrefixSegment ? segments[1] : segments[0]) ||
        readSegmentFallback(schema, query, 'lines');
      const alignField = findField(schema, 'align');
      const alignNames = alignField?.param ? [alignField.param, ...(alignField.aliases ?? [])] : [];
      const center = (query.get('center') ?? '').trim().toLowerCase();
      if (!readQueryParam(query, alignNames).trim() && CENTER_FLAG_VALUES.has(center)) {
        state.align = 'center';
      }
      return (prefix === 'typing' || prefix === 'type') && segments.length <= 2;
    },
  };
  function joinNonEmpty(parts, separator) {
    let joined = '';
    for (const part of parts) {
      if (part) {
        joined = joined ? `${joined}${separator}${part}` : part;
      }
    }
    return joined;
  }
  var cachedRedirectPatternRx = undefined;
  var cachedRedirectPatternSource = '';
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
  function composeIconPair(left, right, hasPresetIcon) {
    const leftSlug = left.trim();
    const rightSlug = right.trim();
    if (!rightSlug) {
      return leftSlug;
    }
    return `${leftSlug || (hasPresetIcon ? '' : 'none')},${rightSlug}`;
  }
  function splitIconPair(value, hasPresetIcon) {
    const commaIndex = value.indexOf(',');
    if (commaIndex === -1) {
      return [value.trim(), ''];
    }
    const left = value.slice(0, commaIndex).trim();
    const right = value.slice(commaIndex + 1).trim();
    return [left === 'none' && !hasPresetIcon ? '' : left, right];
  }
  function composeHint(icon, text) {
    const cleanIcon = icon.trim();
    const cleanText = text.trim();
    if (!cleanIcon || cleanIcon.toLowerCase() === 'none') {
      return cleanText;
    }
    return cleanText ? `icon:${cleanIcon} ${cleanText}` : `icon:${cleanIcon}`;
  }
  function splitHint(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === 'none') {
      return { icon: '', text: '' };
    }
    if (trimmed.slice(0, 5).toLowerCase() === 'icon:') {
      const rest = trimmed.slice(5).trim();
      if (!rest) {
        return { icon: '', text: '' };
      }
      const match = HINT_ICON_REST_RX.exec(rest);
      const icon = (match?.groups?.slug ?? '').trim();
      const text = (match?.groups?.text ?? '').trim();
      return { icon: icon.toLowerCase() === 'none' ? '' : icon, text };
    }
    return { icon: '', text: trimmed };
  }
  function composeSpecial(kind, payload, modifier, isAutoAllowed = false) {
    if (!kind) {
      return '';
    }
    if (kind === 'none') {
      return 'none';
    }
    const cleanPayload = payload.trim();
    if (!cleanPayload) {
      if (!isAutoAllowed) {
        return '';
      }
      return modifier ? `${kind}:${modifier}` : kind;
    }
    return modifier ? `${kind}:${cleanPayload}:${modifier}` : `${kind}:${cleanPayload}`;
  }
  function splitSpecial(value, options) {
    const trimmed = value.trim();
    if (!trimmed) {
      return { kind: '', modifier: '', payload: '' };
    }
    const lower = trimmed.toLowerCase();
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      return findOption(options, lower)
        ? { kind: lower, modifier: '', payload: '' }
        : { kind: '', modifier: '', payload: '' };
    }
    if (colonIndex === 0) {
      return { kind: '', modifier: '', payload: '' };
    }
    const kind = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const kindOption = findOption(options, kind);
    if (!kindOption || kind === 'none') {
      return { kind: '', modifier: '', payload: '' };
    }
    let payload = trimmed.slice(colonIndex + 1);
    let modifier = '';
    const { modifiers } = kindOption;
    const trimmedPayloadLower = payload.trim().toLowerCase();
    if (modifiers && trimmedPayloadLower && findOption(modifiers, trimmedPayloadLower)) {
      return { kind, modifier: trimmedPayloadLower, payload: '' };
    }
    const lastColon = payload.lastIndexOf(':');
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
    const cleanPayload = payload.trim();
    return { kind, modifier, payload: cleanPayload.toLowerCase() === 'auto' ? '' : cleanPayload };
  }
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
  function collectStackTileTokens(groups) {
    const tokens = [];
    for (const rawGroup of normalizeStackGroups(groups).split(STACK_GROUP_SEPARATOR_RX)) {
      const iconList = rawGroup.replace(COLUMN_SUFFIX_RX, '');
      for (const token of iconList.split(',')) {
        if (token) {
          tokens.push(token);
        }
      }
    }
    return tokens;
  }
  function stripStackTileColor(token) {
    const atIndex = token.lastIndexOf('@');
    return atIndex > 0 ? token.slice(0, atIndex) : token;
  }
  function collectStackSlugs(groups) {
    const slugs = [];
    for (const token of collectStackTileTokens(groups)) {
      const slug = stripStackTileColor(token);
      if (slug) {
        slugs.push(slug);
      }
    }
    return slugs;
  }
  function composeCategorizedStack(categoryGroups, isGroupedByCategory, rawPerLine = '') {
    if (!isGroupedByCategory) {
      const flatTokens = [];
      for (const group of categoryGroups) {
        for (const token of group) {
          if (token) {
            flatTokens.push(token);
          }
        }
      }
      return flatTokens.join(',');
    }
    const perLineValues = parsePerLineValues(rawPerLine);
    if (perLineValues.length > 1) {
      return composeStackWithExplicitPerLine(categoryGroups, perLineValues);
    }
    const maxBandCols = perLineValues[0] ?? MAX_STACK_BAND_COLUMNS;
    const bandStrings = [];
    let currentBand = [];
    for (const group of categoryGroups) {
      const tokens = group.filter(Boolean);
      if (tokens.length > 0) {
        if (
          currentBand.length > 0 &&
          formatStackBand([...currentBand, tokens], maxBandCols) === undefined
        ) {
          bandStrings.push(formatStackBand(currentBand, maxBandCols) ?? '');
          currentBand = [tokens];
        } else {
          currentBand.push(tokens);
        }
      }
    }
    if (currentBand.length > 0) {
      bandStrings.push(formatStackBand(currentBand, maxBandCols) ?? '');
    }
    return bandStrings.join(';');
  }
  function buildPath(schema, state) {
    const missing = [];
    for (const field of schema.fields) {
      if (field.isRequired && !readState(state, field.id)) {
        missing.push(field.label);
      }
    }
    const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
    if (service?.ownerMode === 'required' && !readState(state, 'owner')) {
      missing.push('Owner');
    }
    return { missing, path: `${buildPathname(schema, state)}${buildQuery(schema, state)}` };
  }
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
  function parsePath(schema, rawPath) {
    const route = parseRoute(rawPath, schema.origin);
    const parsePathSegments = PATH_PARSERS[schema.kind];
    if (!route || !parsePathSegments) {
      return undefined;
    }
    const state = {};
    for (const field of schema.fields) {
      const raw = field.param
        ? readQueryParam(route.query, [field.param, ...(field.aliases ?? [])])
        : '';
      state[field.id] = normalizeOptionValue(field, raw);
    }
    return parsePathSegments(state, route, schema) ? state : undefined;
  }
  function buildAltText(schema, state) {
    switch (schema.kind) {
      case 'badge': {
        return (
          joinNonEmpty([readState(state, 'label'), readState(state, 'value')], ': ') || 'Badge'
        );
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
      case 'typing': {
        const firstLine = normalizeTypingLinesInput(readState(state, 'lines'))
          .split(';')[0]
          ?.trim();
        return firstLine || 'Typing Animation';
      }
      default: {
        return 'Tech Stack';
      }
    }
  }
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

  // src/site/client/builder/core.ts
  var SLUG_SEPARATOR_RX = /[-_]/;
  var BRAND_SLUG_CLEAN_RX = /[^a-z\d]/g;
  function capitalizeSlugParts(slug) {
    let result = '';
    for (const part of slug.split(SLUG_SEPARATOR_RX)) {
      if (part) {
        result += `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
      }
    }
    return result;
  }
  function computeGridFocusIndex(key, index, columns, total) {
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
  function createAsyncCache(load) {
    const promises = /* @__PURE__ */ new Map();
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
  function createIconResolver(index, maxSlugLength) {
    const lucideByKey = /* @__PURE__ */ new Map();
    const lucidePositions = /* @__PURE__ */ new Map();
    for (const [i, slug] of index.sets.lucide.entries()) {
      lucideByKey.set(capitalizeSlugParts(slug), slug);
      lucidePositions.set(slug, i);
    }
    for (const [alias, primary] of Object.entries(index.lucideAliases)) {
      lucideByKey.set(capitalizeSlugParts(alias), primary);
    }
    const brandPositions = /* @__PURE__ */ new Map();
    for (const [i, slug] of index.sets.brands.entries()) {
      brandPositions.set(slug, i);
    }
    function findLucide(slug) {
      return lucideByKey.get(capitalizeSlugParts(slug));
    }
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
  var core = {
    buildAltText,
    buildDefaultLinkTarget,
    buildPath,
    buildPreviewPath,
    buildShareUrl,
    buildSnippetTokens,
    buildSnippets,
    collectStackSlugs,
    composeAnim,
    composeCategorizedStack,
    composeHint,
    composeIconPair,
    composeSpecial,
    computeGridFocusIndex,
    createAsyncCache,
    createIconResolver,
    decodeSegment,
    encodeSegment,
    isTypingFieldActiveForLayout,
    parsePath,
    splitAnim,
    splitHint,
    splitIconPair,
    splitSize,
    splitSpecial,
  };

  // src/site/client/builder/iconPicker.ts
  var PICKER_CHUNK_SIZE = 72;
  var MAX_LISTED_UNKNOWN_ICONS = 3;
  var WHITESPACE_RX2 = /\s+/g;
  var TRAILING_STACK_SEPARATOR_RX = /[,;|\s]$/;
  function hasAllQueryTokens(haystack, tokens) {
    for (const token of tokens) {
      if (!haystack.includes(token)) {
        return false;
      }
    }
    return true;
  }
  function collectMatchingAliasTargets(aliasMap, queryTokens, targetSet) {
    for (const [alias, primary] of Object.entries(aliasMap)) {
      if (hasAllQueryTokens(alias, queryTokens)) {
        targetSet.add(primary);
      }
    }
  }
  function computeSetMatches(index, catalog, set, query, queryTokens, setAliasHits) {
    const prefixMatches = [];
    const substringMatches = [];
    const tagMatches = [];
    for (const slug of catalog[set]) {
      if (slug.startsWith(query)) {
        prefixMatches.push({ set, slug });
      } else if (hasAllQueryTokens(slug, queryTokens) || setAliasHits.has(slug)) {
        substringMatches.push({ set, slug });
      } else if (set === 'lucide') {
        const tags = index.lucideTags[slug];
        if (tags && hasAllQueryTokens(`${slug} ${tags}`, queryTokens)) {
          tagMatches.push({ set, slug });
        }
      }
    }
    prefixMatches.push(...substringMatches, ...tagMatches);
    return prefixMatches;
  }
  function createIconPickerController(options) {
    const {
      form,
      glyphTemplates,
      onIndexLoaded,
      picker,
      pickerEmpty,
      pickerGrid,
      pickerNoneButton,
      pickerSearch,
      pickerStatus,
      schema,
      site,
    } = options;
    const iconIndexUrl = picker?.dataset.indexUrl ?? '/assets/icons.json';
    const iconVersion = new URL(iconIndexUrl, globalThis.location.href).searchParams.get('v') ?? '';
    let iconIndex = undefined;
    let iconResolver = undefined;
    let pickerCatalog = undefined;
    let pickerTarget = undefined;
    let pickerTrigger = undefined;
    let isPickerInsertMode = false;
    let pickerMatches = [];
    let pickerRendered = 0;
    let pickerSelectedSlug = '';
    let pickerSearchFrame = 0;
    let tileObserver = undefined;
    let sentinelObserver = undefined;
    const loadIconIndexOnce = createAsyncCache(() =>
      fetch(iconIndexUrl).then((response) => {
        if (!response.ok) {
          throw new Error(`Icon index request failed (${response.status})`);
        }
        return response.json();
      })
    );
    const loadIconPageOnce = createAsyncCache((key) =>
      fetch(`/assets/icons-${key}.json?v=${iconVersion}`).then((response) => {
        if (!response.ok) {
          throw new Error(`Icon page request failed (${response.status})`);
        }
        return response.json();
      })
    );
    function loadIconIndex() {
      return loadIconIndexOnce('').then((index) => {
        if (!iconIndex) {
          const resolver = createIconResolver(index, schema.maxIconSlugLength);
          const catalog = { brands: [], lucide: [] };
          for (const set of ['lucide', 'brands']) {
            for (const slug of index.sets[set]) {
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
    function loadIconPage(iconLocation) {
      return loadIconPageOnce(`${iconLocation.set}-${iconLocation.page}`);
    }
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
          delete container.dataset.slug;
        }
      );
    }
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
      const hasUnknown = unknown.length > 0;
      const more = unknown.length > MAX_LISTED_UNKNOWN_ICONS ? ', …' : '';
      hint.textContent = hasUnknown
        ? `Unknown icon${unknown.length > 1 ? 's' : ''}: ${unknown.slice(0, MAX_LISTED_UNKNOWN_ICONS).join(', ')}${more} (renders a fallback).`
        : '';
      hint.classList.toggle('is-warning', hasUnknown);
      const invalidContainer = hint.closest('.icon-input') ?? hint.closest('[data-field]');
      invalidContainer?.classList.toggle('is-invalid', hasUnknown);
      const interactiveControl =
        input instanceof HTMLInputElement && input.type === 'hidden'
          ? form.querySelector(`[data-icon-target="${inputId}"]`)
          : input;
      if (interactiveControl instanceof HTMLElement) {
        if (hasUnknown) {
          interactiveControl.setAttribute('aria-invalid', 'true');
        } else if (!interactiveControl.closest('.is-missing')) {
          interactiveControl.removeAttribute('aria-invalid');
        }
      }
    }
    function syncIconSelects(scope) {
      for (const trigger of scope.querySelectorAll('.icon-select-trigger')) {
        const inputId = trigger instanceof HTMLElement ? (trigger.dataset.iconTarget ?? '') : '';
        const input = document.getElementById(inputId);
        const valueElement = trigger.querySelector('.icon-select-value');
        if (input instanceof HTMLInputElement && valueElement instanceof HTMLElement) {
          const slug = input.value.trim();
          valueElement.textContent = slug || (valueElement.dataset.placeholder ?? '');
          valueElement.classList.toggle('is-placeholder', !slug);
          form.querySelector(`[data-icon-clear="${inputId}"]`)?.toggleAttribute('hidden', !slug);
          const glyph = trigger.querySelector('[data-glyph-for]');
          if (glyph instanceof HTMLElement && iconResolver && glyph.dataset.slug !== slug) {
            glyph.dataset.slug = slug;
            renderInputGlyph(glyph, slug);
          }
        }
      }
    }
    function validateIcons(scope) {
      const resolver = iconResolver;
      if (resolver) {
        for (const hint of scope.querySelectorAll('[data-validation-for]')) {
          validateIconInput(hint, resolver);
        }
      }
    }
    function updatePickerTabLabels(counts) {
      for (const labelSpan of picker?.querySelectorAll('[data-picker-tab-label]') ?? []) {
        if (labelSpan instanceof HTMLElement) {
          const setId = labelSpan.dataset.pickerTabLabel;
          const baseLabel = labelSpan.dataset.label ?? '';
          labelSpan.textContent =
            counts && (setId === 'lucide' || setId === 'brands')
              ? `${baseLabel} (${counts[setId].toLocaleString('en-US')})`
              : baseLabel;
        }
      }
    }
    function computePickerMatches(index, catalog) {
      const checkedTab = picker?.querySelector('input[name="icon-picker-set"]:checked');
      const activeSet =
        checkedTab instanceof HTMLInputElement && checkedTab.value === 'brands'
          ? 'brands'
          : 'lucide';
      const query = (pickerSearch?.value ?? '').trim().toLowerCase();
      if (!query) {
        updatePickerTabLabels(undefined);
        const allMatches = [];
        for (const slug of catalog[activeSet]) {
          allMatches.push({ set: activeSet, slug });
        }
        return allMatches;
      }
      const queryTokens = query.split(WHITESPACE_RX2);
      const lucideAliasHits = /* @__PURE__ */ new Set();
      const brandAliasHits = /* @__PURE__ */ new Set();
      collectMatchingAliasTargets(index.lucideAliases, queryTokens, lucideAliasHits);
      collectMatchingAliasTargets(index.brandAliases, queryTokens, brandAliasHits);
      collectMatchingAliasTargets(index.aliases, queryTokens, lucideAliasHits);
      collectMatchingAliasTargets(index.aliases, queryTokens, brandAliasHits);
      const lucideMatches = computeSetMatches(
        index,
        catalog,
        'lucide',
        query,
        queryTokens,
        lucideAliasHits
      );
      const brandMatches = computeSetMatches(
        index,
        catalog,
        'brands',
        query,
        queryTokens,
        brandAliasHits
      );
      updatePickerTabLabels({ brands: brandMatches.length, lucide: lucideMatches.length });
      return activeSet === 'brands' ? brandMatches : lucideMatches;
    }
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
    function renderPickerChunk() {
      if (!pickerGrid) {
        return;
      }
      const fragment = document.createDocumentFragment();
      const end = Math.min(pickerMatches.length, pickerRendered + PICKER_CHUNK_SIZE);
      for (let i = pickerRendered; i < end; i += 1) {
        const match = pickerMatches[i];
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
        sentinel.setAttribute('aria-hidden', 'true');
        sentinel.setAttribute('role', 'presentation');
        pickerGrid.append(sentinel);
        sentinelObserver?.observe(sentinel);
      }
    }
    function renderPickerUntil(index) {
      while (pickerRendered <= index && pickerRendered < pickerMatches.length) {
        renderPickerChunk();
      }
    }
    function getTileAt(index) {
      const tile = pickerGrid?.children[index];
      return tile instanceof HTMLElement && tile.classList.contains('icon-tile') ? tile : undefined;
    }
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
    function renderPickerEmpty() {
      if (!pickerEmpty) {
        return;
      }
      pickerEmpty.replaceChildren('No icons found.');
      if (pickerSearch?.value.trim()) {
        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'text-btn';
        clearButton.dataset.pickerClear = 'true';
        clearButton.textContent = 'Clear search';
        pickerEmpty.append(' ', clearButton);
      }
      pickerEmpty.hidden = false;
    }
    function findSelectedMatchIndex() {
      if (!pickerSelectedSlug) {
        return -1;
      }
      return pickerMatches.findIndex((match) => match.slug === pickerSelectedSlug);
    }
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
      tileObserver?.disconnect();
      sentinelObserver?.disconnect();
      pickerGrid.replaceChildren();
      pickerGrid.scrollTop = 0;
      const hasMatches = pickerMatches.length > 0;
      pickerGrid.hidden = !hasMatches;
      if (!hasMatches) {
        renderPickerEmpty();
      } else {
        if (pickerEmpty) {
          pickerEmpty.hidden = true;
          pickerEmpty.replaceChildren();
        }
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
    function scheduleRenderPicker() {
      cancelAnimationFrame(pickerSearchFrame);
      pickerSearchFrame = requestAnimationFrame(() => renderPicker(false));
    }
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
        target.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        target.value = slug;
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (picker) {
        site?.closePopover(picker);
      }
      (target instanceof HTMLTextAreaElement ? target : (pickerTrigger ?? target)).focus();
    }
    function getPickerColumns() {
      if (!pickerGrid) {
        return 1;
      }
      return Math.max(1, getComputedStyle(pickerGrid).gridTemplateColumns.split(' ').length);
    }
    function targetPicker(button) {
      pickerTarget = document.getElementById(button.dataset.iconTarget ?? '') ?? undefined;
      pickerTrigger = button;
      isPickerInsertMode = button.dataset.iconInsert === 'true';
      pickerNoneButton?.toggleAttribute('hidden', button.dataset.iconNone !== 'true');
    }
    function syncPickerTabForTarget() {
      const currentSlug =
        !isPickerInsertMode && pickerTarget instanceof HTMLInputElement ? pickerTarget.value : '';
      const targetSet =
        iconResolver?.locate(currentSlug, schema.isBrandFirst)?.set ??
        (schema.isBrandFirst ? 'brands' : 'lucide');
      const tabInput = picker?.querySelector(`input[name="icon-picker-set"][value="${targetSet}"]`);
      if (tabInput instanceof HTMLInputElement) {
        tabInput.checked = true;
      }
    }
    function openPicker() {
      if (picker && pickerTrigger) {
        site?.placePopover(picker, pickerTrigger, { gap: 6 });
      }
      if (pickerSearch) {
        pickerSearch.value = '';
        pickerSearch.focus();
      }
      syncPickerTabForTarget();
      if (iconIndex) {
        renderPicker(true);
        return;
      }
      if (pickerStatus) {
        pickerStatus.textContent = 'Loading icons…';
      }
      loadIconIndex().then(
        () => {
          syncIconSelects(form);
          validateIcons(form);
          onIndexLoaded();
          if (picker && site?.isPopoverOpen(picker)) {
            syncPickerTabForTarget();
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
    function showTileSlug(event) {
      const tile = event.target instanceof Element ? event.target.closest('.icon-tile') : undefined;
      if (tile instanceof HTMLElement && pickerStatus) {
        pickerStatus.textContent = tile.dataset.slug ?? '';
      }
    }
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
        if (event.newState === 'open') {
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
      pickerElement.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : undefined;
        if (target?.closest('[data-picker-clear]') && pickerSearch) {
          pickerSearch.value = '';
          pickerSearch.focus();
          renderPicker(false);
        }
      });
      gridElement.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : undefined;
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
    return {
      bind() {
        if (picker && pickerGrid) {
          bindIconPicker(picker, pickerGrid);
        }
      },
      createGlyph,
      getResolver() {
        return iconResolver;
      },
      loadIndexInBackground() {
        loadIconIndex().then(
          () => {
            syncIconSelects(form);
            validateIcons(form);
            onIndexLoaded();
            if (picker && site?.isPopoverOpen(picker)) {
              renderPicker(true);
            }
          },
          () => undefined
        );
      },
      loadPage: loadIconPage,
      syncIconSelects,
      validateIcons,
    };
  }

  // src/site/client/builder/select.ts
  var selectPartsCache = /* @__PURE__ */ new WeakMap();
  function getSelectParts(wrapper) {
    let parts = selectPartsCache.get(wrapper);
    if (!parts) {
      parts = {
        empty: wrapper.querySelector('[data-select-empty]'),
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
  function createSwatch(color) {
    const swatch = document.createElement('span');
    swatch.className = 'select-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    swatch.style.setProperty('--swatch', color);
    return swatch;
  }
  function renderSelectOptions(wrapper) {
    const { empty, list, search, select } = getSelectParts(wrapper);
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
        if (option.dataset.badge) {
          const badge = document.createElement('span');
          badge.className = 'select-option-badge';
          badge.textContent = option.dataset.badge;
          item.append(badge);
        }
        fragment.append(item);
      }
    }
    const hasMatches = fragment.childElementCount > 0;
    list.replaceChildren(fragment);
    list.hidden = !hasMatches;
    if (empty) {
      empty.hidden = hasMatches;
    }
  }
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
  function chooseSelectOption(wrapper, value, site) {
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
  function handleSelectKeydown(event, wrapper, site) {
    const { target } = event;
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
        chooseSelectOption(wrapper, item.dataset.value, site);
      }
    } else if (!isSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      focusTypeaheadOption(wrapper, event.key.toLowerCase());
    }
  }
  function openSelectMenu(wrapper, site) {
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
  function syncSelects(scope) {
    for (const wrapper of scope.querySelectorAll('[data-select]')) {
      syncSelect(wrapper);
    }
  }
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
      if (option.autoSpecials && option.autoSpecials.length > 0) {
        optionElement.dataset.badge = 'Auto';
      }
      select.add(optionElement);
    }
    const wrapper = select.closest('[data-select]');
    if (wrapper) {
      syncSelect(wrapper);
    }
  }
  function bindSelects(form, site) {
    for (const wrapper of form?.querySelectorAll('[data-select]') ?? []) {
      const { menu, search, trigger } = getSelectParts(wrapper);
      menu?.addEventListener('toggle', (event) => {
        if (event.newState === 'open') {
          openSelectMenu(wrapper, site);
        }
      });
      menu?.addEventListener('click', (event) => {
        const item =
          event.target instanceof Element ? event.target.closest('.select-option') : undefined;
        if (item instanceof HTMLElement && item.dataset.value !== undefined) {
          chooseSelectOption(wrapper, item.dataset.value, site);
        }
      });
      menu?.addEventListener('keydown', (event) => handleSelectKeydown(event, wrapper, site));
      menu?.addEventListener('focusout', (event) => {
        if (event.relatedTarget instanceof Node && !wrapper.contains(event.relatedTarget)) {
          site?.closePopover(menu);
        }
      });
      search?.addEventListener('input', () => renderSelectOptions(wrapper));
      trigger?.addEventListener('keydown', (event) => {
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menu) {
          event.preventDefault();
          site?.openPopover(menu);
        }
      });
    }
  }

  // src/site/client/builder/stackCatalog.ts
  function createStackCatalogController(options) {
    const {
      createGlyph,
      form,
      getControl,
      getResolver,
      getState,
      loadPage,
      stackCatalog,
      stackCatalogEmpty,
      stackCategoriesPanel,
      stackCategorySearch,
      stackGroupToggle,
      stackGroupToggleLabel,
      stackRawActions,
      stackRawPanel,
    } = options;
    let chipObserver = undefined;
    const stackChips = [];
    const stackChipBySlug = /* @__PURE__ */ new Map();
    const stackChipsByCategory = [];
    const stackTokenOverrides = /* @__PURE__ */ new Map();
    let customStackTokens = [];
    const pendingVisibleChips = /* @__PURE__ */ new Set();
    let isComposingStackFromCatalog = false;
    function indexStackCatalog() {
      if (!stackCatalog || stackChips.length > 0) {
        return;
      }
      for (const section of stackCatalog.querySelectorAll('[data-stack-category]')) {
        const categoryChips = [];
        for (const button of section.querySelectorAll('[data-stack-chip]')) {
          if (button instanceof HTMLButtonElement) {
            const chipSlug = button.dataset.stackChip ?? '';
            const canonicalSlug = button.dataset.stackCanonical ?? chipSlug;
            stackChips.push(button);
            categoryChips.push(button);
            if (chipSlug) {
              stackChipBySlug.set(chipSlug, button);
            }
            if (canonicalSlug) {
              stackChipBySlug.set(canonicalSlug, button);
            }
          }
        }
        if (categoryChips.length > 0) {
          stackChipsByCategory.push(categoryChips);
        }
      }
    }
    function findStackChip(slug) {
      const clean = slug.trim().toLowerCase();
      return (
        stackChipBySlug.get(clean) ?? stackChipBySlug.get(clean.replace(BRAND_SLUG_CLEAN_RX, ''))
      );
    }
    function syncStackCatalogFromDsl(dslValue) {
      indexStackCatalog();
      if (stackChips.length === 0) {
        return;
      }
      stackTokenOverrides.clear();
      customStackTokens = [];
      const selectedChips = /* @__PURE__ */ new Set();
      for (const tileToken of collectStackTileTokens(dslValue)) {
        const baseSlug = stripStackTileColor(tileToken).toLowerCase();
        if (baseSlug) {
          const chip = findStackChip(baseSlug);
          if (chip) {
            selectedChips.add(chip);
            const chipSlug = chip.dataset.stackChip ?? baseSlug;
            const atIndex = tileToken.lastIndexOf('@');
            stackTokenOverrides.set(
              chipSlug,
              atIndex > 0 ? `${chipSlug}${tileToken.slice(atIndex).toLowerCase()}` : chipSlug
            );
          } else if (!customStackTokens.includes(tileToken)) {
            customStackTokens.push(tileToken);
          }
        }
      }
      for (const chip of stackChips) {
        chip.setAttribute('aria-pressed', String(selectedChips.has(chip)));
      }
    }
    function readSelectedCategoryGroups() {
      const categoryGroups = [];
      for (const categoryChips of stackChipsByCategory) {
        const groupTokens = [];
        for (const chip of categoryChips) {
          if (chip.getAttribute('aria-pressed') === 'true') {
            const chipSlug = chip.dataset.stackChip ?? '';
            if (chipSlug) {
              groupTokens.push(stackTokenOverrides.get(chipSlug) ?? chipSlug);
            }
          }
        }
        if (groupTokens.length > 0) {
          categoryGroups.push(groupTokens);
        }
      }
      if (customStackTokens.length > 0) {
        categoryGroups.push([...customStackTokens]);
      }
      return categoryGroups;
    }
    function writeStackGroupsFromCatalog() {
      const textarea = getControl('groups');
      if (!(textarea instanceof HTMLTextAreaElement)) {
        return undefined;
      }
      const state = getState();
      const isGroupedByCategory = stackGroupToggle ? stackGroupToggle.checked : true;
      textarea.value = composeCategorizedStack(
        readSelectedCategoryGroups(),
        isGroupedByCategory,
        readState(state, 'perline')
      );
      state.groups = textarea.value;
      return textarea;
    }
    function applyStackCatalogSelection() {
      const textarea = writeStackGroupsFromCatalog();
      if (!textarea) {
        return;
      }
      isComposingStackFromCatalog = true;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      isComposingStackFromCatalog = false;
    }
    function fillStackChip(chip) {
      if (chip.dataset.filled) {
        return;
      }
      const iconResolver = getResolver();
      if (!iconResolver) {
        pendingVisibleChips.add(chip);
        return;
      }
      const glyphContainer = chip.querySelector('.stack-chip-glyph');
      const chipLocation = iconResolver.locate(chip.dataset.stackChip ?? '', true);
      if (!(glyphContainer instanceof HTMLElement) || !chipLocation) {
        return;
      }
      chip.dataset.filled = 'true';
      loadPage(chipLocation).then(
        (bodies) => {
          const body = bodies[chipLocation.slug];
          if (body) {
            glyphContainer.replaceChildren(createGlyph(chipLocation.set, body));
          }
        },
        () => {
          delete chip.dataset.filled;
        }
      );
    }
    function flushPendingStackChips() {
      if (!getResolver() || pendingVisibleChips.size === 0) {
        return;
      }
      for (const chip of pendingVisibleChips) {
        fillStackChip(chip);
      }
      pendingVisibleChips.clear();
    }
    function filterStackCatalog() {
      if (!stackCatalog) {
        return;
      }
      const query = (stackCategorySearch?.value ?? '').trim().toLowerCase();
      let visibleCategories = 0;
      for (const section of stackCatalog.querySelectorAll('[data-stack-category]')) {
        let visibleChips = 0;
        for (const button of section.querySelectorAll('[data-stack-chip]')) {
          if (button instanceof HTMLButtonElement) {
            const slug = button.dataset.stackChip ?? '';
            const canonical = button.dataset.stackCanonical ?? '';
            const label = (button.textContent ?? '').toLowerCase();
            const isMatch =
              !query || slug.includes(query) || canonical.includes(query) || label.includes(query);
            button.hidden = !isMatch;
            if (isMatch) {
              visibleChips += 1;
            }
          }
        }
        if (section instanceof HTMLElement) {
          section.hidden = visibleChips === 0;
        }
        if (visibleChips > 0) {
          visibleCategories += 1;
        }
      }
      stackCatalogEmpty?.toggleAttribute('hidden', visibleCategories > 0);
    }
    function selectStackModeTab(tab) {
      const isCategories = tab.dataset.stackMode !== 'raw';
      for (const otherTab of form.querySelectorAll('.stack-mode-tab')) {
        const isSelected = otherTab === tab;
        otherTab.classList.toggle('is-active', isSelected);
        otherTab.setAttribute('aria-selected', String(isSelected));
        otherTab.setAttribute('tabindex', isSelected ? '0' : '-1');
      }
      stackCategoriesPanel?.toggleAttribute('hidden', !isCategories);
      stackRawPanel?.toggleAttribute('hidden', isCategories);
      stackRawActions?.toggleAttribute('hidden', isCategories);
      stackGroupToggleLabel?.toggleAttribute('hidden', !isCategories);
    }
    function bindStackCatalog() {
      if (!stackCatalog) {
        return;
      }
      indexStackCatalog();
      chipObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.target instanceof HTMLButtonElement) {
              fillStackChip(entry.target);
              chipObserver?.unobserve(entry.target);
            }
          }
        },
        { root: stackCatalog, rootMargin: '120px 0px' }
      );
      for (const chip of stackChips) {
        chipObserver.observe(chip);
      }
      stackCatalog.addEventListener('click', (event) => {
        const chip =
          event.target instanceof Element ? event.target.closest('[data-stack-chip]') : undefined;
        if (chip instanceof HTMLButtonElement) {
          const isPressed = chip.getAttribute('aria-pressed') === 'true';
          chip.setAttribute('aria-pressed', String(!isPressed));
          applyStackCatalogSelection();
        }
      });
      stackCategorySearch?.addEventListener('input', filterStackCatalog);
      stackGroupToggle?.addEventListener('change', applyStackCatalogSelection);
      const modeTabList = form.querySelector('.stack-mode-tabs');
      modeTabList?.addEventListener('click', (event) => {
        const tab =
          event.target instanceof Element ? event.target.closest('.stack-mode-tab') : undefined;
        if (tab instanceof HTMLElement) {
          selectStackModeTab(tab);
        }
      });
      modeTabList?.addEventListener('keydown', (event) => {
        const keyEvent = event;
        const tabs = [...modeTabList.querySelectorAll('.stack-mode-tab')];
        let next = undefined;
        if (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowRight') {
          next = tabs.find((candidate) => candidate.getAttribute('aria-selected') !== 'true');
        } else if (keyEvent.key === 'Home') {
          [next] = tabs;
        } else if (keyEvent.key === 'End') {
          next = tabs.at(-1);
        }
        if (next instanceof HTMLElement) {
          keyEvent.preventDefault();
          selectStackModeTab(next);
          next.focus();
        }
      });
    }
    function syncStackFieldChange(field) {
      const state = getState();
      if (field.control === 'stackGroups' && !isComposingStackFromCatalog) {
        syncStackCatalogFromDsl(state[field.id] ?? '');
      } else if (field.id === 'perline' && stackCategoriesPanel && !stackCategoriesPanel.hidden) {
        writeStackGroupsFromCatalog();
      }
    }
    return {
      bind: bindStackCatalog,
      filterCatalog: filterStackCatalog,
      flushPendingChips: flushPendingStackChips,
      syncFromDsl: syncStackCatalogFromDsl,
      syncStackFieldChange,
    };
  }

  // src/site/client/builder/typingLines.ts
  var LINE_SPLIT_RX = /[\r\n;]+/;
  var MULTI_LINE_PASTE_RX = /[\r\n;]/;
  var SEMICOLON_RX = /;/g;
  function focusRowInput(row, hasCaretAtEnd = false) {
    const input = row?.querySelector('.typing-line-input');
    if (input instanceof HTMLInputElement) {
      input.focus();
      if (hasCaretAtEnd) {
        const endOffset = input.value.length;
        input.setSelectionRange(endOffset, endOffset);
      }
    }
  }
  function createTypingLinesController(options) {
    const { addButton, editorElement, hiddenInput, listElement } = options;
    const maxLines = Number(editorElement?.dataset.maxLines) || 12;
    const maxLength = Number(editorElement?.dataset.maxLength) || 80;
    const firstRow = listElement?.querySelector('[data-typing-line-row]');
    const rowTemplate = firstRow instanceof HTMLElement ? firstRow.cloneNode(true) : undefined;
    function getRows() {
      if (!listElement) {
        return [];
      }
      const rows = [];
      for (const element of listElement.querySelectorAll('[data-typing-line-row]')) {
        if (element instanceof HTMLElement) {
          rows.push(element);
        }
      }
      return rows;
    }
    function createRow(lineValue) {
      if (!rowTemplate) {
        return undefined;
      }
      const row = rowTemplate.cloneNode(true);
      const input = row.querySelector('.typing-line-input');
      if (input instanceof HTMLInputElement) {
        input.value = lineValue.replace(SEMICOLON_RX, ' ').slice(0, maxLength);
      }
      return row;
    }
    function refreshRowMetadata() {
      const rows = getRows();
      const isSingleRow = rows.length <= 1;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (row) {
          const lineNumber = i + 1;
          const indexBadge = row.querySelector('.typing-line-index');
          if (indexBadge) {
            indexBadge.textContent = String(lineNumber);
          }
          const input = row.querySelector('.typing-line-input');
          if (input instanceof HTMLInputElement) {
            input.placeholder = i === 0 ? 'e.g., Full-Stack Developer' : `Line ${lineNumber}…`;
            input.setAttribute('aria-label', `Line ${lineNumber}`);
          }
          const removeButton = row.querySelector('[data-typing-line-remove]');
          if (removeButton instanceof HTMLButtonElement) {
            removeButton.disabled = isSingleRow;
            removeButton.setAttribute('aria-label', `Remove line ${lineNumber}`);
          }
        }
      }
      if (addButton) {
        addButton.disabled = rows.length >= maxLines;
      }
    }
    function readValue() {
      if (!listElement) {
        return hiddenInput?.value ?? '';
      }
      const nonEmptyLines = [];
      for (const input of listElement.querySelectorAll('.typing-line-input')) {
        if (input instanceof HTMLInputElement) {
          if (input.value.includes(';')) {
            const isFocused = document.activeElement === input;
            const selectionStart = isFocused ? (input.selectionStart ?? undefined) : undefined;
            const selectionEnd = isFocused ? (input.selectionEnd ?? undefined) : undefined;
            input.value = input.value.replace(SEMICOLON_RX, ' ');
            if (isFocused && selectionStart !== undefined && selectionEnd !== undefined) {
              input.setSelectionRange(selectionStart, selectionEnd);
            }
          }
          const trimmedLine = input.value.trim();
          if (trimmedLine) {
            nonEmptyLines.push(trimmedLine);
          }
        }
      }
      const serialized = nonEmptyLines.join(';');
      if (hiddenInput) {
        hiddenInput.value = serialized;
      }
      return serialized;
    }
    function notifyChange() {
      readValue();
      hiddenInput?.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function syncFromValue(rawValue) {
      if (!listElement || !rowTemplate) {
        return;
      }
      const parsedLines = [];
      for (const segment of rawValue.split(LINE_SPLIT_RX)) {
        const trimmedLine = segment.trim();
        if (trimmedLine && parsedLines.length < maxLines) {
          parsedLines.push(trimmedLine);
        }
      }
      if (parsedLines.length === 0) {
        parsedLines.push('');
      }
      const fragment = document.createDocumentFragment();
      for (const lineText of parsedLines) {
        const row = createRow(lineText);
        if (row) {
          fragment.append(row);
        }
      }
      listElement.replaceChildren(fragment);
      refreshRowMetadata();
      readValue();
    }
    function handleKeydown(event) {
      const input =
        event.target instanceof HTMLInputElement &&
        event.target.classList.contains('typing-line-input')
          ? event.target
          : undefined;
      const row = input?.closest('[data-typing-line-row]');
      if (!input || !row) {
        return;
      }
      const rows = getRows();
      const rowIndex = rows.indexOf(row);
      if (event.key === 'Enter') {
        event.preventDefault();
        if (rows.length < maxLines) {
          const newRow = createRow('');
          if (newRow) {
            row.after(newRow);
            refreshRowMetadata();
            focusRowInput(newRow);
          }
        } else if (rowIndex + 1 < rows.length) {
          focusRowInput(rows[rowIndex + 1]);
        }
      } else if (event.key === 'Backspace' && input.value === '' && rows.length > 1) {
        event.preventDefault();
        row.remove();
        refreshRowMetadata();
        const remainingRows = getRows();
        focusRowInput(remainingRows[Math.max(0, rowIndex - 1)], true);
        notifyChange();
      } else if (event.key === 'ArrowUp' && rowIndex > 0) {
        event.preventDefault();
        focusRowInput(rows[rowIndex - 1], true);
      } else if (event.key === 'ArrowDown' && rowIndex + 1 < rows.length) {
        event.preventDefault();
        focusRowInput(rows[rowIndex + 1], true);
      }
    }
    function handlePaste(event) {
      const input =
        event.target instanceof HTMLInputElement &&
        event.target.classList.contains('typing-line-input')
          ? event.target
          : undefined;
      const row = input?.closest('[data-typing-line-row]');
      const pastedText = event.clipboardData?.getData('text') ?? '';
      if (!input || !row || !MULTI_LINE_PASTE_RX.test(pastedText)) {
        return;
      }
      const pastedLines = [];
      for (const part of pastedText.split(LINE_SPLIT_RX)) {
        const trimmedLine = part.trim();
        if (trimmedLine) {
          pastedLines.push(trimmedLine);
        }
      }
      if (pastedLines.length <= 1) {
        return;
      }
      event.preventDefault();
      input.value = (pastedLines[0] ?? '').slice(0, maxLength);
      let anchorRow = row;
      let currentRowCount = getRows().length;
      for (let i = 1; i < pastedLines.length && currentRowCount < maxLines; i += 1) {
        const nextRow = createRow(pastedLines[i] ?? '');
        if (nextRow) {
          anchorRow.after(nextRow);
          anchorRow = nextRow;
          currentRowCount += 1;
        }
      }
      refreshRowMetadata();
      focusRowInput(anchorRow, true);
      notifyChange();
    }
    function bind() {
      if (!listElement || !rowTemplate) {
        return;
      }
      addButton?.addEventListener('click', () => {
        const rows = getRows();
        if (rows.length >= maxLines) {
          return;
        }
        const newRow = createRow('');
        if (newRow) {
          listElement.append(newRow);
          refreshRowMetadata();
          focusRowInput(newRow);
        }
      });
      listElement.addEventListener('click', (event) => {
        const removeButton =
          event.target instanceof Element
            ? event.target.closest('[data-typing-line-remove]')
            : undefined;
        const row = removeButton?.closest('[data-typing-line-row]');
        if (!row) {
          return;
        }
        const rows = getRows();
        if (rows.length <= 1) {
          const singleInput = row.querySelector('.typing-line-input');
          if (singleInput instanceof HTMLInputElement) {
            singleInput.value = '';
            singleInput.focus();
            notifyChange();
          }
          return;
        }
        const rowIndex = rows.indexOf(row);
        row.remove();
        refreshRowMetadata();
        const remainingRows = getRows();
        focusRowInput(remainingRows[Math.min(rowIndex, remainingRows.length - 1)]);
        notifyChange();
      });
      listElement.addEventListener('keydown', (event) => handleKeydown(event));
      listElement.addEventListener('paste', (event) => handlePaste(event));
    }
    return { bind, readValue, syncFromValue };
  }

  // src/site/client/builder/index.ts
  var PREVIEW_DEBOUNCE_MS = 180;
  function getPart(fieldElement, part) {
    const control = fieldElement.querySelector(`[data-part="${part}"]`);
    return control ?? undefined;
  }
  function setPartValue(fieldElement, part, value) {
    const control = getPart(fieldElement, part);
    if (control) {
      control.value = value;
    }
  }
  function syncSizeParts(fieldElement) {
    const isCustom = getPart(fieldElement, 'preset')?.value === 'custom';
    fieldElement.querySelector('[data-size-part="custom"]')?.toggleAttribute('hidden', !isCustom);
  }
  function setRadioGroupValue(fieldElement, value) {
    for (const radio of fieldElement.querySelectorAll('input[type="radio"]')) {
      if (radio instanceof HTMLInputElement) {
        radio.checked = radio.value === value;
      }
    }
  }
  function initBuilderDom() {
    const site = globalThis.svgSite;
    const schemaElement = document.getElementById('builder-schema');
    const formElement = document.getElementById('builder-form');
    if (!site || !schemaElement || !(formElement instanceof HTMLFormElement)) {
      return;
    }
    const form = formElement;
    const schema = JSON.parse(schemaElement.textContent ?? '{}');
    const hasPresetIcon = schema.fields.some((field) => field.hasPresetValue === true);
    const previewImage = document.getElementById('builder-preview');
    const previewPlaceholder = document.getElementById('builder-placeholder');
    const statusElement = document.getElementById('builder-status');
    const outputElement = document.querySelector('.builder-output');
    const codeElement = document.querySelector('#builder-code code');
    const altInput = document.getElementById('builder-alt');
    const linkInput = document.getElementById('builder-link');
    const openLink = document.getElementById('builder-open');
    const copyButton = document.getElementById('builder-copy');
    const shareButton = document.getElementById('builder-share');
    const resetButton = document.getElementById('builder-reset');
    const picker = document.getElementById('icon-picker');
    const pickerEmpty = document.getElementById('icon-picker-empty');
    const pickerGrid = document.getElementById('icon-picker-grid');
    const pickerSearch = document.getElementById('icon-picker-search');
    const pickerStatus = document.getElementById('icon-picker-status');
    const pickerNoneButton = document.getElementById('icon-picker-none');
    const glyphTemplates = document.getElementById('icon-glyph-templates');
    const stackCatalog = document.getElementById('stack-catalog');
    const stackCategorySearch = document.getElementById('stack-category-search');
    const stackCatalogEmpty = document.getElementById('stack-catalog-empty');
    const stackGroupToggle = document.getElementById('stack-group-by-category');
    const stackGroupToggleLabel = document.querySelector('[data-stack-group-toggle]');
    const stackCategoriesPanel = document.getElementById('stack-panel-categories');
    const stackRawPanel = document.getElementById('stack-panel-raw');
    const stackRawActions = document.querySelector('[data-stack-raw-actions]');
    const reducedMotionQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const fieldsById = /* @__PURE__ */ new Map();
    const fieldElements = /* @__PURE__ */ new Map();
    for (const field of schema.fields) {
      fieldsById.set(field.id, field);
      const fieldElement = form.querySelector(`[data-field="${field.id}"]`);
      if (fieldElement) {
        fieldElements.set(field.id, fieldElement);
      }
    }
    const controlCache = /* @__PURE__ */ new Map();
    let state = { ...schema.initialState };
    let snippetFormat = 'markdown';
    let lastPreviewSrc = '';
    let currentPreviewPath = '';
    let crossBuilderNotice = '';
    let previewTimer = 0;
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
    let stackCatalogController = undefined;
    const iconPickerController = createIconPickerController({
      form,
      glyphTemplates,
      onIndexLoaded() {
        stackCatalogController?.flushPendingChips();
      },
      picker,
      pickerEmpty,
      pickerGrid,
      pickerNoneButton,
      pickerSearch,
      pickerStatus,
      schema,
      site,
    });
    stackCatalogController = createStackCatalogController({
      createGlyph: iconPickerController.createGlyph,
      form,
      getControl,
      getResolver: iconPickerController.getResolver,
      getState() {
        return state;
      },
      loadPage: iconPickerController.loadPage,
      stackCatalog,
      stackCatalogEmpty,
      stackCategoriesPanel,
      stackCategorySearch,
      stackGroupToggle,
      stackGroupToggleLabel,
      stackRawActions,
      stackRawPanel,
    });
    const typingLinesController = createTypingLinesController({
      addButton: document.getElementById('typing-line-add'),
      editorElement: document.getElementById('typing-lines-editor'),
      hiddenInput: document.getElementById('field-lines'),
      listElement: document.getElementById('typing-lines-list'),
    });
    function getActiveAutoSpecials() {
      if (schema.kind !== 'service') {
        return [];
      }
      const service = findService(schema, state.service);
      const metric = findOption(service?.metrics, state.metric ?? '');
      return metric?.autoSpecials ?? [];
    }
    function readFieldValue(field, fieldElement) {
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
        case 'hint': {
          return composeHint(readPartValue('icon'), readPartValue('text'));
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
          const kind = readPartValue('kind');
          return composeSpecial(
            kind,
            readPartValue('payload'),
            readPartValue('modifier'),
            Boolean(kind && getActiveAutoSpecials().includes(kind))
          );
        }
        case 'typingLines': {
          return typingLinesController.readValue();
        }
        default: {
          return getControl(field.id)?.value ?? '';
        }
      }
    }
    function resolveSpecialHint(field, kind, kindOption, isAuto) {
      const baseHint = kindOption?.description ?? field.description ?? '';
      if (kind && kind !== 'none') {
        return isAuto
          ? `Uses live upstream data when Data is left empty; Manual: ${baseHint}`
          : baseHint;
      }
      if (!kind && schema.kind === 'service') {
        const service = findService(schema, state.service);
        const metric = findOption(service?.metrics, state.metric ?? '');
        if (metric?.defaultSpecial) {
          return `Uses the metric's default ${metric.defaultSpecial} widget; Pick another Auto widget or enter custom Data.`;
        }
        if (getActiveAutoSpecials().length === 0) {
          return 'Optional inline chart, gauge, or delta pill next to the badge value.';
        }
      }
      return baseHint;
    }
    function syncSpecialParts(field, fieldElement, modifier) {
      const kind = getPart(fieldElement, 'kind')?.value ?? '';
      const kindOption = findOption(field.options, kind);
      const modifiers = kindOption?.modifiers ?? [];
      const payload = getPart(fieldElement, 'payload');
      const modifierSelect = getPart(fieldElement, 'modifier');
      const isAuto = Boolean(kind && getActiveAutoSpecials().includes(kind));
      if (payload instanceof HTMLInputElement) {
        const example = kindOption?.placeholder ?? '';
        let autoPlaceholder = example;
        if (isAuto) {
          autoPlaceholder = example ? `auto (or e.g., ${example})` : 'auto';
        }
        payload.placeholder = autoPlaceholder;
      }
      if (modifierSelect instanceof HTMLSelectElement) {
        setSelectOptions(modifierSelect, modifiers, modifier);
      }
      const hint = fieldElement.querySelector('.builder-hint');
      if (hint) {
        hint.textContent = resolveSpecialHint(field, kind, kindOption, isAuto);
      }
      fieldElement
        .querySelector('[data-special-part="payload"]')
        ?.toggleAttribute('hidden', !kind || kind === 'none');
      fieldElement
        .querySelector('[data-special-part="modifier"]')
        ?.toggleAttribute('hidden', modifiers.length === 0);
    }
    function syncServiceSpecialOptions() {
      const specialField = fieldsById.get('special');
      const specialElement = fieldElements.get('special');
      if (!specialField || !specialElement) {
        return;
      }
      const service = findService(schema, state.service);
      const metric = findOption(service?.metrics, state.metric ?? '');
      const autoSpecials = getActiveAutoSpecials();
      const kindSelect = getPart(specialElement, 'kind');
      if (kindSelect instanceof HTMLSelectElement) {
        for (const option of kindSelect.options) {
          if (!option.value) {
            option.text = metric?.defaultSpecial ? `Default (${metric.defaultSpecial})` : 'Default';
          } else if (autoSpecials.includes(option.value)) {
            option.dataset.badge = 'Auto';
          } else {
            delete option.dataset.badge;
          }
        }
        const wrapper = kindSelect.closest('[data-select]');
        if (wrapper) {
          syncSelect(wrapper);
        }
      }
      const modifier = getPart(specialElement, 'modifier')?.value ?? '';
      syncSpecialParts(specialField, specialElement, modifier);
    }
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
        if (isRequired) {
          control.setAttribute('aria-required', 'true');
        } else {
          control.removeAttribute('aria-required');
        }
      }
    }
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
      syncServiceSpecialOptions();
    }
    function writeFieldValue(field, value) {
      const fieldElement = fieldElements.get(field.id);
      if (!fieldElement) {
        return;
      }
      switch (field.control) {
        case 'anim': {
          const anim = splitAnim(value, field.options);
          const sheen = getPart(fieldElement, 'sheen');
          if (sheen instanceof HTMLInputElement) {
            sheen.checked = anim.hasSheen;
          }
          setPartValue(fieldElement, 'left', anim.left);
          setPartValue(fieldElement, 'right', anim.right);
          break;
        }
        case 'color': {
          setRadioGroupValue(fieldElement, value);
          break;
        }
        case 'hint': {
          const hint = splitHint(value);
          setPartValue(fieldElement, 'icon', hint.icon);
          setPartValue(fieldElement, 'text', hint.text);
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
        case 'typingLines': {
          typingLinesController.syncFromValue(value);
          break;
        }
        default: {
          const control = getControl(field.id);
          if (control instanceof HTMLSelectElement) {
            control.value = value;
            if (control.selectedIndex < 0 && control.options.length > 0) {
              control.selectedIndex = 0;
            }
          } else if (control) {
            control.value = value;
          }
          if (field.control === 'stackGroups') {
            stackCatalogController?.syncFromDsl(value);
          }
        }
      }
    }
    function syncTypingFields() {
      if (schema.kind !== 'typing') {
        return;
      }
      const effectiveLayout = (state.layout ?? '').trim().toLowerCase() || 'window';
      fieldElements
        .get('title')
        ?.toggleAttribute('hidden', !isTypingFieldActiveForLayout('title', effectiveLayout));
      fieldElements
        .get('hint')
        ?.toggleAttribute('hidden', !isTypingFieldActiveForLayout('hint', effectiveLayout));
      fieldElements
        .get('align')
        ?.toggleAttribute('hidden', !isTypingFieldActiveForLayout('align', effectiveLayout));
      const titleControl = getControl('title');
      if (titleControl instanceof HTMLInputElement) {
        titleControl.placeholder =
          effectiveLayout === 'ide' ? 'index.ts (ide default)' : 'optional (e.g., zsh)';
      }
      const prefixControl = getControl('prefix');
      if (prefixControl instanceof HTMLInputElement) {
        prefixControl.placeholder =
          effectiveLayout === 'window' ? '❯ (window default)' : 'optional';
      }
      const hintElement = fieldElements.get('hint');
      const hintTextControl = hintElement ? getPart(hintElement, 'text') : undefined;
      if (hintTextControl instanceof HTMLInputElement) {
        hintTextControl.placeholder =
          effectiveLayout === 'prompt' ? 'optional (e.g., K)' : 'optional (e.g., UTF-8)';
      }
    }
    function writeState() {
      if (schema.kind === 'service') {
        syncServiceFields();
      } else if (schema.kind === 'typing') {
        syncTypingFields();
      }
      for (const field of schema.fields) {
        if (field.id !== 'metric') {
          writeFieldValue(field, state[field.id] ?? '');
        }
      }
    }
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
    function setStatus(message, isWarning = false) {
      if (statusElement) {
        statusElement.textContent = message;
        statusElement.classList.toggle('is-warning', isWarning);
      }
    }
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
    function syncOutputAvailability(result) {
      const isComplete = result.missing.length === 0;
      const service = schema.kind === 'service' ? findService(schema, state.service) : undefined;
      for (const field of schema.fields) {
        const isRequired =
          field.isRequired || (field.id === 'owner' && service?.ownerMode === 'required');
        const isMissing = isRequired && !readState(state, field.id);
        const fieldElement = fieldElements.get(field.id);
        if (fieldElement) {
          fieldElement.classList.toggle('is-missing', isMissing);
          for (const control of fieldElement.querySelectorAll(
            '.builder-input:not(.select-trigger)'
          )) {
            if (isMissing) {
              control.setAttribute('aria-invalid', 'true');
            } else if (!control.closest('.is-invalid')) {
              control.removeAttribute('aria-invalid');
            }
          }
        }
      }
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
          ? crossBuilderNotice
          : `Required: ${result.missing.join(', ')}. Fill in every required field to preview and copy the snippet.`,
        !isComplete || Boolean(crossBuilderNotice)
      );
    }
    function readSnippetOptions() {
      return { alt: (altInput?.value ?? '').trim(), link: (linkInput?.value ?? '').trim() };
    }
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
    function update(scope) {
      renderOutputs();
      syncSelects(scope);
      iconPickerController.syncIconSelects(scope);
      iconPickerController.validateIcons(scope);
    }
    function bindHelpPopovers() {
      for (const trigger of form.querySelectorAll('[data-help-popover]')) {
        if (trigger instanceof HTMLElement) {
          const popoverId = trigger.dataset.helpPopover ?? '';
          const align = trigger.dataset.helpAlign === 'start' ? 'start' : 'end';
          const popover = popoverId ? document.getElementById(popoverId) : undefined;
          if (popover instanceof HTMLElement) {
            popover.addEventListener('toggle', (event) => {
              if (event.newState === 'open') {
                site?.placePopover(popover, trigger, { align, gap: 6 });
              }
            });
          }
        }
      }
    }
    function syncServiceFieldChange(field) {
      if (field.id === 'service') {
        syncServiceFields();
      } else if (field.id === 'metric') {
        syncServiceSpecialOptions();
      } else {
        return;
      }
      const specialField = fieldsById.get('special');
      const specialElement = fieldElements.get('special');
      if (specialField && specialElement) {
        state.special = readFieldValue(specialField, specialElement);
      }
    }
    function syncControlPartsOnInput(field, fieldElement, target) {
      if (field.control === 'anim' && field.animScope !== 'pair' && target instanceof Element) {
        const sheen = getPart(fieldElement, 'sheen');
        const left = getPart(fieldElement, 'left');
        if (
          target.matches('[data-part="left"]') &&
          left?.value === 'none' &&
          sheen instanceof HTMLInputElement
        ) {
          sheen.checked = false;
        } else if (
          target.matches('[data-part="sheen"]') &&
          sheen instanceof HTMLInputElement &&
          sheen.checked &&
          left?.value === 'none'
        ) {
          left.value = '';
        }
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
    }
    function handleFieldInput(event) {
      const target = event.target ?? undefined;
      if (
        (event.type === 'change' && !(target instanceof HTMLSelectElement)) ||
        target === stackCategorySearch ||
        target === stackGroupToggle
      ) {
        return;
      }
      const fieldElement = target instanceof Element ? target.closest('[data-field]') : undefined;
      const field = fieldsById.get(fieldElement?.getAttribute('data-field') ?? '');
      if (!fieldElement || !field) {
        return;
      }
      crossBuilderNotice = '';
      syncControlPartsOnInput(field, fieldElement, target);
      state[field.id] = readFieldValue(field, fieldElement);
      stackCatalogController?.syncStackFieldChange(field);
      syncServiceFieldChange(field);
      if (field.id === 'layout') {
        syncTypingFields();
      }
      update(fieldElement);
    }
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
    function syncStateFromForm() {
      for (const field of schema.fields) {
        const fieldElement = fieldElements.get(field.id);
        if (fieldElement) {
          state[field.id] = readFieldValue(field, fieldElement);
        }
      }
    }
    function applyState(nextState) {
      state = { ...nextState };
      if (schema.kind === 'service' && !findService(schema, state.service)) {
        state.service = schema.services?.[0]?.key ?? '';
      }
      writeState();
      syncStateFromForm();
      update(form);
    }
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
      crossBuilderNotice =
        sharedPath && !parsedState
          ? 'The shared link belongs to another builder; Showing the example instead.'
          : '';
      applyState(parsedState ?? schema.initialState);
    }
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
    function handleTabKeydown(event) {
      const tabs = [...document.querySelectorAll('.builder-tab')];
      if (tabs.length === 0) {
        return;
      }
      let current = 0;
      for (const [i, tab] of tabs.entries()) {
        if (tab.getAttribute('aria-selected') === 'true') {
          current = i;
        }
      }
      let nextIndex = undefined;
      if (event.key === 'ArrowLeft') {
        nextIndex = (current - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'ArrowRight') {
        nextIndex = (current + 1) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      }
      const next = nextIndex !== undefined ? tabs[nextIndex] : undefined;
      if (next instanceof HTMLElement) {
        event.preventDefault();
        selectTab(next);
        next.focus();
      }
    }
    function bindBuilderEvents() {
      form.addEventListener('input', handleFieldInput);
      form.addEventListener('change', handleFieldInput);
      form.addEventListener('submit', (event) => event.preventDefault());
      altInput?.addEventListener('input', () => {
        crossBuilderNotice = '';
        renderOutputs();
      });
      linkInput?.addEventListener('input', () => {
        crossBuilderNotice = '';
        renderOutputs();
      });
      if (linkInput && schema.kind === 'service') {
        linkInput.placeholder = 'Upstream page of the service';
      }
      previewImage?.addEventListener('load', () => {
        previewImage.classList.remove('is-loading');
        if (buildPath(schema, state).missing.length === 0) {
          setStatus(crossBuilderNotice, Boolean(crossBuilderNotice));
        }
      });
      previewImage?.addEventListener('error', () => {
        previewImage.classList.remove('is-loading');
        setStatus('The preview could not be loaded; Check the route values.', true);
      });
      reducedMotionQuery.addEventListener('change', () => loadPreview(currentPreviewPath));
      const tabList = outputElement?.querySelector('.builder-tabs');
      tabList?.addEventListener('click', (event) => {
        const tab =
          event.target instanceof Element ? event.target.closest('.builder-tab') : undefined;
        if (tab instanceof HTMLElement) {
          selectTab(tab);
        }
      });
      tabList?.addEventListener('keydown', (event) => handleTabKeydown(event));
      form.addEventListener('click', (event) => {
        const clearButton =
          event.target instanceof Element ? event.target.closest('[data-icon-clear]') : undefined;
        const input = clearButton
          ? document.getElementById(clearButton.getAttribute('data-icon-clear') ?? '')
          : undefined;
        if (input instanceof HTMLInputElement) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          const trigger = form.querySelector(`[data-icon-target="${input.id}"]`);
          if (trigger instanceof HTMLElement) {
            trigger.focus();
          }
        }
      });
      bindSelects(form, site);
      bindHelpPopovers();
      resetButton?.addEventListener('click', () => {
        crossBuilderNotice = '';
        if (altInput) {
          altInput.value = '';
        }
        if (linkInput) {
          linkInput.value = '';
        }
        if (stackCategorySearch && stackCategorySearch.value) {
          stackCategorySearch.value = '';
          stackCatalogController?.filterCatalog();
        }
        applyState({});
      });
      shareButton?.addEventListener('click', copyShareLink);
    }
    initializeState();
    bindBuilderEvents();
    stackCatalogController.bind();
    typingLinesController.bind();
    iconPickerController.bind();
    iconPickerController.loadIndexInBackground();
  }
  if (typeof document === 'undefined') {
    globalThis.svgBuilderCore = core;
  } else {
    initBuilderDom();
  }
})();
