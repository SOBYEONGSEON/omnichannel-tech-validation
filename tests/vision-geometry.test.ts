import { describe, expect, it } from 'vitest';
import {
  pixelRegion,
  screenBox,
  suppressDuplicates,
} from '../src/vision-geometry.js';
describe('crop geometry and device pixel ratio', () => {
  it('suppresses overlapping same-class boxes by score', () => {
    const a = {
      key: 'bed',
      confidence: 0.95,
      box: { xmin: 0.1, ymin: 0.1, xmax: 0.9, ymax: 0.9 },
    };
    expect(suppressDuplicates([{ ...a, confidence: 0.79 }, a])).toEqual([a]);
  });
  it('retains distinct objects and overlapping different classes', () => {
    const a = {
      key: 'remote',
      confidence: 0.9,
      box: { xmin: 0.1, ymin: 0.1, xmax: 0.3, ymax: 0.3 },
    };
    const b = { ...a, box: { xmin: 0.6, ymin: 0.1, xmax: 0.8, ymax: 0.3 } };
    const c = { ...a, key: 'phone' };
    expect(suppressDuplicates([a, b, c])).toHaveLength(3);
  });
  it('discards invalid and zero-area boxes', () => {
    expect(
      suppressDuplicates([
        {
          key: 'remote',
          confidence: 0.9,
          box: { xmin: NaN, ymin: 0, xmax: 1, ymax: 1 },
        },
        {
          key: 'remote',
          confidence: 0.9,
          box: { xmin: 1, ymin: 0, xmax: 1, ymax: 1 },
        },
      ]),
    ).toEqual([]);
  });
  it.each([1, 1.25, 1.5, 2, 3])('maps CSS ROI at device scale %s', (scale) => {
    expect(
      pixelRegion(1000 * scale, 800 * scale, {
        left: 100,
        top: 120,
        width: 400,
        height: 200,
        viewport_width: 1000,
        viewport_height: 800,
      }),
    ).toEqual({
      left: 100 * scale,
      top: 120 * scale,
      width: 400 * scale,
      height: 200 * scale,
    });
  });
  it('clamps partially visible images to screenshot boundaries', () => {
    expect(
      pixelRegion(1000, 800, {
        left: -100,
        top: -80,
        width: 600,
        height: 500,
        viewport_width: 1000,
        viewport_height: 800,
      }),
    ).toEqual({ left: 0, top: 0, width: 500, height: 420 });
  });
  it.each([
    {
      left: 2000,
      top: 0,
      width: 100,
      height: 100,
      viewport_width: 1000,
      viewport_height: 800,
    },
    {
      left: 0,
      top: 0,
      width: 0,
      height: 100,
      viewport_width: 1000,
      viewport_height: 800,
    },
    {
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      viewport_width: 0,
      viewport_height: 800,
    },
    {
      left: 0,
      top: 0,
      width: NaN,
      height: 100,
      viewport_width: 1000,
      viewport_height: 800,
    },
  ])('rejects unusable ROI %o', (roi) =>
    expect(pixelRegion(1000, 800, roi)).toBeNull(),
  );
  it('maps crop-local boxes to the original viewport', () => {
    expect(
      screenBox(
        { xmin: 0.1, ymin: 0.2, xmax: 0.8, ymax: 0.9 },
        { left: 100, top: 100, width: 400, height: 200 },
        1000,
        800,
      ),
    ).toEqual({ xmin: 0.14, ymin: 0.175, xmax: 0.42, ymax: 0.35 });
  });
  it('clamps padded boxes and supports full-frame fallback', () => {
    expect(
      screenBox(
        { xmin: -0.1, ymin: -0.1, xmax: 1.1, ymax: 1.1 },
        null,
        1000,
        800,
      ),
    ).toEqual({ xmin: 0, ymin: 0, xmax: 1, ymax: 1 });
  });
});
