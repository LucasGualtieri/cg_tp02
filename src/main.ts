import {
	clipCohenSutherland,
	clipLiangBarsky,
	drawBezier,
	drawCircleBresenham,
	drawHermite,
	drawLineBresenham,
	drawLineDDA,
	drawPolyline
} from "./Algorithms";

import "./styles.css";
import { CanvasManager } from "./CanvasManager";
import { rotationScaleMatFromUIState, transformVectorIJ } from "./Homogeneous2D";
import { InputHandler } from "./InputHandler";
import { UIManager, isCurveTool, isLineTool, lineAlgorithmFromTool } from "./UIManager";
import type { ClippingAlgorithm, LineAlgorithm, Point, Rect, UIState, VectorIJ } from "./types";
import { vectorIJToPoint } from "./types";

type CurveKind = "bezier" | "hermite";

type Primitive =
	| { type: "point"; point: VectorIJ }
	| { type: "line"; algorithm: LineAlgorithm; start: VectorIJ; end: VectorIJ }
	| { type: "circle"; center: VectorIJ; radius: number }
	// Curvas paramétricas (TP 02). Bézier guarda os pontos de controle; Hermite
	// guarda [P0, alça0, P1, alça1] — as tangentes são as diferenças alça − ponto.
	| { type: "curve"; kind: CurveKind; controlPoints: VectorIJ[] };

const COLORS = {
	point: { r: 255, g: 190, b: 92, a: 255 },
	line: { r: 103, g: 183, b: 255, a: 255 },
	circle: { r: 95, g: 230, b: 146, a: 255 },
	clip: { r: 255, g: 121, b: 121, a: 255 },
	curve: { r: 214, g: 130, b: 255, a: 255 },
	controlPolygon: { r: 110, g: 116, b: 132, a: 255 },
	controlPoint: { r: 255, g: 210, b: 120, a: 255 }
} as const;

// Temporary markers (first click / second click preview).
// Change this color here if you want different highlight colors.
const PREVIEW_MARKER_COLOR = { r: 255, g: 255, b: 255, a: 255 };
const PREVIEW_VISIBLE_MS = 500;

const canvasElement = document.querySelector<HTMLCanvasElement>("#pixel-canvas");
const sidebar = document.querySelector<HTMLElement>("#sidebar");

if (!canvasElement || !sidebar) {
	throw new Error("App root elements not found.");
}

const canvasManager = new CanvasManager(canvasElement);
const inputHandler = new InputHandler(canvasManager.getElement());
const uiManager = new UIManager(sidebar);

let uiState: UIState = uiManager.getState();
let clipRect: Rect | null = null;
const primitives: Primitive[] = [];
const pendingPoints: VectorIJ[] = [];
const previewPoints: VectorIJ[] = [];
// Pontos de controle da curva em construção (acumulados clique a clique).
const curveControlPoints: VectorIJ[] = [];
let previewTimeoutId: number | null = null;
let needsRedraw = true;

uiManager.onStateUpdated((state) => {
	// Trocar de ferramenta descarta qualquer entrada em andamento (curva ou reta).
	if (state.tool !== uiState.tool) {
		curveControlPoints.length = 0;
		pendingPoints.length = 0;
		previewPoints.length = 0;
	}
	uiState = state;
	canvasManager.setPixelSize(uiState.pixelSize);
	canvasManager.setGridEnabled(uiState.showGrid);
	canvasManager.syncViewFromUIState(uiState);
	requestRedraw();
});

uiManager.onClear(() => {
	primitives.length = 0;
	pendingPoints.length = 0;
	previewPoints.length = 0;
	curveControlPoints.length = 0;
	if (previewTimeoutId !== null) {
		window.clearTimeout(previewTimeoutId);
		previewTimeoutId = null;
	}
	clipRect = null;
	requestRedraw();
});

uiManager.onFinishCurve(() => {
	finishCurve();
});

inputHandler.onPoint((point) => {
	// Floor to logical cell so cursor hits match the block grid (Math.round would
	// mis-map e.g. center of first cell when pixelSize > 1).
	const logicalPoint: Point = canvasManager.canvasPixelToLogical(point.x, point.y);
	handleCanvasPoint(logicalPoint);
});

canvasManager.setPixelSize(uiState.pixelSize);
canvasManager.setGridEnabled(uiState.showGrid);
canvasManager.syncViewFromUIState(uiState);

function requestRedraw(): void {
	needsRedraw = true;
}

function handleCanvasPoint(logical: Point): void {

	const point: VectorIJ = { i: logical.x, j: logical.y };
	const tool = uiState.tool;

	if (tool === "point") {
		primitives.push({ type: "point", point });
		requestRedraw();
		return;
	}

	// Curvas paramétricas: cada clique adiciona um ponto de controle.
	if (isCurveTool(tool)) {
		curveControlPoints.push(point);
		// Hermite usa exatamente 4 pontos (P0, alça0, P1, alça1) → finaliza sozinha.
		if (tool === "hermite" && curveControlPoints.length >= 4) {
			finishCurve();
		} else {
			requestRedraw();
		}
		return;
	}

	// While the two-click preview is visible, ignore extra clicks.
	if (pendingPoints.length >= 2) return;

	// First click (start): show one preview marker.
	if (pendingPoints.length === 0) {
		pendingPoints.push(point);
		previewPoints.push(point);
		requestRedraw();
		return;
	}

	// Second click: show both preview markers, finalize primitive, then hide both.
	const first = pendingPoints[0];
	pendingPoints.push(point);
	previewPoints.push(point);

	if (isLineTool(tool)) {
		primitives.push({
			type: "line",
			algorithm: lineAlgorithmFromTool(tool),
			start: first,
			end: point
		});
	} else if (tool === "circle") {
		const radius = Math.hypot(point.i - first.i, point.j - first.j);
		primitives.push({ type: "circle", center: first, radius });
	} else if (tool === "selection") {
		clipRect = normalizeRect(first, point);
	}

	requestRedraw();

	if (previewTimeoutId !== null) {
		window.clearTimeout(previewTimeoutId);
	}
	previewTimeoutId = window.setTimeout(() => {
		pendingPoints.length = 0;
		previewPoints.length = 0;
		previewTimeoutId = null;
		requestRedraw();
	}, PREVIEW_VISIBLE_MS);
}

/**
 * Confirma a curva em construção, transformando o buffer de pontos de controle
 * numa primitiva persistente. Bézier exige ≥ 2 pontos; Hermite exige 4.
 */
function finishCurve(): void {
	const tool = uiState.tool;
	if (!isCurveTool(tool)) return;

	const minPoints = tool === "hermite" ? 4 : 2;
	if (curveControlPoints.length < minPoints) return;

	const controlPoints =
		tool === "hermite" ? curveControlPoints.slice(0, 4) : [...curveControlPoints];

	primitives.push({ type: "curve", kind: tool, controlPoints });
	curveControlPoints.length = 0;
	requestRedraw();
}

function normalizeRect(a: VectorIJ, b: VectorIJ): Rect {
	return {
		xmin: Math.min(a.i, b.i),
		xmax: Math.max(a.i, b.i),
		ymin: Math.min(a.j, b.j),
		ymax: Math.max(a.j, b.j)
	};
}

/** p_screen = R·S·(p + t): translation in model space first, then rotate & scale about the fixed world origin (axis cross). */
function transformPoints(vectors: VectorIJ[]): VectorIJ[] {
	const rs = rotationScaleMatFromUIState(uiState);
	const tx = uiState.translation.x;
	const ty = uiState.translation.y;
	return vectors.map((v) =>
		transformVectorIJ(rs, { i: v.i + tx, j: v.j + ty })
	);
}

function drawTransformedLine(
	start: VectorIJ,
	end: VectorIJ,
	algorithm: LineAlgorithm,
	clippingAlgorithm: ClippingAlgorithm
): void {

	let drawStart = start;
	let drawEnd = end;

	if (clipRect) {
		const clipped =
			clippingAlgorithm === "cohen-sutherland"
				? clipCohenSutherland(vectorIJToPoint(start), vectorIJToPoint(end), clipRect)
				: clipLiangBarsky(vectorIJToPoint(start), vectorIJToPoint(end), clipRect);

		if (!clipped) return;

		drawStart = { i: clipped.start.x, j: clipped.start.y };
		drawEnd = { i: clipped.end.x, j: clipped.end.y };
	}

	const transformed = transformPoints([drawStart, drawEnd]);
	const transformedStart = vectorIJToPoint(transformed[0]);
	const transformedEnd = vectorIJToPoint(transformed[1]);

	if (algorithm === "dda") {
		drawLineDDA(transformedStart, transformedEnd, canvasManager.setPixel.bind(canvasManager), COLORS.line);
		return;
	}

	drawLineBresenham(
		transformedStart,
		transformedEnd,
		canvasManager.setPixel.bind(canvasManager),
		COLORS.line
	);
}

/**
 * Desenha uma curva paramétrica. Os pontos de controle são primeiro transformados
 * pelo mesmo pipeline das demais primitivas (p_screen = R·S·(p + t)); como Bézier e
 * Hermite são afim-invariantes, transformar os pontos de controle e depois avaliar
 * equivale a avaliar e depois transformar. As tangentes de Hermite são obtidas como
 * a diferença alça − ponto APÓS a transformação (a parte de translação se cancela,
 * deixando só a parte linear R·S agindo sobre o vetor, como deve ser).
 */
function drawCurve(kind: CurveKind, controlVecs: VectorIJ[], preview: boolean): void {
	const setPixel = canvasManager.setPixel.bind(canvasManager);
	const tp = transformPoints(controlVecs).map(vectorIJToPoint);

	if (kind === "bezier") {
		if (tp.length >= 2) {
			drawPolyline(tp, setPixel, COLORS.controlPolygon); // polígono de controle
			drawBezier(tp, uiState.curveSegments, setPixel, COLORS.curve);
		}
	} else {
		// Hermite: tp = [P0, alça0, P1, alça1]; desenha as alças de tangente como guia.
		if (tp.length >= 2) drawLineBresenham(tp[0], tp[1], setPixel, COLORS.controlPolygon);
		if (tp.length >= 4) drawLineBresenham(tp[2], tp[3], setPixel, COLORS.controlPolygon);
		if (tp.length >= 4) {
			const t0: Point = { x: tp[1].x - tp[0].x, y: tp[1].y - tp[0].y };
			const t1: Point = { x: tp[3].x - tp[2].x, y: tp[3].y - tp[2].y };
			drawHermite(tp[0], t0, tp[2], t1, uiState.curveSegments, setPixel, COLORS.curve);
		}
	}

	// Marcadores nos pontos de controle (brancos enquanto em construção).
	const markerColor = preview ? PREVIEW_MARKER_COLOR : COLORS.controlPoint;
	for (const p of tp) {
		setPixel(p.x, p.y, markerColor);
	}
}

function redrawScene(): void {

	canvasManager.syncViewFromUIState(uiState);
	canvasManager.clear();

	for (const primitive of primitives) {

		if (primitive.type === "point") {
			const [point] = transformPoints([primitive.point]);
			canvasManager.setPixel(point.i, point.j, COLORS.point);
			continue;
		}

		if (primitive.type === "line") {

			drawTransformedLine(
				primitive.start,
				primitive.end,
				primitive.algorithm,
				uiState.clippingAlgorithm
			);

			continue;
		}

		if (primitive.type === "curve") {
			drawCurve(primitive.kind, primitive.controlPoints, false);
			continue;
		}

		const [center] = transformPoints([primitive.center]);
		const averageScale = (Math.abs(uiState.scale.x) + Math.abs(uiState.scale.y)) / 2;

		drawCircleBresenham(
			vectorIJToPoint(center),
			primitive.radius * averageScale,
			canvasManager.setPixel.bind(canvasManager),
			COLORS.circle
		);
	}

	if (clipRect) {

		const clipCorners = transformPoints([
			{ i: clipRect.xmin, j: clipRect.ymin },
			{ i: clipRect.xmax, j: clipRect.ymin },
			{ i: clipRect.xmax, j: clipRect.ymax },
			{ i: clipRect.xmin, j: clipRect.ymax }
		]);
		const toP = vectorIJToPoint;

		drawLineBresenham(
			toP(clipCorners[0]),
			toP(clipCorners[1]),
			canvasManager.setPixel.bind(canvasManager),
			COLORS.clip
		);

		drawLineBresenham(
			toP(clipCorners[1]),
			toP(clipCorners[2]),
			canvasManager.setPixel.bind(canvasManager),
			COLORS.clip
		);

		drawLineBresenham(
			toP(clipCorners[2]),
			toP(clipCorners[3]),
			canvasManager.setPixel.bind(canvasManager),
			COLORS.clip
		);

		drawLineBresenham(
			toP(clipCorners[3]),
			toP(clipCorners[0]),
			canvasManager.setPixel.bind(canvasManager),
			COLORS.clip
		);
	}

	// Curva em construção (pontos de controle ainda não finalizados).
	if (curveControlPoints.length > 0 && isCurveTool(uiState.tool)) {
		drawCurve(uiState.tool, curveControlPoints, true);
	}

	for (const p of transformPoints(previewPoints)) {
		canvasManager.setPixel(p.i, p.j, PREVIEW_MARKER_COLOR);
	}
}

function renderLoop(): void {

	if (needsRedraw) {
		redrawScene();
		canvasManager.present();
		needsRedraw = false;
	}

	requestAnimationFrame(renderLoop);
}

renderLoop();