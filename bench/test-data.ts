import type { Path64, Paths64 } from '../src';
import { Clipper } from '../src';

export function generateCircle(
  radius: number,
  centerX: number,
  centerY: number,
  numPoints: number
): Path64 {
  const path: Path64 = [];
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    path.push({
      x: Math.round(centerX + radius * Math.cos(angle)),
      y: Math.round(centerY + radius * Math.sin(angle))
    });
  }
  return path;
}

export function generateRectangle(
  left: number,
  top: number,
  right: number,
  bottom: number
): Path64 {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom }
  ];
}

export function generateComplexPolygon(numVertices: number): Path64 {
  const path: Path64 = [];
  const centerX = 1000;
  const centerY = 1000;
  const baseRadius = 500;

  for (let i = 0; i < numVertices; i++) {
    const angle = (2 * Math.PI * i) / numVertices;
    const radiusVariation = Math.sin(angle * 5) * 100;
    const radius = baseRadius + radiusVariation;
    path.push({
      x: Math.round(centerX + radius * Math.cos(angle)),
      y: Math.round(centerY + radius * Math.sin(angle))
    });
  }
  return path;
}

export function generateGrid(
  rows: number,
  cols: number,
  cellSize: number,
  gap: number
): Paths64 {
  const paths: Paths64 = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (cellSize + gap);
      const y = row * (cellSize + gap);
      paths.push(generateRectangle(x, y, x + cellSize, y + cellSize));
    }
  }
  return paths;
}

export const testData = {
  smallCircle: generateCircle(50, 100, 100, 20),
  smallRect: generateRectangle(0, 0, 100, 100),

  mediumCircle: generateCircle(200, 500, 500, 100),
  mediumComplex: generateComplexPolygon(100),
  mediumRect: generateRectangle(0, 0, 500, 500),

  largeCircle: generateCircle(500, 1000, 1000, 500),
  largeComplex: generateComplexPolygon(500),
  largeRect: generateRectangle(0, 0, 2000, 2000),

  veryLargeComplex: generateComplexPolygon(2000),

  smallGrid: generateGrid(3, 3, 50, 10),
  mediumGrid: generateGrid(5, 5, 100, 20),
  largeGrid: generateGrid(10, 10, 50, 10)
};

export const overlappingPairs = {
  small: {
    subject: [testData.smallCircle],
    clip: [Clipper.translatePath(testData.smallCircle, 50, 50)]
  },
  medium: {
    subject: [testData.mediumComplex],
    clip: [Clipper.translatePath(testData.mediumComplex, 200, 200)]
  },
  large: {
    subject: [testData.largeComplex],
    clip: [Clipper.translatePath(testData.largeComplex, 400, 400)]
  },
  grid: {
    subject: testData.mediumGrid,
    clip: [Clipper.translatePath(testData.mediumRect, 150, 150)]
  }
};
