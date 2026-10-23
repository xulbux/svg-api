/**
 * PNG encoder – Compresses floating-point RGB canvases into Bayer-dithered truecolor PNG buffers with IEEE 802.3 CRC-32 chunks.
 */

/* oxlint-disable no-bitwise -- PNG CRC-32, scanline filtering, and 4x4 Bayer indexing require bitwise integer operations. */

import { deflateSync } from 'node:zlib';

// ---------------------------------------- CONSTS ---------------------------------------

/** PNG file signature bytes (`\x89PNG\r\n\x1a\n`). */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** `4x4` Bayer ordered dither matrix normalized to `[-0.5, +0.5]` to prevent 8-bit dark gradient banding. */
const BAYER_4X4: readonly number[] = [
  -0.46875, 0.03125, -0.34375, 0.15625, 0.28125, -0.21875, 0.40625, -0.09375, -0.28125, 0.21875,
  -0.40625, 0.09375, 0.46875, -0.03125, 0.34375, -0.15625,
];

/** Lazily initialized IEEE 802.3 CRC-32 lookup table (`undefined` until first PNG encode). */
let crc32Table: Uint32Array | undefined = undefined;

// -------------------------------------- INTERNALS --------------------------------------

/** Build the 256-entry CRC-32 lookup table for PNG chunk checksums. */
function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = (crc & 1) !== 0 ? 0xed_b8_83_20 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}

/** Compute the unsigned 32-bit CRC-32 checksum over `typeBuffer` concatenated with `dataBuffer`. */
function computePngChunkCrc(typeBuffer: Buffer, dataBuffer: Buffer): number {
  crc32Table ??= buildCrc32Table();
  let crc = 0xff_ff_ff_ff;
  for (const byte of typeBuffer) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  for (const byte of dataBuffer) {
    crc = (crc32Table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

/** Pack a single PNG chunk (`length` + `type` + `data` + `CRC-32`). */
function packPngChunk(chunkType: string, dataBuffer: Buffer): Buffer {
  const typeBuffer = Buffer.from(chunkType, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + dataBuffer.length);
  chunk.writeUInt32BE(dataBuffer.length, 0);
  typeBuffer.copy(chunk, 4);
  dataBuffer.copy(chunk, 8);
  chunk.writeUInt32BE(computePngChunkCrc(typeBuffer, dataBuffer), 8 + dataBuffer.length);
  return chunk;
}

/** Paeth predictor used by PNG scanline filter type `4`. */
function predictPaeth(leftByte: number, upByte: number, upLeftByte: number): number {
  const estimate = leftByte + upByte - upLeftByte;
  const distLeft = Math.abs(estimate - leftByte);
  const distUp = Math.abs(estimate - upByte);
  const distUpLeft = Math.abs(estimate - upLeftByte);
  if (distLeft <= distUp && distLeft <= distUpLeft) {
    return leftByte;
  }
  return distUp <= distUpLeft ? upByte : upLeftByte;
}

/** Filter a single RGB scanline with PNG filter `1` (`Sub`) and `4` (`Paeth`), writing the smaller residue into `rawScanlines`. */
function filterPngScanline(
  rgbPixels: Uint8Array,
  row: number,
  rowBytes: number,
  subRow: Uint8Array,
  paethRow: Uint8Array,
  rawScanlines: Buffer
): void {
  const rowOffset = row * rowBytes;
  const prevRowOffset = (row - 1) * rowBytes;
  let subScore = 0;
  let paethScore = 0;

  for (let i = 0; i < rowBytes; i += 1) {
    const current = rgbPixels[rowOffset + i] ?? 0;
    const left = i >= 3 ? (rgbPixels[rowOffset + i - 3] ?? 0) : 0;
    const up = row > 0 ? (rgbPixels[prevRowOffset + i] ?? 0) : 0;
    const upLeft = row > 0 && i >= 3 ? (rgbPixels[prevRowOffset + i - 3] ?? 0) : 0;

    const subByte = (current - left) & 0xff;
    const paethByte = (current - predictPaeth(left, up, upLeft)) & 0xff;
    subRow[i] = subByte;
    paethRow[i] = paethByte;
    subScore += subByte < 128 ? subByte : 256 - subByte;
    paethScore += paethByte < 128 ? paethByte : 256 - paethByte;
  }

  const outOffset = row * (1 + rowBytes);
  if (paethScore <= subScore) {
    rawScanlines[outOffset] = 4;
    rawScanlines.set(paethRow, outOffset + 1);
  } else {
    rawScanlines[outOffset] = 1;
    rawScanlines.set(subRow, outOffset + 1);
  }
}

// -------------------------------------- PUBLIC API -------------------------------------

/**
 * Clamp `value` into `[minValue, maxValue]`.
 * @param value      Input number.
 * @param minValue   Inclusive lower bound.
 * @param maxValue   Inclusive upper bound.
 * @returns Clamped value.
 */
export function clampRange(value: number, minValue: number, maxValue: number): number {
  return Math.min(maxValue, Math.max(minValue, value));
}

/**
 * Convert floating-point `canvas` RGB pixels into `4x4` Bayer-dithered `Uint8Array` bytes.
 * @param canvas   Floating-point RGB pixel buffer (`width * height * 3` floats).
 * @param width    Image width in pixels.
 * @param height   Image height in pixels.
 * @returns 8-bit RGB pixel buffer.
 */
export function ditherCanvasToRgb(canvas: Float32Array, width: number, height: number): Uint8Array {
  const rgbPixels = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const bayerRowOffset = (row & 3) * 4;
    for (let col = 0; col < width; col += 1) {
      const dither = BAYER_4X4[bayerRowOffset + (col & 3)] ?? 0;
      const offset = (row * width + col) * 3;
      rgbPixels[offset] = clampRange(Math.round((canvas[offset] ?? 0) + dither), 0, 255);
      rgbPixels[offset + 1] = clampRange(Math.round((canvas[offset + 1] ?? 0) + dither), 0, 255);
      rgbPixels[offset + 2] = clampRange(Math.round((canvas[offset + 2] ?? 0) + dither), 0, 255);
    }
  }
  return rgbPixels;
}

/**
 * Encode an `rgbPixels` (`Uint8Array` of `width * height * 3` bytes) image into a compressed PNG `Buffer`.
 * @param width          Image width in pixels.
 * @param height         Image height in pixels.
 * @param rgbPixels      8-bit RGB scanline buffer.
 * @param sourceDigest   Hex SHA-256 digest of the source SVG stored in a `tEXt` chunk.
 * @returns Complete PNG binary buffer.
 */
export function encodeRgbPng(
  width: number,
  height: number,
  rgbPixels: Uint8Array,
  sourceDigest: string
): Buffer {
  const rowBytes = width * 3;
  const rawScanlines = Buffer.allocUnsafe(height * (1 + rowBytes));
  const subRow = new Uint8Array(rowBytes);
  const paethRow = new Uint8Array(rowBytes);

  for (let row = 0; row < height; row += 1) {
    filterPngScanline(rgbPixels, row, rowBytes, subRow, paethRow, rawScanlines);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel.
  ihdr[9] = 2; // Truecolor RGB (`image/png`).

  const compressed = deflateSync(rawScanlines, { level: 9 });
  const textChunkData = Buffer.from(`Comment\0svg-sha256=${sourceDigest}`, 'ascii');
  return Buffer.concat([
    PNG_SIGNATURE,
    packPngChunk('IHDR', ihdr),
    packPngChunk('tEXt', textChunkData),
    packPngChunk('IDAT', compressed),
    packPngChunk('IEND', Buffer.alloc(0)),
  ]);
}
