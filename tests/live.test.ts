import { describe, expect, it } from 'vitest';
import {
  addExposure,
  liveDecision,
  productTerms,
  sensitiveUrl,
  type Exposure,
} from '../src/live-policy.js';

const base = {
  url: 'https://www.youtube.com/watch?v=demo',
  consent: true,
  focused: true,
  visibleSensitive: false,
  editing: false,
  serverRunning: true,
};
describe('periodic capture privacy policy', () => {
  it.each([
    'https://www.youtube.com/watch?v=x',
    'https://www.instagram.com/reels/demo/',
    'https://example.com/article',
  ])('allows non-shopping %s', (url) => {
    expect(liveDecision({ ...base, url }).capture).toBe(true);
  });
  it.each([
    'https://www.instagram.com/direct/inbox/',
    'https://mail.google.com/',
    'https://example.com/checkout',
    'https://example.com/settings',
    'https://example.com/login',
    'chrome://settings',
    'https://hospital.example/',
    'https://x.com/messages',
  ])('blocks sensitive %s', (url) => {
    expect(sensitiveUrl(url)).toBe(true);
    expect(liveDecision({ ...base, url }).capture).toBe(false);
  });
  it.each([
    { consent: false },
    { focused: false },
    { visibleSensitive: true },
    { editing: true },
    { serverRunning: false },
  ])('fails closed %o', (change) => {
    expect(liveDecision({ ...base, ...change }).capture).toBe(false);
  });
});
describe('exposure aggregation', () => {
  const entry = {
    key: 'remote',
    label: '리모컨',
    source: 'local_object_model' as const,
    confidence: 0.9,
  };
  it('counts one observation per class per frame; not number of objects', () => {
    const map = new Map<string, Exposure>();
    addExposure(map, [entry, entry], 'youtube.com', 1000);
    addExposure(map, [entry], 'instagram.com', 11000);
    expect(map.get('remote')?.observations).toBe(2);
    expect(map.get('remote')?.domains).toEqual([
      'youtube.com',
      'instagram.com',
    ]);
  });
  it('expires observations after 30 minutes and bounds memory', () => {
    const map = new Map<string, Exposure>();
    addExposure(map, [entry], 'example.com', 1000);
    addExposure(map, [], '', 1_802_000);
    expect(map.size).toBe(0);
    addExposure(
      map,
      Array.from({ length: 110 }, (_, i) => ({ ...entry, key: String(i) })),
      'example.com',
      1_803_000,
    );
    expect(map.size).toBe(100);
  });
  it('retains only allowlisted product phrases, never OCR personal text', () => {
    expect(
      productTerms(
        'Jane jane@example.com 010-1234-5678 Galaxy Buds3 Pro account secret',
      ),
    ).toEqual(['Galaxy Buds3 Pro']);
    expect(productTerms('This is a private message')).toEqual([]);
  });
});
