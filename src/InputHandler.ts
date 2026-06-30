import type { Point } from "./types";

export class InputHandler {
  private readonly canvas: HTMLCanvasElement;
  private onPointCallback: ((point: Point) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindEvents();
  }

  onPoint(callback: (point: Point) => void): void {
    this.onPointCallback = callback;
  }

  private bindEvents(): void {
    this.canvas.addEventListener("mousedown", (event) => {
      this.emitPoint(event.clientX, event.clientY);
    });

    this.canvas.addEventListener(
      "touchstart",
      (event) => {
        const touch = event.touches[0];
        if (!touch) {
          return;
        }
        this.emitPoint(touch.clientX, touch.clientY);
      },
      { passive: true }
    );
  }

  private emitPoint(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const point: Point = {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };

    this.onPointCallback?.(point);
  }
}
