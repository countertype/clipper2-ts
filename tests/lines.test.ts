// Line/Open Path Clipping Tests
import { describe, test, expect } from 'vitest';
import { Clipper64, ClipType, FillRule, Paths64, Clipper } from '../src';
import { TestDataParser } from './test-data-parser';

describe('Open Path/Line Clipping Tests', () => {
  // Load all test cases once
  const allLineTestCases = TestDataParser.loadAllTestCases('Lines.txt');

  // Create individual test for each of the 16 line test cases (matches C# TestLines.cs)
  test.each(allLineTestCases.map((tc, idx) => ({ testNum: idx + 1, testCase: tc })))(
    'Line Test $testNum: $testCase.clipType/$testCase.fillRule',
    ({ testNum, testCase }) => {
      const clipper = new Clipper64();
      clipper.addSubject(testCase.subjects);
      clipper.addOpenSubject(testCase.subjectsOpen);
      clipper.addClip(testCase.clips);
      
      const solution: Paths64 = [];
      const solutionOpen: Paths64 = [];
      
      const success = clipper.execute(
        testCase.clipType, 
        testCase.fillRule, 
        solution, 
        solutionOpen
      );
      
      expect(success).toBe(true);
      
      // Area validation (C# tolerance: 0.5%)
      if (testCase.expectedArea > 0) {
        const area2 = Clipper.areaPaths(solution);
        const a = testCase.expectedArea / area2;
        
        expect(a).toBeGreaterThan(0.995);
        expect(a).toBeLessThan(1.005);
      }
      
      // Count validation (C# allows ±2 difference)
      if (testCase.expectedCount > 0 && Math.abs(solution.length - testCase.expectedCount) > 0) {
        const countDiff = Math.abs(solution.length - testCase.expectedCount);
        expect(countDiff).toBeLessThan(2);
      }
    }
  );

  // Specific validation for test case 1
  test('should correctly handle test case 1 with specific geometric validation', () => {
    const testCase = TestDataParser.loadTestCase('Lines.txt', 1);
    
    expect(testCase).not.toBeNull();
    expect(testCase!.clipType).toBe(ClipType.Difference);
    expect(testCase!.fillRule).toBe(FillRule.EvenOdd);
    expect(testCase!.expectedArea).toBe(8);
    expect(testCase!.expectedCount).toBe(1);
    
    const clipper = new Clipper64();
    clipper.addSubject(testCase!.subjects);
    clipper.addOpenSubject(testCase!.subjectsOpen);
    clipper.addClip(testCase!.clips);
    
    const solution: Paths64 = [];
    const solutionOpen: Paths64 = [];
    
    const success = clipper.execute(
      testCase!.clipType,
      testCase!.fillRule,
      solution,
      solutionOpen
    );
    
    expect(success).toBe(true);
    expect(solution.length).toBe(1);
    expect(solutionOpen.length).toBe(1);
    
    // Validate geometric properties specific to this test case
    if (solution.length > 0) {
      expect(solution[0].length).toBe(6);
      expect(Clipper.isPositive(solution[0])).toBe(true);
    }
    
    if (solutionOpen.length > 0) {
      expect(solutionOpen[0].length).toBe(2);
      // Validate that the vertex closest to input path's start has Y coordinate 6
      expect(solutionOpen[0][0].y).toBe(6);
    }
  });
});
