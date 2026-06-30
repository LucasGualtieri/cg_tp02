export type Axis = "x" | "y" | "xy";
export type ClippingAlgorithm = "cohen-sutherland" | "liang-barsky";
export type LineAlgorithm = "dda" | "bresenham";
export type Tool = "point" | "line-dda" | "line-bresenham" | "circle" | "selection" | "bezier" | "hermite";

export interface Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a?: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Position in the logical grid as v = i·î + j·ĵ with orthonormal basis {î, ĵ}
 * (î along +x, ĵ along +y in screen logical space).
 */
export interface VectorIJ {
  readonly i: number;
  readonly j: number;
}

export function pointToVectorIJ(p: Point): VectorIJ {
  return { i: p.x, j: p.y };
}

export function vectorIJToPoint(v: VectorIJ): Point {
  return { x: v.i, y: v.j };
}

export interface Rect {
  readonly xmin: number;
  readonly ymin: number;
  readonly xmax: number;
  readonly ymax: number;
}

export interface UIState {
  tool: Tool;
  clippingAlgorithm: ClippingAlgorithm;
  translation: Point;
  rotationDegrees: number;
  scale: Point;
  pixelSize: number;
  showGrid: boolean;
  /** Número de subdivisões em t ∈ [0, 1] usado para amostrar curvas paramétricas. */
  curveSegments: number;
}
