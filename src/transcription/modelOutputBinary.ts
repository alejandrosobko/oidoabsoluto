import type { ModelOutput } from './basicPitch';

/**
 * Guarda la salida del modelo en binario float32, el mismo formato en que la produce TensorFlow:
 * sin pérdida (a diferencia de redondear un JSON) y varias veces más chico.
 *
 * Formato: [cuadros, columnas de frames/onsets, columnas de contours] como uint32,
 * seguido de frames, onsets y contours como float32, fila por fila.
 */
export function encodeModelOutput(output: ModelOutput): Uint8Array {
  const rows = output.frames.length;
  const noteCols = output.frames[0]?.length ?? 0;
  const contourCols = output.contours[0]?.length ?? 0;
  const header = new Uint32Array([rows, noteCols, contourCols]);
  const body = new Float32Array(rows * (2 * noteCols + contourCols));
  let i = 0;
  for (const matrix of [output.frames, output.onsets]) {
    for (const row of matrix) for (let c = 0; c < noteCols; c++) body[i++] = row[c] ?? 0;
  }
  for (const row of output.contours) for (let c = 0; c < contourCols; c++) body[i++] = row[c] ?? 0;

  const bytes = new Uint8Array(header.byteLength + body.byteLength);
  bytes.set(new Uint8Array(header.buffer), 0);
  bytes.set(new Uint8Array(body.buffer), header.byteLength);
  return bytes;
}

export function decodeModelOutput(bytes: Uint8Array): ModelOutput {
  // Copia alineada: el buffer de origen puede no empezar en múltiplo de 4.
  const aligned = bytes.slice().buffer;
  const [rows = 0, noteCols = 0, contourCols = 0] = new Uint32Array(aligned, 0, 3);
  const body = new Float32Array(aligned, 12);
  let offset = 0;
  const take = (cols: number) => {
    const matrix: number[][] = [];
    for (let r = 0; r < rows; r++) {
      matrix.push(Array.from(body.subarray(offset, offset + cols)));
      offset += cols;
    }
    return matrix;
  };
  const frames = take(noteCols);
  const onsets = take(noteCols);
  const contours = take(contourCols);
  return { frames, onsets, contours };
}
