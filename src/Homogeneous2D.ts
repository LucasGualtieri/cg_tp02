import type { UIState, VectorIJ } from "./types";

/** Row-major 3×3 matrix for column vectors [i, j, 1]ᵀ (homogeneous coordinates). */
export type Mat3 = readonly [
	number, number, number,
	number, number, number,
	number, number, number
];

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {

	const out: number[] = new Array(9);

	for (let row = 0; row < 3; row++) {
		for (let col = 0; col < 3; col++) {
			let sum = 0;
			for (let k = 0; k < 3; k++) {
				sum += a[row * 3 + k] * b[k * 3 + col];
			}
			out[row * 3 + col] = sum;
		}
	}

	return out as unknown as Mat3;
}

export function translationMat3(tx: number, ty: number): Mat3 {
	return [
		1, 0, tx,
		0, 1, ty,
		0, 0, 1
	];
}

export function scaleMat3(sx: number, sy: number): Mat3 {
	return [
		sx, 0, 0,
		0, sy, 0,
		0, 0, 1
	];
}

/** Counter-clockwise rotation in a right-handed frame (î horizontal, ĵ vertical). */
export function rotationMat3Degrees(angleDegrees: number): Mat3 {
	const rad = (angleDegrees * Math.PI) / 180;
	const c = Math.cos(rad);
	const s = Math.sin(rad);
	return [
		c, -s, 0,
		s, c, 0,
		0, 0, 1
	];
}

export function transformVectorIJ(m: Mat3, v: VectorIJ): VectorIJ {
	const i = v.i;
	const j = v.j;
	const i1 = m[0] * i + m[1] * j + m[2];
	const j1 = m[3] * i + m[4] * j + m[5];
	const w = m[6] * i + m[7] * j + m[8];
	if (w === 1 || Math.abs(w - 1) < 1e-9) {
		return { i: i1, j: j1 };
	}
	return { i: i1 / w, j: j1 / w };
}

/**
 * Rotation and scale about the world origin (0, 0). Translation is applied in model space
 * before this map: p_screen = R(θ) · S(sx, sy) · (p + translation), so world (0,0) stays
 * at the axis cross; dx/dy move geometry relative to that origin.
 */
export function rotationScaleMatFromUIState(ui: UIState): Mat3 {
	const s = scaleMat3(ui.scale.x, ui.scale.y);
	const r = rotationMat3Degrees(ui.rotationDegrees);
	return mat3Multiply(r, s);
}

/** @deprecated Prefer rotationScaleMatFromUIState + model-space translation; kept for callers expecting the old T·R·S order. */
export function affineMatFromUIState(ui: UIState): Mat3 {
	const sx = ui.scale.x;
	const sy = ui.scale.y;
	const tx = ui.translation.x;
	const ty = ui.translation.y;

	const tUi = translationMat3(tx, ty);
	const s = scaleMat3(sx, sy);
	const r = rotationMat3Degrees(ui.rotationDegrees);

	return mat3Multiply(tUi, mat3Multiply(r, s));
}

const IDENTITY3: Mat3 = [
	1, 0, 0,
	0, 1, 0,
	0, 0, 1
];

/** Inverse of an affine 3×3 matrix (last row 0, 0, 1). Falls back to identity if singular. */
export function invertAffineMat3(m: Mat3): Mat3 {
	const a = m[0];
	const b = m[1];
	const tx = m[2];
	const c = m[3];
	const d = m[4];
	const ty = m[5];
	const det = a * d - b * c;
	if (Math.abs(det) < 1e-14) {
		return IDENTITY3;
	}
	const id = 1 / det;
	return [
		d * id, -b * id, (b * ty - d * tx) * id,
		-c * id, a * id, (c * tx - a * ty) * id,
		0, 0, 1
	] as unknown as Mat3;
}
