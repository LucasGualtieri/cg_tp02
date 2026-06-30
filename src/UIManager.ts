import type { ClippingAlgorithm, LineAlgorithm, Tool, UIState } from "./types";

type UIStateListener = (state: UIState) => void;
type SimpleListener = () => void;

export class UIManager {
  private readonly root: HTMLElement;
  private readonly state: UIState = {
    tool: "point",
    clippingAlgorithm: "cohen-sutherland",
    translation: { x: 0, y: 0 },
    rotationDegrees: 0,
    scale: { x: 1, y: 1 },
    pixelSize: 1,
    showGrid: false,
    curveSegments: 40
  };

  private onStateChange: UIStateListener | null = null;
  private onClearClick: SimpleListener | null = null;
  private onFinishCurveClick: SimpleListener | null = null;
  /** When true, sx and sy stay equal (uniform scale / zoom). */
  private scaleLocked = false;

  constructor(root: HTMLElement) {
    this.root = root;
    this.render();
    this.bindEvents();
  }

  getState(): UIState {
    return {
      ...this.state,
      translation: { ...this.state.translation },
      scale: { ...this.state.scale }
    };
  }

  onStateUpdated(listener: UIStateListener): void {
    this.onStateChange = listener;
  }

  onClear(listener: SimpleListener): void {
    this.onClearClick = listener;
  }

  onFinishCurve(listener: SimpleListener): void {
    this.onFinishCurveClick = listener;
  }

  private render(): void {
    this.root.innerHTML = `
      <h1>Trabalho prático — Computação Gráfica</h1>

      <section class="panel">
        <h2>Tool Selector</h2>
        <div class="tool-grid">
          <button data-tool="point" class="tool active">Point</button>
          <button data-tool="line-dda" class="tool">Line DDA</button>
          <button data-tool="line-bresenham" class="tool">Line Bresenham</button>
          <button data-tool="circle" class="tool">Circle</button>
          <button data-tool="selection" class="tool">Selection</button>
          <button data-tool="bezier" class="tool">Bézier</button>
          <button data-tool="hermite" class="tool">Hermite</button>
        </div>
      </section>

      <section class="panel">
        <h2>Curvas Paramétricas</h2>
        <p class="hint">
          <strong>Bézier</strong>: clique para adicionar pontos de controle e use
          "Finalizar curva".<br />
          <strong>Hermite</strong>: 4 cliques — ponto, alça (tangente), ponto, alça.
        </p>
        <label>segments (resolução): <span id="segments-value">40</span></label>
        <input id="segments-slider" type="range" min="2" max="200" value="40" />
        <button id="finish-curve-btn" class="toggle">Finalizar curva</button>
      </section>

      <section class="panel">
        <h2>Transformations</h2>
        <label>dx: <span id="dx-value">0</span></label>
        <input id="dx-slider" type="range" min="-200" max="200" value="0" />
        <label>dy: <span id="dy-value">0</span></label>
        <input id="dy-slider" type="range" min="-200" max="200" value="0" />
        <label>angle: <span id="angle-value">0</span></label>
        <input id="angle-slider" type="range" min="-180" max="180" value="0" />
        <button id="scale-lock-toggle" type="button" class="toggle" title="Mantém sx e sy iguais (zoom uniforme)">
          Escala uniforme: Desligado
        </button>
        <label>sx: <span id="sx-value">1.00</span></label>
        <input id="sx-slider" type="range" min="25" max="300" value="100" />
        <label>sy: <span id="sy-value">1.00</span></label>
        <input id="sy-slider" type="range" min="25" max="300" value="100" />
      </section>

      <section class="panel">
        <h2>Clipping</h2>
        <div class="tool-grid">
          <button data-clipping="cohen-sutherland" class="clip active">Cohen-Sutherland</button>
          <button data-clipping="liang-barsky" class="clip">Liang-Barsky</button>
        </div>
      </section>

      <section class="panel">
        <h2>Display</h2>
        <label>pixel size: <span id="pixel-size-value">1</span></label>
        <input id="pixel-size-slider" type="range" min="1" max="14" value="1" />
        <button id="grid-toggle" class="toggle">Grid: Off</button>
      </section>

      <section class="panel">
        <button id="clear-btn" class="danger">Clear Matrix</button>
      </section>
    `;
  }

  private bindEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        this.state.tool = button.dataset.tool as Tool;
        this.setActiveTool(this.state.tool);
        this.emitState();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>("[data-clipping]").forEach((button) => {
      button.addEventListener("click", () => {
        this.state.clippingAlgorithm = button.dataset.clipping as ClippingAlgorithm;
        this.setActiveClipping(this.state.clippingAlgorithm);
        this.emitState();
      });
    });

    this.bindRange("dx-slider", "dx-value", (value) => {
      this.state.translation = { ...this.state.translation, x: value };
    });
    this.bindRange("dy-slider", "dy-value", (value) => {
      this.state.translation = { ...this.state.translation, y: value };
    });
    this.bindRange("angle-slider", "angle-value", (value) => {
      this.state.rotationDegrees = value;
    });
    this.bindScaleSliders();
    this.bindRange("pixel-size-slider", "pixel-size-value", (value) => {
      this.state.pixelSize = Math.max(1, Math.floor(value));
    });

    const gridToggleButton = this.root.querySelector<HTMLButtonElement>("#grid-toggle");
    gridToggleButton?.addEventListener("click", () => {
      this.state.showGrid = !this.state.showGrid;
      this.updateGridButton();
      this.emitState();
    });
    this.updateGridButton();

    const clearButton = this.root.querySelector<HTMLButtonElement>("#clear-btn");
    clearButton?.addEventListener("click", () => {
      this.onClearClick?.();
    });

    // Resolução das curvas. Vinculado manualmente porque bindRange divide por 100
    // qualquer slider cujo id começa com "s" (convenção dos sliders de escala).
    const segmentsSlider = this.root.querySelector<HTMLInputElement>("#segments-slider");
    const segmentsLabel = this.root.querySelector<HTMLElement>("#segments-value");
    if (segmentsSlider && segmentsLabel) {
      const updateSegments = (): void => {
        const value = Math.max(2, Math.floor(Number(segmentsSlider.value)));
        this.state.curveSegments = value;
        segmentsLabel.textContent = String(value);
        this.emitState();
      };
      segmentsSlider.addEventListener("input", updateSegments);
      updateSegments();
    }

    const finishCurveButton = this.root.querySelector<HTMLButtonElement>("#finish-curve-btn");
    finishCurveButton?.addEventListener("click", () => {
      this.onFinishCurveClick?.();
    });
  }

  private bindScaleSliders(): void {
    const sxSlider = this.root.querySelector<HTMLInputElement>("#sx-slider");
    const sySlider = this.root.querySelector<HTMLInputElement>("#sy-slider");
    const sxLabel = this.root.querySelector<HTMLElement>("#sx-value");
    const syLabel = this.root.querySelector<HTMLElement>("#sy-value");
    const lockBtn = this.root.querySelector<HTMLButtonElement>("#scale-lock-toggle");

    if (!sxSlider || !sySlider || !sxLabel || !syLabel) {
      return;
    }

    const setLabels = (s: number): void => {
      const t = s.toFixed(2);
      sxLabel.textContent = t;
      syLabel.textContent = t;
    };

    const applyUniformSlider = (sliderValue: number): void => {
      const v = Math.round(Math.min(300, Math.max(25, sliderValue)));
      const s = v / 100;
      sxSlider.value = String(v);
      sySlider.value = String(v);
      this.state.scale = { x: s, y: s };
      setLabels(s);
      this.emitState();
    };

    const onSxInput = (): void => {
      const raw = Number(sxSlider.value);
      if (this.scaleLocked) {
        applyUniformSlider(raw);
        return;
      }
      this.state.scale = { ...this.state.scale, x: raw / 100 };
      sxLabel.textContent = (raw / 100).toFixed(2);
      this.emitState();
    };

    const onSyInput = (): void => {
      const raw = Number(sySlider.value);
      if (this.scaleLocked) {
        applyUniformSlider(raw);
        return;
      }
      this.state.scale = { ...this.state.scale, y: raw / 100 };
      syLabel.textContent = (raw / 100).toFixed(2);
      this.emitState();
    };

    sxSlider.addEventListener("input", onSxInput);
    sySlider.addEventListener("input", onSyInput);

    lockBtn?.addEventListener("click", () => {
      this.scaleLocked = !this.scaleLocked;
      if (this.scaleLocked) {
        const mid = Math.round((Number(sxSlider.value) + Number(sySlider.value)) / 2);
        applyUniformSlider(mid);
      }
      this.updateScaleLockButton();
    });
    this.updateScaleLockButton();

    const vx = Number(sxSlider.value);
    const vy = Number(sySlider.value);
    this.state.scale = { x: vx / 100, y: vy / 100 };
    sxLabel.textContent = (vx / 100).toFixed(2);
    syLabel.textContent = (vy / 100).toFixed(2);
    this.emitState();
  }

  private updateScaleLockButton(): void {
    const lockBtn = this.root.querySelector<HTMLButtonElement>("#scale-lock-toggle");
    if (!lockBtn) {
      return;
    }
    lockBtn.textContent = this.scaleLocked ? "Escala uniforme: Ligado" : "Escala uniforme: Desligado";
    lockBtn.classList.toggle("active", this.scaleLocked);
  }

  private bindRange(
    sliderId: string,
    labelId: string,
    onChange: (value: number) => void,
    format: (value: number) => string = (value) => String(value)
  ): void {
    const slider = this.root.querySelector<HTMLInputElement>(`#${sliderId}`);
    const label = this.root.querySelector<HTMLElement>(`#${labelId}`);

    if (!slider || !label) {
      return;
    }

    const update = (): void => {
      const parsed = Number(slider.value);
      onChange(parsed);
      label.textContent = format(sliderId.startsWith("s") ? parsed / 100 : parsed);
      this.emitState();
    };

    slider.addEventListener("input", update);
    update();
  }

  private setActiveTool(activeTool: Tool): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === activeTool);
    });
  }

  private setActiveClipping(active: ClippingAlgorithm): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-clipping]").forEach((button) => {
      button.classList.toggle("active", button.dataset.clipping === active);
    });
  }

  private emitState(): void {
    this.onStateChange?.(this.getState());
  }

  private updateGridButton(): void {
    const button = this.root.querySelector<HTMLButtonElement>("#grid-toggle");
    if (!button) {
      return;
    }

    button.textContent = `Grid: ${this.state.showGrid ? "On" : "Off"}`;
    button.classList.toggle("active", this.state.showGrid);
  }
}

export function isLineTool(tool: Tool): tool is "line-dda" | "line-bresenham" {
  return tool === "line-dda" || tool === "line-bresenham";
}

export function lineAlgorithmFromTool(tool: Tool): LineAlgorithm {
  return tool === "line-dda" ? "dda" : "bresenham";
}

export function isCurveTool(tool: Tool): tool is "bezier" | "hermite" {
  return tool === "bezier" || tool === "hermite";
}

