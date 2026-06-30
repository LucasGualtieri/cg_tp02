import { invertAffineMat3, rotationScaleMatFromUIState, transformVectorIJ, type Mat3 } from "./Homogeneous2D";
import type { Color, UIState } from "./types";

const BYTES_PER_PIXEL = 4;

export class CanvasManager {

	readonly width: number;
	readonly height: number;

	private readonly canvas: HTMLCanvasElement;
	private readonly context: CanvasRenderingContext2D;
	private readonly imageData: ImageData;
	private readonly pixelBuffer: Uint8ClampedArray;
	private pixelSize = 1;
	private showGrid = false;
	private dirty = true;
	/** UI translation (model space) subtracted after inv(R·S) when picking — pairs with p_screen = R·S·(p + t). */
	private modelTranslationX = 0;
	private modelTranslationY = 0;
	/** Inverse of R·S only (screen logical ↔ model + translation). */
	private viewInverse: Mat3 = [
		1, 0, 0,
		0, 1, 0,
		0, 0, 1
	];

	constructor(canvas: HTMLCanvasElement) {

		const context = canvas.getContext("2d", { alpha: false });

		if (!context) {
			throw new Error("Unable to initialize 2D canvas context.");
		}

		this.canvas = canvas;
		this.context = context;
		this.width = canvas.width;
		this.height = canvas.height;
		this.imageData = context.createImageData(this.width, this.height);
		this.pixelBuffer = this.imageData.data;

		this.clear();
	}

	getElement(): HTMLCanvasElement {
		return this.canvas;
	}

	setPixelSize(size: number): void {
		this.pixelSize = Math.max(1, Math.floor(size));
		this.dirty = true;
	}

	canvasPixelToLogical(canvasX: number, canvasY: number): { x: number; y: number } {
		const ps = this.pixelSize;
		const sx = Math.floor((canvasX - this.originCanvasX) / ps);
		const sy = Math.floor((canvasY - this.originCanvasY) / ps);
		const afterInvRs = transformVectorIJ(this.viewInverse, { i: sx, j: sy });
		return {
			x: afterInvRs.i - this.modelTranslationX,
			y: afterInvRs.j - this.modelTranslationY
		};
	}

	setGridEnabled(enabled: boolean): void {
		this.showGrid = enabled;
		this.dirty = true;
	}

	/** Picking uses inv(R·S) then subtract model translation — same as draw: p_screen = R·S·(p + t). */
	syncViewFromUIState(ui: UIState): void {
		const rs = rotationScaleMatFromUIState(ui);
		this.viewInverse = invertAffineMat3(rs);
		this.modelTranslationX = ui.translation.x;
		this.modelTranslationY = ui.translation.y;
		this.dirty = true;
	}

	clear(color: Color = { r: 20, g: 20, b: 24, a: 255 }): void {

		const alpha = color.a ?? 255;

		for (let index = 0; index < this.pixelBuffer.length; index += BYTES_PER_PIXEL) {
			this.pixelBuffer[index] = color.r;
			this.pixelBuffer[index + 1] = color.g;
			this.pixelBuffer[index + 2] = color.b;
			this.pixelBuffer[index + 3] = alpha;
		}

		if (this.showGrid) {
			this.drawGridOverlay();
		}

		this.dirty = true;
	}

	setPixel(x: number, y: number, color: Color): void {

		const xi = Math.round(x);
		const yi = Math.round(y);
		const baseX = this.originCanvasX + xi * this.pixelSize;
		const baseY = this.originCanvasY + yi * this.pixelSize;
		const alpha = color.a ?? 255;

		// Ignore blocks that are fully outside the canvas.
		if (
			baseX + this.pixelSize <= 0 ||
			baseY + this.pixelSize <= 0 ||
			baseX >= this.width ||
			baseY >= this.height
		) {
			return;
		}

		for (let oy = 0; oy < this.pixelSize; oy++) {
			for (let ox = 0; ox < this.pixelSize; ox++) {

				const px = baseX + ox;
				const py = baseY + oy;

				if (px >= this.width || py >= this.height) continue;

				const idx = (py * this.width + px) * BYTES_PER_PIXEL;
				this.pixelBuffer[idx] = color.r;
				this.pixelBuffer[idx + 1] = color.g;
				this.pixelBuffer[idx + 2] = color.b;
				this.pixelBuffer[idx + 3] = alpha;
			}
		}

		this.dirty = true;
	}

	present(): void {

		if (!this.dirty) return;

		this.context.putImageData(this.imageData, 0, 0);
		this.dirty = false;
	}

	private get logicalWidth(): number {
		return Math.floor(this.width / this.pixelSize);
	}

	private get logicalHeight(): number {
		return Math.floor(this.height / this.pixelSize);
	}

	private drawGridOverlay(): void {

		const grid = { r: 45, g: 49, b: 59, a: 255 };
		const xAxisColor = { r: 90, g: 170, b: 255, a: 255 };
		const yAxisColor = { r: 255, g: 140, b: 90, a: 255 };
		const originColor = { r: 255, g: 70, b: 70, a: 255 };
		const gridLineThickness = Math.max(1, Math.floor(this.pixelSize / 6));

		const writeCanvasPixel = (canvasX: number, canvasY: number, color: Color): void => {
			if (canvasX < 0 || canvasY < 0 || canvasX >= this.width || canvasY >= this.height) return;
			const idx = (canvasY * this.width + canvasX) * BYTES_PER_PIXEL;
			this.pixelBuffer[idx] = color.r;
			this.pixelBuffer[idx + 1] = color.g;
			this.pixelBuffer[idx + 2] = color.b;
			this.pixelBuffer[idx + 3] = color.a ?? 255;
		};

		const axisCanvasX = this.originCanvasX;
		const axisCanvasY = this.originCanvasY;

		// Subtle grid between enlarged pixels (avoid "full grid" when pixelSize === 1).
		if (this.pixelSize > 1) {
			for (let x = axisCanvasX + this.pixelSize; x < this.width; x += this.pixelSize) {
				for (let t = 0; t < gridLineThickness; t += 1) {
					const xx = x + t;
					for (let y = 0; y < this.height; y++) {
						writeCanvasPixel(xx, y, grid);
					}
				}
			}
			for (let x = axisCanvasX - this.pixelSize; x >= 0; x -= this.pixelSize) {
				for (let t = 0; t < gridLineThickness; t += 1) {
					const xx = x + t;
					for (let y = 0; y < this.height; y++) {
						writeCanvasPixel(xx, y, grid);
					}
				}
			}

			for (let y = axisCanvasY + this.pixelSize; y < this.height; y += this.pixelSize) {
				for (let t = 0; t < gridLineThickness; t += 1) {
					const yy = y + t;
					for (let x = 0; x < this.width; x++) {
						writeCanvasPixel(x, yy, grid);
					}
				}
			}
			for (let y = axisCanvasY - this.pixelSize; y >= 0; y -= this.pixelSize) {
				for (let t = 0; t < gridLineThickness; t += 1) {
					const yy = y + t;
					for (let x = 0; x < this.width; x++) {
						writeCanvasPixel(x, yy, grid);
					}
				}
			}
		}

		// Strong axes + red dot at the screen origin (logical 0,0 at canvas centre).

		// Y axis (vertical) through transformed origin (same thickness as grid lines).
		for (let t = 0; t < gridLineThickness; t += 1) {
			const xx = axisCanvasX + t;
			for (let y = 0; y < this.height; y++) {
				writeCanvasPixel(xx, y, yAxisColor);
			}
		}

		// X axis (horizontal) through transformed origin (same thickness as grid lines).
		for (let t = 0; t < gridLineThickness; t += 1) {
			const yy = axisCanvasY + t;
			for (let x = 0; x < this.width; x++) {
				writeCanvasPixel(x, yy, xAxisColor);
			}
		}

		// Origin dot on top of both axes (proportional to grid line thickness).
		const dotHalf = Math.max(0, Math.floor(gridLineThickness / 2));
		for (let dotOy = -dotHalf; dotOy <= dotHalf; dotOy += 1) {
			for (let dotOx = -dotHalf; dotOx <= dotHalf; dotOx += 1) {
				writeCanvasPixel(axisCanvasX + dotOx, axisCanvasY + dotOy, originColor);
			}
		}
	}

	private get originCanvasX(): number {
		return Math.floor(this.width / 2);
	}

	private get originCanvasY(): number {
		return Math.floor(this.height / 2);
	}
}