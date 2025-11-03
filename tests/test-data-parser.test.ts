// Test Data Parser Validation
import { describe, test, expect } from 'vitest';
import { ClipType, FillRule } from '../src';
import { TestDataParser } from './test-data-parser';

describe('Test Data Parser', () => {
  test('should correctly parse Lines.txt test case 1', () => {
    const testCase = TestDataParser.loadTestCase('Lines.txt', 1);
    
    expect(testCase).not.toBeNull();
    expect(testCase!.caption).toBe('1.');
    expect(testCase!.clipType).toBe(ClipType.Difference);
    expect(testCase!.fillRule).toBe(FillRule.EvenOdd);
    expect(testCase!.expectedArea).toBe(8);
    expect(testCase!.expectedCount).toBe(1);
    
    // Validate subject paths
    expect(testCase!.subjects).toHaveLength(1);
    expect(testCase!.subjects[0]).toEqual([
      { x: 5, y: 4 },
      { x: 8, y: 4 },
      { x: 8, y: 8 },
      { x: 5, y: 8 }
    ]);
    
    // Validate open subject paths
    expect(testCase!.subjectsOpen).toHaveLength(1);
    expect(testCase!.subjectsOpen[0]).toEqual([
      { x: 6, y: 7 },
      { x: 6, y: 5 }
    ]);
    
    // Validate clip paths
    expect(testCase!.clips).toHaveLength(1);
    expect(testCase!.clips[0]).toEqual([
      { x: 7, y: 9 },
      { x: 4, y: 9 },
      { x: 4, y: 6 },
      { x: 7, y: 6 }
    ]);
  });

  test('should correctly parse Polygons.txt test case 1', () => {
    const testCase = TestDataParser.loadTestCase('Polygons.txt', 1);
    
    expect(testCase).not.toBeNull();
    expect(testCase!.caption).toBe('1.');
    expect(testCase!.clipType).toBe(ClipType.Union);
    expect(testCase!.fillRule).toBe(FillRule.NonZero);
    expect(testCase!.expectedArea).toBe(9000);
    expect(testCase!.expectedCount).toBe(1);
    
    // Validate subject path
    expect(testCase!.subjects).toHaveLength(1);
    expect(testCase!.subjects[0]).toEqual([
      { x: 100, y: 10 },
      { x: 150, y: 100 },
      { x: 100, y: 190 },
      { x: 50, y: 100 }
    ]);
    
    // No clips for this test case
    expect(testCase!.clips).toHaveLength(0);
  });

  test('should correctly parse ClipType and FillRule enums', () => {
    expect(TestDataParser['parseClipType']('CLIPTYPE: INTERSECTION')).toBe(ClipType.Intersection);
    expect(TestDataParser['parseClipType']('CLIPTYPE: UNION')).toBe(ClipType.Union);
    expect(TestDataParser['parseClipType']('CLIPTYPE: DIFFERENCE')).toBe(ClipType.Difference);
    expect(TestDataParser['parseClipType']('CLIPTYPE: XOR')).toBe(ClipType.Xor);
    
    expect(TestDataParser['parseFillRule']('FILLRULE: EVENODD')).toBe(FillRule.EvenOdd);
    expect(TestDataParser['parseFillRule']('FILLRULE: NONZERO')).toBe(FillRule.NonZero);
    expect(TestDataParser['parseFillRule']('FILLRULE: POSITIVE')).toBe(FillRule.Positive);
    expect(TestDataParser['parseFillRule']('FILLRULE: NEGATIVE')).toBe(FillRule.Negative);
  });
});
