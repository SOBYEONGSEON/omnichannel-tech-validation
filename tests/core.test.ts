import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { collect } from '../src/collect.js';
import {
  clean,
  decide,
  extract,
  money,
  normalize,
  rank,
  safeUrl,
  similarity,
  stats
} from '../src/core.js';
import { cases, productHtml } from './fixtures.js';
import { createRun, processRun, stored, eraseAll } from '../src/pipeline.js';
import { boundedFetch } from '../src/search.js';
const raw = (html: string, url = 'https://merchant.example/product/1') =>
  collect(parseHTML(html).document as unknown as Document, url);
describe('ground truth capture and extraction', () => {
  for (const f of cases)
    it(f.id, () => {
      const r = raw(f.html, f.url);
      expect(decide(r).capture).toBe(f.capture);
      if (f.name) {
        const p = extract(r);
        expect(p?.name).toBe(f.name);
        expect(p?.price).toBe(f.price);
        expect(p?.brand).toBe(f.brand);
        expect(p?.category).toBe(f.category);
      }
      if (r.signals.sensitive) {
        expect(r.text).toBe('');
        expect(r.jsonld).toEqual([]);
      }
    });
});
describe('security and parsing', () => {
  it('empty response is safely rejected', () => {
    expect(decide(raw('')).capture).toBe(false);
    expect(extract(raw(''))).toBe(null);
  });
  it('empty URL values never become /undefined', () =>
    expect(safeUrl(undefined, 'https://a.example/p')).toBe(''));
  it('consent is required', () =>
    expect(decide(raw(productHtml()), false).capture).toBe(false));
  it('never copies form values or review author', () => {
    const r = raw(
      productHtml(
        undefined,
        259000,
        '<input value="secret@example.com"><textarea>secret</textarea>'
      )
    );
    expect(JSON.stringify(r)).not.toContain('secret');
  });
  it('removes PII and tracking', () => {
    expect(clean('test@example.com 010-1234-5678')).not.toContain('test@');
    expect(safeUrl('https://a.example/p?token=secret#account')).toBe(
      'https://a.example/p'
    );
    expect(safeUrl('javascript:alert(1)')).toBe('');
  });
  it.each([
    ['259,000원', 259000],
    ['€1.299,95', 1299.95],
    ['£51.77', 51.77],
    ['-99', null],
    ['NaN', null],
    ['', null],
    ['1,2,3', null]
  ])('money %s', (s, n) => expect(money(s)).toBe(n));
  it('does not invent currency from bare dollar', () => {
    const p = extract(raw('<h1>Phone</h1><b class="price">$100</b>'));
    expect(p?.currency).toBe('UNKNOWN');
  });
  it('blocks arbitrary network and local file fetch', async () => {
    await expect(boundedFetch('http://127.0.0.1/admin')).rejects.toThrow(
      'UNSUPPORTED_HOST'
    );
    await expect(boundedFetch('https://evil.example')).rejects.toThrow(
      'UNSUPPORTED_HOST'
    );
  });
  it('stats uses nearest-rank p95', () =>
    expect(stats(Array.from({ length: 100 }, (_, i) => i + 1)).p95).toBe(95));
});
describe('matching and ranking', () => {
  const p = extract(raw(productHtml()))!;
  it('normalizes Korean and model aliases', () => {
    expect(normalize('갤럭시 버즈3 프로')).toBe('galaxy buds 3 pro');
    expect(normalize('SM-R630')).toBe('galaxy buds 3 pro');
  });
  it('same model is matched', () =>
    expect(similarity(p, { ...p, name: 'Samsung earbuds' })).toBe(.99));
  it('conflicting models are not matched', () =>
    expect(similarity(p, { ...p, model: 'SM-R530' })).toBeLessThan(.25));
  it('does not price compare currencies', () =>
    expect(
      rank(p, [
        { ...p, product_url: 'https://a.example/p', currency: 'USD', price: 50 }
      ])[0].price_comparable
    ).toBe(false));
  it('drops duplicate and current URL', () =>
    expect(
      rank(p, [
        p,
        { ...p, product_url: 'https://a.example/p' },
        { ...p, product_url: 'https://a.example/p' }
      ])
    ).toHaveLength(1));
});
describe('pipeline integration', () => {
  it('persists only structure and survives empty search', async () => {
    eraseAll();
    const run = createRun(raw(productHtml()));
    await processRun(run, { search: async () => [] });
    expect(run.status).toBe('complete_no_results');
    expect(stored.size).toBe(1);
    expect(JSON.stringify([...stored.values()])).not.toContain('screenshot');
    expect(run.timings.total_latency).toBeGreaterThan(0);
  });
  it('network failure becomes structured error', async () => {
    const run = createRun(raw(productHtml()));
    await processRun(run, {
      search: async () => {
        throw Error('NETWORK_OFFLINE');
      }
    });
    expect(run.status).toBe('error');
    expect(run.logs.at(-1)?.error?.code).toBe('NETWORK_OFFLINE');
  });
  it('sensitive input never calls search or stores', async () => {
    eraseAll();
    const run = createRun(
      raw(productHtml(), 'https://merchant.example/checkout')
    );
    let calls = 0;
    await processRun(run, {
      search: async () => {
        calls++;
        return [];
      }
    });
    expect(run.status).toBe('skipped');
    expect(calls).toBe(0);
    expect(stored.size).toBe(0);
  });
  it('capture failure retains DOM flow', async () => {
    const run = createRun(raw(productHtml()));
    await processRun(run, {
      capture_error: 'CAPTURE_FAILED',
      search: async () => []
    });
    expect(run.status).toBe('complete_no_results');
    expect(run.logs.some(l => l.stage === 'capture' && !l.success)).toBe(true);
  });
});
