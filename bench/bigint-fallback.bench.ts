import { bench, describe } from 'vitest';
import { InternalClipper, type Point64 } from '../src';

// Small coordinates: stays in safe-integer fast path (no BigInt)
const smallA: Point64 = { x: 100, y: 200 };
const smallB: Point64 = { x: 300, y: 50 };
const smallC: Point64 = { x: 250, y: 400 };

// Large coordinates: triggers BigInt fallback in cross product and friends
const largeA: Point64 = { x: 100_000_000_000, y: 200_000_000_000 };
const largeB: Point64 = { x: 300_000_000_000, y: 50_000_000_000 };
const largeC: Point64 = { x: 250_000_000_000, y: 400_000_000_000 };

describe('crossProduct', () => {
  bench('small coords (fast path)', () => {
    InternalClipper.crossProduct(smallA, smallB, smallC);
  });

  bench('large coords (BigInt fallback)', () => {
    InternalClipper.crossProduct(largeA, largeB, largeC);
  });
});

describe('crossProductSign', () => {
  bench('small coords (fast path)', () => {
    InternalClipper.crossProductSign(smallA, smallB, smallC);
  });

  bench('large coords (BigInt fallback)', () => {
    InternalClipper.crossProductSign(largeA, largeB, largeC);
  });
});

describe('productsAreEqual', () => {
  bench('small values (fast path)', () => {
    InternalClipper.productsAreEqual(100, 200, 50, 400);
  });

  bench('large values (BigInt fallback)', () => {
    InternalClipper.productsAreEqual(
      100_000_000_000, 200_000_000_000,
      50_000_000_000, 400_000_000_000
    );
  });
});

describe('dotProduct', () => {
  bench('small coords (fast path)', () => {
    InternalClipper.dotProduct(smallA, smallB, smallC);
  });

  bench('large coords (BigInt fallback)', () => {
    InternalClipper.dotProduct(largeA, largeB, largeC);
  });
});

describe('isCollinear', () => {
  const collinearSmall: Point64 = { x: 200, y: 125 };
  const collinearLarge: Point64 = { x: 200_000_000_000, y: 125_000_000_000 };

  bench('small coords (fast path)', () => {
    InternalClipper.isCollinear(smallA, collinearSmall, smallB);
  });

  bench('large coords (BigInt fallback)', () => {
    InternalClipper.isCollinear(largeA, collinearLarge, largeB);
  });
});
