/**
 * Test data parser for Clipper2 test files
 * 
 * Mirrors the functionality of ClipperFileIO.LoadTestNum() from the C# implementation.
 * Parses test data files that contain multiple test cases with subjects, clips, and expected results.
 * 
 * Format specification matches the original Clipper2 test data structure to ensure
 * exact compatibility with reference implementations.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ClipType, FillRule, Paths64, Path64 } from '../src';

export interface TestCase {
  readonly caption: string;
  readonly clipType: ClipType;
  readonly fillRule: FillRule;
  readonly expectedArea: number;
  readonly expectedCount: number;
  readonly subjects: Paths64;
  readonly subjectsOpen: Paths64;
  readonly clips: Paths64;
}

export class TestDataParser {
  /**
   * Loads a specific test case from a test data file
   * 
   * Maintains exact compatibility with the C# ClipperFileIO.LoadTestNum method.
   * This ensures our TypeScript tests validate against the same reference data
   * used by the official C# implementation.
   */
  public static loadTestCase(filename: string, testNumber: number): TestCase | null {
    try {
      const fullPath = resolve(__dirname, 'test-data', filename);
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      
      return this.parseTestCase(lines, testNumber);
    } catch (error) {
      console.error(`Failed to load test file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Parses test case data from file content lines
   * 
   * The parsing logic mirrors the C# implementation's state machine approach
   * to handle the sequential nature of the test data format.
   */
  private static parseTestCase(lines: string[], targetTestNumber: number): TestCase | null {
    let currentTestNumber = 0;
    let i = 0;
    
    // Find the target test case
    while (i < lines.length) {
      if (lines[i].startsWith('CAPTION:')) {
        currentTestNumber++;
        if (currentTestNumber === targetTestNumber) {
          return this.parseTestCaseContent(lines, i);
        }
      }
      i++;
    }
    
    return null; // Test case not found
  }

  /**
   * Parses the content of a single test case
   * 
   * Implements the exact parsing state machine used in the C# reference implementation
   * to ensure identical interpretation of test data semantics.
   */
  private static parseTestCaseContent(lines: string[], startIndex: number): TestCase | null {
    let caption = '';
    let clipType = ClipType.Intersection;
    let fillRule = FillRule.EvenOdd;
    let expectedArea = 0;
    let expectedCount = 0;
    let subjects: Paths64 = [];
    let subjectsOpen: Paths64 = [];
    let clips: Paths64 = [];
    
    let i = startIndex;
    
    // Parse until next test case or end of file
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Stop at next test case (but not the first CAPTION line)
      if (line.startsWith('CAPTION:') && i > startIndex) {
        break;
      }
      
      if (line.startsWith('CAPTION:')) {
        caption = line.substring(8).trim();
      } else if (line.startsWith('CLIPTYPE:')) {
        clipType = this.parseClipType(line);
      } else if (line.startsWith('FILLRULE:')) {
        fillRule = this.parseFillRule(line);
      } else if (line.startsWith('SOL_AREA:')) {
        expectedArea = parseInt(line.substring(9).trim()) || 0;
      } else if (line.startsWith('SOL_COUNT:')) {
        expectedCount = parseInt(line.substring(10).trim()) || 0;
      } else if (line.startsWith('SUBJECTS_OPEN')) {
        const result = this.parsePaths(lines, i + 1, startIndex);
        subjectsOpen = result.paths;
        i = result.nextIndex - 1; // -1 because loop will increment
      } else if (line.startsWith('SUBJECTS')) {
        const result = this.parsePaths(lines, i + 1, startIndex);
        subjects = result.paths;
        i = result.nextIndex - 1;
      } else if (line.startsWith('CLIPS')) {
        const result = this.parsePaths(lines, i + 1, startIndex);
        clips = result.paths;
        i = result.nextIndex - 1;
      }
      
      i++;
    }
    
    return {
      caption,
      clipType,
      fillRule,
      expectedArea,
      expectedCount,
      subjects,
      subjectsOpen,
      clips
    };
  }

  /**
   * Parses ClipType from string representation
   * 
   * Maintains exact mapping compatibility with C# ClipType enumeration
   */
  public static parseClipType(line: string): ClipType {
    const upperLine = line.toUpperCase();
    if (upperLine.includes('INTERSECTION')) return ClipType.Intersection;
    if (upperLine.includes('UNION')) return ClipType.Union;
    if (upperLine.includes('DIFFERENCE')) return ClipType.Difference;
    if (upperLine.includes('XOR')) return ClipType.Xor;
    return ClipType.NoClip;
  }

  /**
   * Parses FillRule from string representation
   * 
   * Maintains exact mapping compatibility with C# FillRule enumeration
   */
  public static parseFillRule(line: string): FillRule {
    const upperLine = line.toUpperCase();
    if (upperLine.includes('EVENODD')) return FillRule.EvenOdd;
    if (upperLine.includes('NONZERO')) return FillRule.NonZero;
    if (upperLine.includes('POSITIVE')) return FillRule.Positive;
    if (upperLine.includes('NEGATIVE')) return FillRule.Negative;
    return FillRule.EvenOdd;
  }

  /**
   * Parses coordinate paths from consecutive lines
   * 
   * Follows the C# GetPaths() pattern where each line represents a complete path
   * with coordinate pairs. This ensures exact data interpretation compatibility.
   */
  private static parsePaths(lines: string[], startIndex: number, testCaseStart?: number): { paths: Paths64; nextIndex: number } {
    const paths: Paths64 = [];
    let i = startIndex;
    
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Stop at next section or empty line
      if (!line || 
          line.startsWith('CAPTION:') || 
          line.startsWith('CLIPTYPE:') || 
          line.startsWith('FILLRULE:') || 
          line.startsWith('SOL_') ||
          line.startsWith('SUBJECTS') ||
          line.startsWith('CLIPS')) {
        break;
      }
      
      const path = this.parseCoordinateLine(line);
      if (path && path.length > 0) {
        paths.push(path);
      }
      
      i++;
    }
    
    return { paths, nextIndex: i };
  }

  /**
   * Parses a single line of coordinate pairs into a Path64
   * 
   * Implements the same coordinate parsing logic as the C# GetInt() function
   * to ensure numerical precision compatibility across implementations.
   */
  private static parseCoordinateLine(line: string): Path64 | null {
    const path: Path64 = [];
    const coords = line.split(/[,\s]+/).filter(s => s.trim().length > 0);
    
    // Coordinates must come in pairs
    if (coords.length % 2 !== 0) {
      return null;
    }
    
    for (let i = 0; i < coords.length; i += 2) {
      const x = parseInt(coords[i]);
      const y = parseInt(coords[i + 1]);
      
      if (isNaN(x) || isNaN(y)) {
        return null;
      }
      
      path.push({ x, y });
    }
    
    return path.length > 0 ? path : null;
  }

  /**
   * Loads all test cases from a file for batch processing
   * 
   * Enables comprehensive test suite execution patterns similar to the C# 
   * implementation's ability to iterate through all test cases systematically.
   */
  public static loadAllTestCases(filename: string): TestCase[] {
    try {
      const fullPath = resolve(__dirname, 'test-data', filename);
      const content = readFileSync(fullPath, 'utf-8');
      const lines = content.split(/\r?\n/);
      
      const testCases: TestCase[] = [];
      let testNumber = 1;
      
      while (true) {
        const testCase = this.parseTestCase(lines, testNumber);
        if (!testCase) break;
        
        testCases.push(testCase);
        testNumber++;
      }
      
      return testCases;
    } catch (error) {
      console.error(`Failed to load test file ${filename}:`, error);
      return [];
    }
  }
}
