import { describe, expect, it } from 'vitest';
import {
  productTerms,
  addExposure,
  type Exposure,
} from '../src/live-policy.js';
import { nextCaptureDelay } from '../src/capture-cadence.js';

describe('product phrase precision regressions', () => {
  it.each([
    'iPhone 150',
    'Raspberry Pi 50',
    'Galaxy Buds 3 Projector',
    'AirPods Professional',
    'myiphone 15',
    'AIRPODS PROTEIN',
  ])('does not truncate or partially match %s', (text) => {
    expect(productTerms(text)).toEqual([]);
  });
  it.each([
    ['iPhone 15 Pro Max', 'iPhone 15 Pro Max'],
    ['iPhone 16', 'iPhone 16'],
    ['Samsung SM-R630', 'Galaxy Buds3 Pro'],
    ['Galaxy Buds3 Pro', 'Galaxy Buds3 Pro'],
    ['갤럭시 버즈 3 프로', 'Galaxy Buds3 Pro'],
    ['AirPods Pro', 'AirPods Pro'],
  ])('retains exact canonical model in %s', (text, expected) =>
    expect(productTerms(text)).toEqual([expected]),
  );
});
describe('capture cadence', () => {
  it.each([
    [200, 1800],
    [1500, 500],
    [2300, 100],
    [9000, 100],
  ])('accounts for %d ms processing without overlap', (elapsed, expected) => {
    expect(nextCaptureDelay(2, elapsed)).toBe(expected);
  });
  it('supports the one-second mode without exceeding Chrome quota', () =>
    expect(nextCaptureDelay(1, 200)).toBe(800));
});
describe('confidence aggregation', () => {
  it('uses strongest same-class detection regardless of order', () => {
    const store = new Map<string, Exposure>();
    const a = {
      key: 'remote',
      label: '리모컨',
      source: 'local_object_model' as const,
      confidence: 0.95,
    };
    addExposure(store, [a, { ...a, confidence: 0.67 }], 'example.com');
    expect(store.get('remote')?.confidence).toBe(0.95);
  });
});
