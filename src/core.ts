import type { Decision, Product, Ranked, RawPage } from './types.js';
export function clean(value: unknown, max = 180): string {
  return String(value ?? '')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[EMAIL]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[NUMBER]')
    .replace(/\b01[016789][- ]?\d{3,4}[- ]?\d{4}\b/g, '[PHONE]')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
export function safeUrl(value: unknown, base?: string): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const u = new URL(String(value), base);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
      return '';
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/갤럭시/g, 'galaxy ')
    .replace(/삼성/g, 'samsung ')
    .replace(/버즈/g, 'buds ')
    .replace(/프로/g, 'pro ')
    .replace(/라즈베리\s*파이/g, 'raspberry pi ')
    .replace(/sm[ -]?r630/g, 'galaxy buds 3 pro')
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function money(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) && value > 0 && value < 1e10 ? value : null;
  let s = String(value ?? '').trim();
  if (!s || /-|무료|free/i.test(s)) return null;
  s = s.replace(/[^\d.,]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s))
    s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{2}$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n < 1e10 ? n : null;
}
export function productsIn(data: unknown): Record<string, any>[] {
  const found: Record<string, any>[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 12 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      v.slice(0, 100).forEach(x => walk(x, depth + 1));
      return;
    }
    const o = v as Record<string, any>;
    if ([o['@type']].flat().some(t => /(^|\/)Product$/.test(String(t))))
      found.push(o);
    Object.values(o).forEach(x => walk(x, depth + 1));
  };
  walk(data);
  return found;
}
export function decide(raw: RawPage, consent = true): Decision {
  const reasons: string[] = [];
  if (!consent)
    return { capture: false, confidence: 1, reason: ['consent_missing'] };
  if (
    raw.signals.password ||
    raw.signals.sensitive ||
    /(?:login|signin|signup|checkout|payment|bank|webmail|mail\.|messenger|medical|hospital|account|privacy|로그인|결제|병원|의료)/i.test(
      raw.url + ' ' + raw.title
    )
  )
    return {
      capture: false,
      confidence: 1,
      reason: ['sensitive_page_blocked']
    };
  let score = 0;
  if (raw.signals.product || productsIn(raw.jsonld).length) {
    score += .65;
    reasons.push('schema_product_detected');
  }
  if (raw.signals.price) {
    score += .2;
    reasons.push('price_detected');
  }
  if (raw.signals.purchase) {
    score += .2;
    reasons.push('purchase_button_detected');
  }
  if (/product|shop|store|상품|구매/i.test(raw.url + ' ' + raw.title)) {
    score += .1;
    reasons.push('commerce_url_or_title');
  }
  if (raw.candidates.name?.length) {
    score += .1;
    reasons.push('product_heading_detected');
  }
  const confidence = Math.min(.99, score);
  return {
    capture: confidence >= .55,
    confidence,
    reason: [
      ...reasons,
      ...(confidence < .55 ? ['insufficient_commerce_signals'] : [])
    ]
  };
}
export function category(name: string): {
  category: string;
  confidence: number} {
  const n = normalize(name);
  const rules: [string, RegExp][] = [
    ['wireless_earbuds', /buds|earbuds|에어팟|이어폰/],
    ['single_board_computer', /raspberry pi|라즈베리/],
    ['smartphone', /iphone|galaxy s|smartphone|아이폰/],
    ['laptop', /laptop|macbook|노트북/],
    ['footwear', /shoe|runner|sneaker|신발/],
    ['book', /book|paperback|hardcover|attic|gatsby|책/]
  ];
  for (const [c, r] of rules)
    if (r.test(n)) return { category: c, confidence: .9 };
  return { category: 'unknown', confidence: .2 };
}
export function extract(raw: RawPage, ocr = ''): Product | null {
  const nodes = productsIn(raw.jsonld);
  const node =
    nodes.find(p => safeUrl(p.url, raw.url) === raw.url) || nodes[0] || {};
  const offer = [node.offers].flat().find(Boolean) || {};
  const provenance: Product['provenance'] = {};
  const pick = (field: string, options: [unknown, string, number][]): any => {
    for (const [value, source, confidence] of options) {
      if (value !== undefined && value !== null && value !== '') {
        const v =
          typeof value === 'number'
            ? value
            : clean(value, field.includes('url') ? 1000 : 180);
        provenance[field] = { value: v, source, confidence };
        return v;
      }
    }
    return '';
  };
  const name = pick('name', [
    [node.name, 'json_ld', .99],
    [raw.meta['og:title'], 'meta', .85],
    [raw.candidates.name?.[0], 'dom', .8],
    [ocr.split('\n').find(s => /[a-z가-힣]{3}/i.test(s)), 'ocr', .55]
  ]);
  if (!name) return null;
  const priceOptions: [unknown, string, number][] = [
    [
      money(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price),
      'json_ld',
      .99
    ],
    [
      money(raw.meta['product:price:amount'] ?? raw.meta['og:price:amount']),
      'meta',
      .9
    ],
    ...(raw.candidates.price || []).map(
      v => [money(v), 'dom', .75] as [unknown, string, number]
    ),
    [money(ocr.match(/(?:[$£€₩]\s*[\d,.]+|[\d,]+\s*원)/)?.[0]), 'ocr', .6]
  ];
  const price = pick('price', priceOptions) || null;
  const brand = pick('brand', [
    [
      typeof node.brand === 'string' ? node.brand : node.brand?.name,
      'json_ld',
      .99
    ],
    [raw.meta['product:brand'], 'meta', .9],
    [raw.candidates.brand?.[0], 'dom', .8],
    [
      /samsung|galaxy|삼성|갤럭시/i.test(name)
        ? 'Samsung'
        : /raspberry/i.test(name)
          ? 'Raspberry Pi'
          : /apple|iphone/i.test(name)
            ? 'Apple'
            : undefined,
      'dictionary',
      .75
    ]
  ]);
  const model = pick('model', [
    [node.model ?? node.mpn, 'json_ld', .95],
    [raw.candidates.model?.[0], 'dom', .8],
    [name.match(/\bSM[- ]?[A-Z]\d{3}[A-Z]*\b/i)?.[0], 'regex', .85]
  ]);
  const cat = category(
    name + ' ' + (node.category || raw.candidates.category?.[0] || '')
  );
  const currency =
    pick('currency', [
      [offer.priceCurrency, 'json_ld', .99],
      [raw.meta['product:price:currency'], 'meta', .9],
      [raw.candidates.currency?.[0], 'dom', .8],
      [
        /₩|원/.test((raw.candidates.price || []).join())
          ? 'KRW'
          : /£/.test((raw.candidates.price || []).join())
            ? 'GBP'
            : /€/.test((raw.candidates.price || []).join())
              ? 'EUR'
              : undefined,
        'symbol',
        .8
      ]
    ]) || 'UNKNOWN';
  const numeric = (v: unknown, max: number) => {
    const n = Number(v);
    return v !== undefined &&
      v !== null &&
      Number.isFinite(n) &&
      n >= 0 &&
      n <= max
      ? n
      : null;
  };
  const rating = numeric(
    pick('rating', [
      [numeric(node.aggregateRating?.ratingValue, 5), 'json_ld', .95],
      [numeric(raw.candidates.rating?.[0], 5), 'dom', .7]
    ]) || null,
    5
  );
  const reviews = numeric(
    pick('review_count', [
      [
        numeric(
          node.aggregateRating?.reviewCount ??
            node.aggregateRating?.ratingCount,
          1e9
        ),
        'json_ld',
        .95
      ],
      [numeric(raw.candidates.review_count?.[0], 1e9), 'dom', .7]
    ]) || null,
    1e9
  );
  const image = safeUrl(
    pick('image_url', [
      [
        Array.isArray(node.image)
          ? node.image[0]
          : typeof node.image === 'object'
            ? node.image?.url
            : node.image,
        'json_ld',
        .95
      ],
      [raw.meta['og:image'], 'meta', .85],
      [raw.candidates.image?.[0], 'dom', .6]
    ]),
    raw.url
  );
  provenance.category = {
    value: cat.category,
    source: 'keyword_rule',
    confidence: cat.confidence
  };
  const url = safeUrl(raw.url);
  let hash = 2166136261;
  for (const c of url) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return {
    product_id: (hash >>> 0).toString(16),
    name,
    normalized_name: normalize(name),
    brand,
    model,
    category: cat.category,
    price,
    currency: currency.toUpperCase(),
    rating,
    review_count: reviews,
    seller: clean(offer.seller?.name || raw.domain),
    condition: /UsedCondition/i.test(offer.itemCondition)
      ? 'used'
      : /NewCondition/i.test(offer.itemCondition)
        ? 'new'
        : 'unknown',
    image_url: image,
    product_url: url,
    source_site: raw.domain,
    extraction_method: [
      ...new Set(Object.values(provenance).map(p => p.source))
    ].join('+'),
    confidence: provenance.name?.confidence || 0,
    timestamp: new Date().toISOString(),
    provenance
  };
}
export function similarity(a: Product, b: Product): number {
  if (a.model && b.model && normalize(a.model) !== normalize(b.model))
    return .15;
  if (a.brand && b.brand && normalize(a.brand) !== normalize(b.brand))
    return .2;
  if (a.model && b.model && normalize(a.model) === normalize(b.model))
    return .99;
  const tokens = (s: string) =>
    new Set(
      normalize(s)
        .split(' ')
        .filter(t => !['samsung', 'the', 'new'].includes(t))
    );
  const x = tokens(a.name),
    y = tokens(b.name);
  const intersection = [...x].filter(t => y.has(t)).length;
  const jaccard = intersection / new Set([...x, ...y]).size;
  return Math.min(
    1,
    jaccard * .85 +
      (a.brand && normalize(a.brand) === normalize(b.brand) ? .15 : 0)
  );
}
export function rank(base: Product, candidates: Product[]): Ranked[] {
  return [...new Map(candidates.map(p => [p.product_url, p])).values()]
    .filter(p => p.product_url !== base.product_url)
    .map(p => {
      const sim = similarity(base, p);
      const comparable =
        base.currency !== 'UNKNOWN' &&
        base.currency === p.currency &&
        base.price !== null &&
        p.price !== null &&
        base.condition === p.condition;
      const priceScore = comparable
        ? Math.min(1, base.price! / p.price!) * .2
        : 0;
      const reasons = [
        `상품명/모델 유사도 ${(sim * 100).toFixed(0)}%`,
        comparable
          ? `동일 통화 ${p.currency}; 배송/세금 제외`
          : '통화 또는 상품 상태 차이: 가격 비교 제외'
      ];
      return {
        ...p,
        similarity: sim,
        score:
          sim * .65 +
          priceScore +
          (p.rating ?? 0) / 5* .1 +
          p.confidence * .05,
        reasons,
        match: sim >= .85 ?'same' as const:'similar' as const,
        price_comparable: comparable
      };
    })
    .filter(p => p.similarity >= .25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}
export function queriesFor(p: Product): string[] {
  const q = clean(p.model ? `${p.brand} ${p.model}` : p.name, 100);
  return [q, `${q} 최저가`, `${q} 중고`, `${q} alternative`];
}
export function stats(values: number[]) {
  const a = [...values].sort((x, y) => x - y);
  const q = (p: number) => a[Math.max(0, Math.ceil(a.length * p) - 1)] ?? 0;
  return {
    count: a.length,
    average: a.reduce((s, x) => s + x, 0) / (a.length || 1),
    median: q(.5),
    p50: q(.5),
    p95: q(.95),
    maximum: q(1)
  };
}
