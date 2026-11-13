import { describe, expect, it } from 'vitest';
import { decodeModelOutput, encodeModelOutput } from './modelOutputBinary';

/** Valores representables en float32, como los que devuelve el modelo. */
const f32 = (values: number[]) => Array.from(new Float32Array(values));

describe('encodeModelOutput / decodeModelOutput', () => {
  it('ida y vuelta sin pérdida', () => {
    const output = {
      frames: [f32([0.1, 0.25, 0.9]), f32([0.333333, 0, 1])],
      onsets: [f32([0.5, 0.123456, 0]), f32([0, 0.7, 0.01])],
      contours: [f32([0.2, 0.4, 0.6, 0.8, 1, 0.11]), f32([0, 0, 0, 0.3, 0.2, 0.1])],
    };
    expect(decodeModelOutput(encodeModelOutput(output))).toEqual(output);
  });

  it('lee bien aunque los bytes no arranquen alineados', () => {
    const output = { frames: [f32([0.5])], onsets: [f32([0.25])], contours: [f32([0.75, 0.125])] };
    const encoded = encodeModelOutput(output);
    const shifted = new Uint8Array(encoded.length + 1);
    shifted.set(encoded, 1);
    expect(decodeModelOutput(shifted.subarray(1))).toEqual(output);
  });

  it('salida vacía', () => {
    expect(decodeModelOutput(encodeModelOutput({ frames: [], onsets: [], contours: [] }))).toEqual({
      frames: [],
      onsets: [],
      contours: [],
    });
  });
});
