import type { Axis, Color, Point, Rect } from "./types";

type PixelWriter = (x: number, y: number, color: Color) => void;

const TOP = 0b1000;
const BOTTOM = 0b0100;
const RIGHT = 0b0010;
const LEFT = 0b0001;
const INSIDE = 0b0000;

function computeOutCode(point: Point, rect: Rect): number {
	let code = INSIDE;
	if (point.x < rect.xmin) code |= LEFT;
	else if (point.x > rect.xmax) code |= RIGHT;
	if (point.y < rect.ymin) code |= TOP;
	else if (point.y > rect.ymax) code |= BOTTOM;
	return code;
}

export function drawLineDDA(start: Point, end: Point, setPixel: PixelWriter, color: Color): void {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const steps = Math.max(Math.abs(dx), Math.abs(dy));
	if (steps === 0) {
		setPixel(start.x, start.y, color);
		return;
	}

	const xIncrement = dx / steps;
	const yIncrement = dy / steps;
	let x = start.x;
	let y = start.y;

	for (let i = 0; i <= steps; i++) {
		setPixel(x, y, color);
		x += xIncrement;
		y += yIncrement;
	}
}

export function drawLineBresenham(start: Point, end: Point, setPixel: PixelWriter, color: Color): void {
	let x0 = Math.round(start.x);
	let y0 = Math.round(start.y);
	const x1 = Math.round(end.x);
	const y1 = Math.round(end.y);

	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;

	let D = dx - dy;

	while (true) {
		setPixel(x0, y0, color);

		if (x0 === x1 && y0 === y1) break;

		const doubleError = 2 * D;

		if (doubleError > -dy) {
			D -= dy;
			x0 += sx;
		}

		if (doubleError < dx) {
			D += dx;
			y0 += sy;
		}
	}
}

export function drawCircleBresenham(center: Point, radius: number, setPixel: PixelWriter, color: Color): void {
	const xc = Math.round(center.x);
	const yc = Math.round(center.y);

	let x = 0;
	let y = Math.max(0, Math.round(radius));
	let decision = 3 - 2 * y;

	while (x <= y) {
		setPixel(xc + x, yc + y, color);
		setPixel(xc - x, yc + y, color);
		setPixel(xc + x, yc - y, color);
		setPixel(xc - x, yc - y, color);
		setPixel(xc + y, yc + x, color);
		setPixel(xc - y, yc + x, color);
		setPixel(xc + y, yc - x, color);
		setPixel(xc - y, yc - x, color);

		x++;

		if (decision > 0) {
			y -= 1;
			decision += 4 * (x - y) + 10;
		} else {
			decision += 4 * x + 6;
		}
	}
}

export function clipCohenSutherland(start: Point, end: Point, rect: Rect): { start: Point; end: Point } | null {
	let p0: Point = { ...start };
	let p1: Point = { ...end };
	let outCode0 = computeOutCode(p0, rect);
	let outCode1 = computeOutCode(p1, rect);

	while (true) {
		if ((outCode0 | outCode1) === 0) {
			return {
				start: p0,
				end: p1
			};
		}

		if ((outCode0 & outCode1) !== 0) {
			return null;
		}

		const outCodeOut = outCode0 !== 0 ? outCode0 : outCode1;

		let x = 0;
		let y = 0;

		if ((outCodeOut & TOP) !== 0) {
			x = p0.x + ((p1.x - p0.x) * (rect.ymin - p0.y)) / (p1.y - p0.y);
			y = rect.ymin;
		} else if ((outCodeOut & BOTTOM) !== 0) {
			x = p0.x + ((p1.x - p0.x) * (rect.ymax - p0.y)) / (p1.y - p0.y);
			y = rect.ymax;
		} else if ((outCodeOut & RIGHT) !== 0) {
			y = p0.y + ((p1.y - p0.y) * (rect.xmax - p0.x)) / (p1.x - p0.x);
			x = rect.xmax;
		} else if ((outCodeOut & LEFT) !== 0) {
			y = p0.y + ((p1.y - p0.y) * (rect.xmin - p0.x)) / (p1.x - p0.x);
			x = rect.xmin;
		}

		if (outCodeOut === outCode0) {
			p0 = { x, y };
			outCode0 = computeOutCode(p0, rect);
		} else {
			p1 = { x, y };
			outCode1 = computeOutCode(p1, rect);
		}
	}
}

export function clipLiangBarsky(start: Point, end: Point, rect: Rect): { start: Point; end: Point } | null {
	const dx = end.x - start.x;
	const dy = end.y - start.y;

	const p = [-dx, dx, -dy, dy];
	const q = [start.x - rect.xmin, rect.xmax - start.x, start.y - rect.ymin, rect.ymax - start.y];

	let u1 = 0;
	let u2 = 1;

	for (let i = 0; i < p.length; i++) {
		const pi = p[i];
		const qi = q[i];

		if (pi === 0 && qi < 0) return null;
		if (pi === 0) continue;

		const t = qi / pi;

		if (pi < 0) {
			u1 = Math.max(u1, t);
		} else {
			u2 = Math.min(u2, t);
		}
	}

	if (u1 > u2) return null;

	return {
		start: { x: start.x + u1 * dx, y: start.y + u1 * dy },
		end: { x: start.x + u2 * dx, y: start.y + u2 * dy }
	};
}

// ===========================================================================
// Curvas paramétricas (TP 02)
// ---------------------------------------------------------------------------
// Duas curvas vistas em sala: Bézier (avaliada pelo algoritmo de De Casteljau)
// e Hermite cúbica. Ambas reaproveitam a rasterização do TP 01: a curva é
// amostrada em N+1 pontos para t ∈ [0, 1] e os pontos consecutivos são ligados
// por segmentos de reta (drawLineBresenham), produzindo um traçado contínuo.
//
// Referências:
//  - P. de Casteljau (1959/1963), Citroën — algoritmo de subdivisão de Bézier.
//  - Foley, van Dam, Feiner, Hughes, "Computer Graphics: Principles and
//    Practice" — bases de Bézier (Bernstein) e de Hermite.
//  - Notas de aula da disciplina (módulo "Curvas Paramétricas").
// ===========================================================================

/** Interpolação linear entre dois pontos: (1 - t)·a + t·b, com t ∈ [0, 1]. */
function lerp(a: Point, b: Point, t: number): Point {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t
	};
}

/**
 * Avalia uma curva de Bézier de grau n (n + 1 pontos de controle) num parâmetro
 * t pelo algoritmo de De Casteljau: a cada passo, substitui a lista de pontos
 * pela interpolação linear de pares consecutivos, reduzindo o seu tamanho em 1.
 * Após n passos resta um único ponto — o ponto da curva em t.
 *
 * Esquema (n = 3):
 *   P0 P1 P2 P3
 *     Q0 Q1 Q2        Qk = lerp(Pk, Pk+1, t)
 *       R0 R1         Rk = lerp(Qk, Qk+1, t)
 *         S0          S0 = lerp(R0, R1, t)  → ponto da curva
 *
 * O algoritmo é numericamente estável e geometricamente intuitivo (sucessivas
 * interpolações ao longo do polígono de controle).
 */
export function deCasteljau(controlPoints: Point[], t: number): Point {
	// Cópia mutável: a redução acontece in-place a cada nível.
	const points = controlPoints.map((p) => ({ x: p.x, y: p.y }));

	for (let level = points.length - 1; level > 0; level--) {
		for (let i = 0; i < level; i++) {
			points[i] = lerp(points[i], points[i + 1], t);
		}
	}

	return points[0];
}

/**
 * Amostra uma curva de Bézier em `segments` subdivisões uniformes de t ∈ [0, 1],
 * retornando segments + 1 pontos (a polilinha que aproxima a curva). Quanto maior
 * `segments`, mais fina é a aproximação (refinamento).
 */
export function sampleBezier(controlPoints: Point[], segments: number): Point[] {
	const steps = Math.max(1, Math.floor(segments));
	const samples: Point[] = [];

	for (let k = 0; k <= steps; k++) {
		const t = k / steps;
		samples.push(deCasteljau(controlPoints, t));
	}

	return samples;
}

/**
 * Avalia uma curva de Hermite cúbica em t ∈ [0, 1] a partir de dois pontos de
 * apoio (p0, p1) e duas tangentes (t0, t1), usando os polinômios de base de Hermite:
 *
 *   H00(t) =  2t³ − 3t² + 1   (peso de p0)
 *   H10(t) =   t³ − 2t² + t   (peso de t0)
 *   H01(t) = −2t³ + 3t²       (peso de p1)
 *   H11(t) =   t³ −  t²       (peso de t1)
 *
 *   P(t) = H00·p0 + H10·t0 + H01·p1 + H11·t1
 *
 * Garante P(0) = p0, P(1) = p1, P'(0) = t0 e P'(1) = t1 (interpolação com
 * controle de tangente nos extremos).
 */
export function evalHermite(p0: Point, t0: Point, p1: Point, t1: Point, t: number): Point {
	const t2 = t * t;
	const t3 = t2 * t;

	const h00 = 2 * t3 - 3 * t2 + 1;
	const h10 = t3 - 2 * t2 + t;
	const h01 = -2 * t3 + 3 * t2;
	const h11 = t3 - t2;

	return {
		x: h00 * p0.x + h10 * t0.x + h01 * p1.x + h11 * t1.x,
		y: h00 * p0.y + h10 * t0.y + h01 * p1.y + h11 * t1.y
	};
}

/** Amostra uma curva de Hermite em `segments` subdivisões uniformes de t ∈ [0, 1]. */
export function sampleHermite(p0: Point, t0: Point, p1: Point, t1: Point, segments: number): Point[] {
	const steps = Math.max(1, Math.floor(segments));
	const samples: Point[] = [];

	for (let k = 0; k <= steps; k++) {
		const t = k / steps;
		samples.push(evalHermite(p0, t0, p1, t1, t));
	}

	return samples;
}

/**
 * Rasteriza uma polilinha (lista de pontos consecutivos) ligando pares com
 * Bresenham. Usada para desenhar tanto a curva amostrada quanto os polígonos de
 * controle das curvas.
 */
export function drawPolyline(points: Point[], setPixel: PixelWriter, color: Color): void {
	if (points.length === 1) {
		setPixel(points[0].x, points[0].y, color);
		return;
	}

	for (let i = 0; i < points.length - 1; i++) {
		drawLineBresenham(points[i], points[i + 1], setPixel, color);
	}
}

/** Desenha uma curva de Bézier (≥ 2 pontos de controle) ligando as amostras com Bresenham. */
export function drawBezier(controlPoints: Point[], segments: number, setPixel: PixelWriter, color: Color): void {
	if (controlPoints.length < 2) {
		if (controlPoints.length === 1) setPixel(controlPoints[0].x, controlPoints[0].y, color);
		return;
	}

	drawPolyline(sampleBezier(controlPoints, segments), setPixel, color);
}

/** Desenha uma curva de Hermite cúbica ligando as amostras com Bresenham. */
export function drawHermite(p0: Point, t0: Point, p1: Point, t1: Point, segments: number, setPixel: PixelWriter, color: Color): void {
	drawPolyline(sampleHermite(p0, t0, p1, t1, segments), setPixel, color);
}

export function translate(points: Point[], dx: number, dy: number): Point[] {
	return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

export function rotate(points: Point[], angleDegrees: number, pivot: Point = { x: 0, y: 0 }): Point[] {
	const angle = (angleDegrees * Math.PI) / 180;
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);

	return points.map((point) => {
		const translatedX = point.x - pivot.x;
		const translatedY = point.y - pivot.y;
		return {
			x: translatedX * cos - translatedY * sin + pivot.x,
			y: translatedX * sin + translatedY * cos + pivot.y
		};
	});
}

export function scale(points: Point[], sx: number, sy: number, pivot: Point = { x: 0, y: 0 }): Point[] {
	return points.map((point) => ({
		x: pivot.x + (point.x - pivot.x) * sx,
		y: pivot.y + (point.y - pivot.y) * sy
	}));
}

export function reflect(points: Point[], axis: Axis, pivot: Point = { x: 0, y: 0 }): Point[] {
	return points.map((point) => {
		if (axis === "x") {
			return { x: point.x, y: pivot.y - (point.y - pivot.y) };
		}

		if (axis === "y") {
			return { x: pivot.x - (point.x - pivot.x), y: point.y };
		}

		return {
			x: pivot.x - (point.x - pivot.x),
			y: pivot.y - (point.y - pivot.y)
		};
	});
}
