export const sensitiveUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return (
      !/^https?:$/.test(u.protocol) ||
      !!u.username ||
      !!u.password ||
      /(?:login|sign[-_]?in|sign[-_]?up|checkout|payment|bank|webmail|mail\.|outlook|gmail|messenger|messages|\/direct(?:\/|$)|discord|slack|teams\.microsoft|medical|hospital|health|account|settings|privacy|auth|로그인|결제|병원|의료)/i.test(
        decodeURIComponent(u.href),
      )
    );
  } catch {
    return true;
  }
};

export function liveDecision(input: {
  url: string;
  consent: boolean;
  focused: boolean;
  visibleSensitive: boolean;
  editing: boolean;
  serverRunning: boolean;
}) {
  const reason: string[] = [];
  if (!input.consent) reason.push('consent_missing');
  if (!input.serverRunning) reason.push('program_stopped');
  if (!input.focused) reason.push('inactive_tab_or_window');
  if (sensitiveUrl(input.url)) reason.push('sensitive_or_unsupported_url');
  if (input.visibleSensitive) reason.push('sensitive_content_visible');
  if (input.editing) reason.push('user_editing');
  return {
    capture: reason.length === 0,
    confidence: reason.length ? 1 : 0.7,
    reason: reason.length
      ? reason
      : ['periodic_visible_screen', 'privacy_heuristics_passed'],
  };
}

export const objectLabels: Record<string, string> = {
  bicycle: '자전거',
  car: '자동차',
  motorcycle: '오토바이',
  backpack: '백팩',
  umbrella: '우산',
  handbag: '가방',
  tie: '넥타이',
  suitcase: '여행가방',
  skateboard: '스케이트보드',
  surfboard: '서핑보드',
  'tennis racket': '테니스 라켓',
  bottle: '병',
  'wine glass': '와인잔',
  cup: '컵',
  fork: '포크',
  knife: '칼',
  spoon: '숟가락',
  bowl: '그릇',
  chair: '의자',
  couch: '소파',
  bed: '침대',
  'dining table': '테이블',
  tv: 'TV',
  laptop: '노트북',
  mouse: '마우스',
  remote: '리모컨',
  keyboard: '키보드',
  'cell phone': '휴대폰',
  microwave: '전자레인지',
  oven: '오븐',
  toaster: '토스터',
  refrigerator: '냉장고',
  book: '책',
  clock: '시계',
  vase: '꽃병',
  scissors: '가위',
  'teddy bear': '인형',
  'hair drier': '헤어드라이어',
  toothbrush: '칫솔',
};

// Only these product phrases leave the OCR module; full OCR text never enters storage/logs.
export function productTerms(text: string): string[] {
  return [
    ...new Set(
      [
        /galaxy\s*buds\s*3\s*pro|갤럭시\s*버즈\s*3\s*프로/i.test(text)
          ? 'Galaxy Buds3 Pro'
          : '',
        /raspberry\s*pi\s*5/i.test(text) ? 'Raspberry Pi 5' : '',
        /airpods\s*pro/i.test(text) ? 'AirPods Pro' : '',
        /iphone\s*\d{2}(?:\s*pro)?/i.exec(text)?.[0].replace(/\s+/g, ' ') || '',
      ].filter(Boolean),
    ),
  ];
}

export interface Exposure {
  key: string;
  label: string;
  source: 'local_object_model' | 'ocr_dictionary';
  observations: number;
  first_seen: string;
  last_seen: string;
  domains: string[];
  confidence: number;
}
export function addExposure(
  store: Map<string, Exposure>,
  entries: Pick<Exposure, 'key' | 'label' | 'source' | 'confidence'>[],
  domain: string,
  now = Date.now(),
) {
  for (const [key, value] of store)
    if (now - Date.parse(value.last_seen) > 30 * 60_000) store.delete(key);
  const unique = new Map(entries.map((e) => [e.key, e]));
  for (const entry of unique.values()) {
    const old = store.get(entry.key);
    const timestamp = new Date(now).toISOString();
    store.set(entry.key, {
      ...entry,
      observations: (old?.observations || 0) + 1,
      first_seen: old?.first_seen || timestamp,
      last_seen: timestamp,
      domains: [...new Set([...(old?.domains || []), domain])].slice(-10),
    });
  }
  while (store.size > 100) store.delete(store.keys().next().value!);
}