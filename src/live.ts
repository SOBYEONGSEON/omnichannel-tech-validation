import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { cpus } from 'node:os';
import { analyzeImage } from './vision.js';
import { addExposure, sensitiveUrl, type Exposure } from './live-policy.js';

const interests = new Map<string, Exposure>();
let generation = 0;
let busy = false;
let lastStart = 0;
let cache: {
  hash: string;
  result: Awaited<ReturnType<typeof analyzeImage>>;
} | null = null;
const state = {
  session_id: randomUUID(),
  running: true,
  interval_seconds: 10,
  frames: 0,
  skipped: 0,
  status: '프로그램 시작됨 · 확장 프로그램 연결 대기',
  last_error: null as string | null,
  latest: null as Record<string, unknown> | null,
};
const samples: { total_ms: number; cpu_percent: number; memory_mb: number }[] =
  [];
const events: { timestamp: string; capture: boolean; reason: string[] }[] = [];
export function liveState() {
  addExposure(interests, [], '', Date.now());
  return {
    ...state,
    busy,
    interests: [...interests.values()].sort(
      (a, b) => b.observations - a.observations,
    ),
    samples,
    events,
    storage:
      '프로세스 RAM · 관심 데이터 30분 TTL · 최대 100개 · 프로그램 종료 시 삭제',
    discarded: [
      '원본 화면 이미지(분석 후 참조 해제)',
      'OCR 전체 원문',
      '사람·동물 검출 결과(관심 집계 제외)',
      '전체 URL·페이지 제목·DOM',
    ],
    model: 'YOLOS-tiny q8 / local CPU / 80 COCO classes 중 사물만',
    limitation:
      '노출 횟수는 주기별 관측 수이며 구매 의도나 서로 다른 상품 수가 아닙니다. 정확한 모델명은 제한된 OCR 사전으로만 확인합니다.',
  };
}
export function controlLive(input: unknown) {
  const control = z
    .object({
      action: z.enum(['pause', 'resume', 'clear', 'interval']),
      interval_seconds: z.number().int().min(5).max(60).optional(),
    })
    .strict()
    .parse(input);
  if (control.action === 'pause') {
    state.running = false;
    state.status = '일시정지';
    generation++;
  }
  if (control.action === 'resume') {
    state.running = true;
    state.status = '주기적 분석 대기';
  }
  if (control.action === 'interval' && control.interval_seconds)
    state.interval_seconds = control.interval_seconds;
  if (control.action === 'clear') {
    generation++;
    interests.clear();
    cache = null;
    samples.length = 0;
    events.length = 0;
    state.latest = null;
    state.frames = 0;
    state.skipped = 0;
    state.last_error = null;
    state.session_id = randomUUID();
  }
  return liveState();
}
export function recordSkip(input: unknown) {
  const reason = z
    .object({
      reason: z
        .array(
          z.enum([
            'consent_missing',
            'program_stopped',
            'inactive_tab_or_window',
            'sensitive_or_unsupported_url',
            'sensitive_content_visible',
            'user_editing',
            'navigation_changed',
            'capture_failed',
          ]),
        )
        .min(1)
        .max(6),
    })
    .strict()
    .parse(input).reason;
  state.skipped++;
  events.push({ timestamp: new Date().toISOString(), capture: false, reason });
  if (events.length > 30) events.shift();
  return { ok: true };
}
const frameSchema = z
  .object({
    image: z
      .string()
      .max(6_000_000)
      .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/),
    domain: z
      .string()
      .max(253)
      .regex(/^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i),
    capture_ms: z.number().min(0).max(60000),
    source: z.enum(['chrome_periodic', 'manual_test']),
  })
  .strict();
export async function observeFrame(input: unknown) {
  if (!state.running) return { status: 409, body: { error: 'PAUSED' } };
  if (busy || Date.now() - lastStart < 4000)
    return { status: 429, body: { error: 'BUSY_OR_RATE_LIMIT' } };
  const frame = frameSchema.parse(input);
  if (sensitiveUrl(`https://${frame.domain}/`))
    return { status: 403, body: { error: 'SENSITIVE_DOMAIN' } };
  busy = true;
  lastStart = Date.now();
  const currentGeneration = generation;
  const start = performance.now();
  const cpu = process.cpuUsage();
  state.status = '이미지 분석 중';
  try {
    const hash = createHash('sha256').update(frame.image).digest('hex');
    const cached = cache?.hash === hash;
    const result = cached ? cache!.result : await analyzeImage(frame.image);
    // Pause/erase during inference must not repopulate deleted data.
    if (currentGeneration !== generation || !state.running)
      return { status: 409, body: { error: 'CANCELLED' } };
    cache = { hash, result };
    const terms = result.terms.map((term) => ({
      key: `term:${term.toLowerCase()}`,
      label: term,
      confidence: 0.7,
      source: 'ocr_dictionary' as const,
    }));
    addExposure(interests, [...result.objects, ...terms], frame.domain);
    const elapsed = performance.now() - start;
    const used = process.cpuUsage(cpu);
    const metrics = {
      total_ms: elapsed,
      capture_ms: frame.capture_ms,
      cpu_percent:
        ((used.user + used.system) /
          1000 /
          Math.max(elapsed, 1) /
          cpus().length) *
        100,
      memory_mb: process.memoryUsage().rss / 1048576,
    };
    samples.push(metrics);
    if (samples.length > 100) samples.shift();
    state.frames++;
    state.last_error = null;
    state.status = '분석 완료 · 다음 주기 대기';
    state.latest = {
      timestamp: new Date().toISOString(),
      domain: frame.domain,
      source: frame.source,
      capture: true,
      capture_reason:
        frame.source === 'manual_test'
          ? ['user_selected_public_test_image']
          : ['periodic_visible_screen', 'privacy_heuristics_passed'],
      image_bytes: Buffer.byteLength(
        frame.image.slice(frame.image.indexOf(',') + 1),
        'base64',
      ),
      cache_hit: cached,
      objects: result.objects,
      product_terms: result.terms,
      ignored_objects: result.ignored_objects,
      ocr_error: result.ocr_error,
      timings: cached
        ? { preprocess_ms: 0, detection_ms: 0, ocr_ms: 0, ...metrics }
        : { ...result.timings, ...metrics },
      stored: [
        '사물 분류·confidence',
        '사전에 일치한 상품명',
        '관측 수·시각·도메인',
        '처리시간·자원 수치',
      ],
      search_queries: [
        ...result.objects.map((o) => o.label),
        ...result.terms,
      ].slice(0, 8),
    };
    events.push({
      timestamp: new Date().toISOString(),
      capture: true,
      reason: [
        frame.source === 'manual_test'
          ? 'user_selected_public_test_image'
          : 'periodic_visible_screen',
      ],
    });
    if (events.length > 30) events.shift();
    console.log(
      JSON.stringify({
        stage: 'live_frame',
        session_id: state.session_id,
        success: true,
        cached,
        ...metrics,
      }),
    );
    return { status: 200, body: liveState() };
  } catch {
    state.last_error = 'IMAGE_ANALYSIS_FAILED';
    state.status = '분석 실패 · 다음 주기에 재시도';
    console.log(
      JSON.stringify({
        stage: 'live_frame',
        success: false,
        error: state.last_error,
      }),
    );
    return { status: 422, body: { error: state.last_error } };
  } finally {
    frame.image = '';
    busy = false;
  }
}
