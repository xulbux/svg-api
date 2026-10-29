/**
 * PNG codec & resampler – Decodes PNG images to straight RGBA, resamples with premultiplied box area averaging, and encodes Bayer-dithered RGB/RGBA PNG buffers.
 */

/* oxlint-disable no-bitwise -- PNG CRC-32, bit-depth unpacking, scanline filtering, and 4x4 Bayer indexing require bitwise integer operations. */

import { deflateSync, inflateSync } from 'node:zlib';
import type { DecodedPng } from './types.ts';

// ---------------------------------------- TYPES ----------------------------------------

/** Parsed PNG header and palette/transparency chunks needed to expand decompressed scanlines. */
interface PngHeaderSpec {
  /** Bits per channel (`1`, `2`, `4`, `8`, or `16`). */
  bitDepth: number;
  /** PNG color type (`0` gray, `2` RGB, `3` indexed, `4` gray+alpha, `6` RGBA). */
  colorType: number;
  /** Image height in pixels. */
  height: number;
  /** Optional `PLTE` RGB palette bytes (`3` bytes per entry). */
  palette: Uint8Array | undefined;
  /** Optional `tRNS` transparency chunk bytes. */
  transparency: Uint8Array | undefined;
  /** Image width in pixels. */
  width: number;
}

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

/** Filter a single scanline with PNG filter `1` (`Sub`) and `4` (`Paeth`), writing the smaller residue into `rawScanlines`. */
function filterPngScanline(
  pixels: Uint8Array,
  row: number,
  rowBytes: number,
  bytesPerPixel: 3 | 4,
  subRow: Uint8Array,
  paethRow: Uint8Array,
  rawScanlines: Buffer
): void {
  const rowOffset = row * rowBytes;
  const prevRowOffset = (row - 1) * rowBytes;
  let subScore = 0;
  let paethScore = 0;

  for (let i = 0; i < rowBytes; i += 1) {
    const current = pixels[rowOffset + i] ?? 0;
    const left = i >= bytesPerPixel ? (pixels[rowOffset + i - bytesPerPixel] ?? 0) : 0;
    const up = row > 0 ? (pixels[prevRowOffset + i] ?? 0) : 0;
    const upLeft =
      row > 0 && i >= bytesPerPixel ? (pixels[prevRowOffset + i - bytesPerPixel] ?? 0) : 0;

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

/** Encode an 8-bit `pixels` scanline buffer (`3` RGB or `4` RGBA bytes per pixel) into a PNG `Buffer`. */
function encodePngBuffer(
  width: number,
  height: number,
  pixels: Uint8Array,
  bytesPerPixel: 3 | 4,
  sourceDigest: string
): Buffer {
  const rowBytes = width * bytesPerPixel;
  const rawScanlines = Buffer.allocUnsafe(height * (1 + rowBytes));
  const subRow = new Uint8Array(rowBytes);
  const paethRow = new Uint8Array(rowBytes);

  for (let row = 0; row < height; row += 1) {
    filterPngScanline(pixels, row, rowBytes, bytesPerPixel, subRow, paethRow, rawScanlines);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel.
  ihdr[9] = bytesPerPixel === 4 ? 6 : 2; // Truecolor RGBA (`6`) or RGB (`2`).

  const compressed = deflateSync(rawScanlines, { level: 9 });
  const textChunkData = Buffer.from(`Comment\0src-sha256=${sourceDigest}`, 'ascii');
  return Buffer.concat([
    PNG_SIGNATURE,
    packPngChunk('IHDR', ihdr),
    packPngChunk('tEXt', textChunkData),
    packPngChunk('IDAT', compressed),
    packPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Resolve the sample channel count of a PNG `colorType`. */
function getPngChannelCount(colorType: number): number {
  switch (colorType) {
    case 0:
    case 3: {
      return 1;
    }
    case 4: {
      return 2;
    }
    case 2: {
      return 3;
    }
    case 6: {
      return 4;
    }
    default: {
      throw new Error(`Unsupported PNG color type: ${colorType}`);
    }
  }
}

/** Reconstruct unfiltered scanlines (`height * rowBytes`) across PNG filter modes `0`–`4`. */
function unfilterPngScanlines(
  inflated: Uint8Array,
  height: number,
  rowBytes: number,
  filterStride: number
): Uint8Array {
  const expectedLength = height * (1 + rowBytes);
  if (inflated.byteLength < expectedLength) {
    throw new Error('Truncated PNG IDAT stream');
  }
  const unfiltered = new Uint8Array(height * rowBytes);
  for (let row = 0; row < height; row += 1) {
    const inRowOffset = row * (1 + rowBytes);
    const outRowOffset = row * rowBytes;
    const prevRowOffset = (row - 1) * rowBytes;
    const filterType = inflated[inRowOffset] ?? 0;

    for (let i = 0; i < rowBytes; i += 1) {
      const rawByte = inflated[inRowOffset + 1 + i] ?? 0;
      const left = i >= filterStride ? (unfiltered[outRowOffset + i - filterStride] ?? 0) : 0;
      const up = row > 0 ? (unfiltered[prevRowOffset + i] ?? 0) : 0;
      const upLeft =
        row > 0 && i >= filterStride ? (unfiltered[prevRowOffset + i - filterStride] ?? 0) : 0;

      let reconstructed = rawByte;
      if (filterType === 1) {
        reconstructed = (rawByte + left) & 0xff;
      } else if (filterType === 2) {
        reconstructed = (rawByte + up) & 0xff;
      } else if (filterType === 3) {
        reconstructed = (rawByte + ((left + up) >>> 1)) & 0xff;
      } else if (filterType === 4) {
        reconstructed = (rawByte + predictPaeth(left, up, upLeft)) & 0xff;
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG scanline filter: ${filterType}`);
      }
      unfiltered[outRowOffset + i] = reconstructed;
    }
  }
  return unfiltered;
}

/** Read a packed sub-byte sample (`1`, `2`, `4`, or `8` bits) at column `col` of a scanline starting at `rowOffset`. */
function readPackedSample(
  unfiltered: Uint8Array,
  rowOffset: number,
  col: number,
  bitDepth: number
): number {
  if (bitDepth === 8) {
    return unfiltered[rowOffset + col] ?? 0;
  }
  const samplesPerByte = 8 / bitDepth;
  const byteVal = unfiltered[rowOffset + Math.floor(col / samplesPerByte)] ?? 0;
  const shift = 8 - bitDepth * ((col % samplesPerByte) + 1);
  const mask = (1 << bitDepth) - 1;
  return (byteVal >>> shift) & mask;
}

/** Read a big-endian 16-bit unsigned integer from `bytes` at `byteOffset`. */
function readUint16BE(bytes: Uint8Array, byteOffset: number): number {
  return ((bytes[byteOffset] ?? 0) << 8) | (bytes[byteOffset + 1] ?? 0);
}

/** Read an 8-bit normalized channel sample (`8`-bit direct or rounded `16`-bit) from `unfiltered`. */
function readChannelByte(unfiltered: Uint8Array, byteOffset: number, bitDepth: number): number {
  if (bitDepth === 8) {
    return unfiltered[byteOffset] ?? 0;
  }
  return (readUint16BE(unfiltered, byteOffset) * 255 + 32_895) >>> 16;
}

/** Read a raw sample (`1`–`16` bits) for color-key comparison on grayscale or RGB scanlines. */
function readRawChannelSample(
  unfiltered: Uint8Array,
  byteOffset: number,
  bitDepth: number
): number {
  return bitDepth === 16 ? readUint16BE(unfiltered, byteOffset) : (unfiltered[byteOffset] ?? 0);
}

/** Expand indexed-color (`colorType === 3`) scanlines into straight 8-bit RGBA pixels. */
function expandIndexedScanlines(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number,
  rgba: Uint8Array
): void {
  const { bitDepth, height, palette, transparency, width } = header;
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * rowBytes;
    for (let col = 0; col < width; col += 1) {
      const outOffset = (row * width + col) * 4;
      const paletteIdx = readPackedSample(unfiltered, rowOffset, col, bitDepth);
      rgba[outOffset] = palette?.[paletteIdx * 3] ?? 0;
      rgba[outOffset + 1] = palette?.[paletteIdx * 3 + 1] ?? 0;
      rgba[outOffset + 2] = palette?.[paletteIdx * 3 + 2] ?? 0;
      rgba[outOffset + 3] = transparency?.[paletteIdx] ?? 255;
    }
  }
}

/** Expand grayscale (`colorType === 0`) scanlines into straight 8-bit RGBA pixels. */
function expandGrayscaleScanlines(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number,
  rgba: Uint8Array
): void {
  const { bitDepth, height, transparency, width } = header;
  const maxSubByteSample = (1 << bitDepth) - 1;
  const transGray =
    transparency && transparency.byteLength >= 2 ? readUint16BE(transparency, 0) : -1;

  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * rowBytes;
    for (let col = 0; col < width; col += 1) {
      const outOffset = (row * width + col) * 4;
      const rawGray =
        bitDepth === 16
          ? readUint16BE(unfiltered, rowOffset + col * 2)
          : readPackedSample(unfiltered, rowOffset, col, bitDepth);
      const grayByte =
        bitDepth === 16
          ? (rawGray * 255 + 32_895) >>> 16
          : Math.round((rawGray * 255) / maxSubByteSample);
      rgba[outOffset] = grayByte;
      rgba[outOffset + 1] = grayByte;
      rgba[outOffset + 2] = grayByte;
      rgba[outOffset + 3] = rawGray === transGray ? 0 : 255;
    }
  }
}

/** Expand grayscale+alpha (`colorType === 4`) scanlines into straight 8-bit RGBA pixels. */
function expandGrayAlphaScanlines(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number,
  rgba: Uint8Array
): void {
  const { bitDepth, height, width } = header;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * rowBytes;
    for (let col = 0; col < width; col += 1) {
      const outOffset = (row * width + col) * 4;
      const inOffset = rowOffset + col * 2 * bytesPerSample;
      const grayByte = readChannelByte(unfiltered, inOffset, bitDepth);
      rgba[outOffset] = grayByte;
      rgba[outOffset + 1] = grayByte;
      rgba[outOffset + 2] = grayByte;
      rgba[outOffset + 3] = readChannelByte(unfiltered, inOffset + bytesPerSample, bitDepth);
    }
  }
}

/** Expand truecolor RGB (`colorType === 2`) scanlines into straight 8-bit RGBA pixels. */
function expandRgbScanlines(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number,
  rgba: Uint8Array
): void {
  const { bitDepth, height, transparency, width } = header;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  const hasRgbKey = transparency !== undefined && transparency.byteLength >= 6;
  const keyRed = hasRgbKey ? readUint16BE(transparency, 0) : -1;
  const keyGreen = hasRgbKey ? readUint16BE(transparency, 2) : -1;
  const keyBlue = hasRgbKey ? readUint16BE(transparency, 4) : -1;

  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * rowBytes;
    for (let col = 0; col < width; col += 1) {
      const outOffset = (row * width + col) * 4;
      const inOffset = rowOffset + col * 3 * bytesPerSample;
      const isTransparentKey =
        hasRgbKey &&
        readRawChannelSample(unfiltered, inOffset, bitDepth) === keyRed &&
        readRawChannelSample(unfiltered, inOffset + bytesPerSample, bitDepth) === keyGreen &&
        readRawChannelSample(unfiltered, inOffset + bytesPerSample * 2, bitDepth) === keyBlue;
      rgba[outOffset] = readChannelByte(unfiltered, inOffset, bitDepth);
      rgba[outOffset + 1] = readChannelByte(unfiltered, inOffset + bytesPerSample, bitDepth);
      rgba[outOffset + 2] = readChannelByte(unfiltered, inOffset + bytesPerSample * 2, bitDepth);
      rgba[outOffset + 3] = isTransparentKey ? 0 : 255;
    }
  }
}

/** Expand 16-bit RGBA (`colorType === 6`) scanlines into straight 8-bit RGBA pixels. */
function expandRgba16Scanlines(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number,
  rgba: Uint8Array
): void {
  const { bitDepth, height, width } = header;
  const bytesPerSample = bitDepth === 16 ? 2 : 1;
  for (let row = 0; row < height; row += 1) {
    const rowOffset = row * rowBytes;
    for (let col = 0; col < width; col += 1) {
      const outOffset = (row * width + col) * 4;
      const inOffset = rowOffset + col * 4 * bytesPerSample;
      rgba[outOffset] = readChannelByte(unfiltered, inOffset, bitDepth);
      rgba[outOffset + 1] = readChannelByte(unfiltered, inOffset + bytesPerSample, bitDepth);
      rgba[outOffset + 2] = readChannelByte(unfiltered, inOffset + bytesPerSample * 2, bitDepth);
      rgba[outOffset + 3] = readChannelByte(unfiltered, inOffset + bytesPerSample * 3, bitDepth);
    }
  }
}

/** Expand unfiltered PNG scanlines of any standard color type into straight 8-bit RGBA pixels. */
function expandScanlinesToRgba(
  header: PngHeaderSpec,
  unfiltered: Uint8Array,
  rowBytes: number
): Uint8Array {
  const { bitDepth, colorType, height, width } = header;
  const rgba = new Uint8Array(width * height * 4);
  if (colorType === 6 && bitDepth === 8) {
    rgba.set(unfiltered.subarray(0, rgba.byteLength));
    return rgba;
  }
  if (colorType === 3) {
    expandIndexedScanlines(header, unfiltered, rowBytes, rgba);
  } else if (colorType === 0) {
    expandGrayscaleScanlines(header, unfiltered, rowBytes, rgba);
  } else if (colorType === 4) {
    expandGrayAlphaScanlines(header, unfiltered, rowBytes, rgba);
  } else if (colorType === 2) {
    expandRgbScanlines(header, unfiltered, rowBytes, rgba);
  } else {
    expandRgba16Scanlines(header, unfiltered, rowBytes, rgba);
  }
  return rgba;
}

/** Verify `pngBytes` begins with the 8-byte PNG signature and meets minimum file size. */
function verifyPngSignature(pngBytes: Uint8Array): void {
  if (pngBytes.byteLength < 33) {
    throw new Error('Invalid PNG buffer: file too small');
  }
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (pngBytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid PNG signature');
    }
  }
}

/** Parse `IHDR`, optional `PLTE`/`tRNS`, and `IDAT` chunks from a signature-verified PNG buffer. */
function parsePngChunks(pngBytes: Uint8Array): { header: PngHeaderSpec; idatData: Buffer } {
  const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength);
  let header: PngHeaderSpec | undefined = undefined;
  let palette: Uint8Array | undefined = undefined;
  let transparency: Uint8Array | undefined = undefined;
  const idatChunks: Buffer[] = [];
  let offset = 8;

  while (offset + 8 <= pngBytes.byteLength) {
    const chunkLength = view.getUint32(offset);
    const chunkEnd = offset + 8 + chunkLength;
    if (chunkEnd + 4 > pngBytes.byteLength) {
      throw new Error('Truncated PNG chunk');
    }
    const chunkType = Buffer.from(pngBytes.buffer, pngBytes.byteOffset + offset + 4, 4).toString(
      'ascii'
    );
    const chunkData = pngBytes.subarray(offset + 8, chunkEnd);

    if (chunkType === 'IHDR') {
      if ((chunkData[12] ?? 0) !== 0) {
        throw new Error('Interlaced PNG images are not supported; save as non-interlaced');
      }
      header = {
        bitDepth: chunkData[8] ?? 0,
        colorType: chunkData[9] ?? 0,
        height: view.getUint32(offset + 12),
        palette: undefined,
        transparency: undefined,
        width: view.getUint32(offset + 8),
      };
    } else if (chunkType === 'PLTE') {
      palette = chunkData;
    } else if (chunkType === 'tRNS') {
      transparency = chunkData;
    } else if (chunkType === 'IDAT') {
      idatChunks.push(Buffer.from(chunkData.buffer, chunkData.byteOffset, chunkData.byteLength));
    } else if (chunkType === 'IEND') {
      break;
    }
    offset = chunkEnd + 4;
  }

  if (!header || header.width <= 0 || header.height <= 0 || idatChunks.length === 0) {
    throw new Error('Missing PNG IHDR or IDAT chunk');
  }
  header.palette = palette;
  header.transparency = transparency;
  return { header, idatData: Buffer.concat(idatChunks) };
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
 * Decode a non-interlaced PNG buffer into straight 8-bit RGBA pixels (`width * height * 4` bytes).
 * @param pngBytes   Raw PNG file bytes.
 * @returns Decoded dimensions and RGBA pixel buffer.
 */
export function decodePngToRgba(pngBytes: Uint8Array): DecodedPng {
  verifyPngSignature(pngBytes);
  const { header, idatData } = parsePngChunks(pngBytes);
  const channels = getPngChannelCount(header.colorType);
  const bitsPerPixel = channels * header.bitDepth;
  const filterStride = Math.max(1, (bitsPerPixel + 7) >>> 3);
  const rowBytes = Math.ceil((header.width * bitsPerPixel) / 8);
  const inflated = inflateSync(idatData);
  const unfiltered = unfilterPngScanlines(inflated, header.height, rowBytes, filterStride);

  return {
    height: header.height,
    pixels: expandScanlinesToRgba(header, unfiltered, rowBytes),
    width: header.width,
  };
}

/**
 * Resample straight 8-bit RGBA `source` into a floating-point RGBA canvas (`targetWidth * targetHeight * 4` floats)
 * using premultiplied box area integration so transparent outer edges never bleed dark fringes.
 * @param source         Decoded source PNG image.
 * @param targetWidth    Output width in pixels.
 * @param targetHeight   Output height in pixels.
 * @returns Floating-point RGBA canvas (`rgb` in `[0, 255]`, `alpha` in `[0, 1]`).
 */
export function resampleRgbaArea(
  source: DecodedPng,
  targetWidth: number,
  targetHeight: number
): Float32Array {
  const canvas = new Float32Array(targetWidth * targetHeight * 4);
  for (let dstRow = 0; dstRow < targetHeight; dstRow += 1) {
    const srcY0 = (dstRow * source.height) / targetHeight;
    const srcY1 = ((dstRow + 1) * source.height) / targetHeight;
    const minSrcRow = Math.max(0, Math.floor(srcY0));
    const maxSrcRow = Math.min(source.height - 1, Math.ceil(srcY1) - 1);

    for (let dstCol = 0; dstCol < targetWidth; dstCol += 1) {
      const srcX0 = (dstCol * source.width) / targetWidth;
      const srcX1 = ((dstCol + 1) * source.width) / targetWidth;
      const minSrcCol = Math.max(0, Math.floor(srcX0));
      const maxSrcCol = Math.min(source.width - 1, Math.ceil(srcX1) - 1);

      let totalArea = 0;
      let sumAlpha = 0;
      let sumPremulRed = 0;
      let sumPremulGreen = 0;
      let sumPremulBlue = 0;

      for (let srcRow = minSrcRow; srcRow <= maxSrcRow; srcRow += 1) {
        const overlapY = Math.min(srcY1, srcRow + 1) - Math.max(srcY0, srcRow);
        if (overlapY > 0) {
          for (let srcCol = minSrcCol; srcCol <= maxSrcCol; srcCol += 1) {
            const overlapX = Math.min(srcX1, srcCol + 1) - Math.max(srcX0, srcCol);
            if (overlapX > 0) {
              const area = overlapX * overlapY;
              const srcOffset = (srcRow * source.width + srcCol) * 4;
              const alphaWeight = ((source.pixels[srcOffset + 3] ?? 0) / 255) * area;
              totalArea += area;
              sumAlpha += alphaWeight;
              sumPremulRed += (source.pixels[srcOffset] ?? 0) * alphaWeight;
              sumPremulGreen += (source.pixels[srcOffset + 1] ?? 0) * alphaWeight;
              sumPremulBlue += (source.pixels[srcOffset + 2] ?? 0) * alphaWeight;
            }
          }
        }
      }

      const outOffset = (dstRow * targetWidth + dstCol) * 4;
      if (sumAlpha > 0 && totalArea > 0) {
        canvas[outOffset] = sumPremulRed / sumAlpha;
        canvas[outOffset + 1] = sumPremulGreen / sumAlpha;
        canvas[outOffset + 2] = sumPremulBlue / sumAlpha;
        canvas[outOffset + 3] = clampRange(sumAlpha / totalArea, 0, 1);
      }
    }
  }
  return canvas;
}

/**
 * Convert floating-point RGBA `canvas` pixels (`width * height * 4` floats) into `4x4` Bayer-dithered RGB `Uint8Array` bytes.
 * @param canvas   Floating-point RGBA pixel buffer (`rgb` in `[0, 255]`, `alpha` in `[0, 1]`).
 * @param width    Image width in pixels.
 * @param height   Image height in pixels.
 * @returns 8-bit RGB pixel buffer (`width * height * 3` bytes).
 */
export function ditherCanvasToRgb(canvas: Float32Array, width: number, height: number): Uint8Array {
  const rgbPixels = new Uint8Array(width * height * 3);
  for (let row = 0; row < height; row += 1) {
    const bayerRowOffset = (row & 3) * 4;
    for (let col = 0; col < width; col += 1) {
      const dither = BAYER_4X4[bayerRowOffset + (col & 3)] ?? 0;
      const inOffset = (row * width + col) * 4;
      const outOffset = (row * width + col) * 3;
      const alpha = canvas[inOffset + 3] ?? 0;
      rgbPixels[outOffset] = clampRange(
        Math.round((canvas[inOffset] ?? 0) * alpha + dither),
        0,
        255
      );
      rgbPixels[outOffset + 1] = clampRange(
        Math.round((canvas[inOffset + 1] ?? 0) * alpha + dither),
        0,
        255
      );
      rgbPixels[outOffset + 2] = clampRange(
        Math.round((canvas[inOffset + 2] ?? 0) * alpha + dither),
        0,
        255
      );
    }
  }
  return rgbPixels;
}

/**
 * Convert floating-point RGBA `canvas` pixels (`width * height * 4` floats) into `4x4` Bayer-dithered RGBA `Uint8Array` bytes.
 * @param canvas   Floating-point RGBA pixel buffer (`rgb` in `[0, 255]`, `alpha` in `[0, 1]`).
 * @param width    Image width in pixels.
 * @param height   Image height in pixels.
 * @returns 8-bit RGBA pixel buffer (`width * height * 4` bytes).
 */
export function ditherCanvasToRgba(
  canvas: Float32Array,
  width: number,
  height: number
): Uint8Array {
  const rgbaPixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const bayerRowOffset = (row & 3) * 4;
    for (let col = 0; col < width; col += 1) {
      const offset = (row * width + col) * 4;
      const alphaByte = clampRange(Math.round((canvas[offset + 3] ?? 0) * 255), 0, 255);
      if (alphaByte > 0) {
        const dither = BAYER_4X4[bayerRowOffset + (col & 3)] ?? 0;
        rgbaPixels[offset] = clampRange(Math.round((canvas[offset] ?? 0) + dither), 0, 255);
        rgbaPixels[offset + 1] = clampRange(Math.round((canvas[offset + 1] ?? 0) + dither), 0, 255);
        rgbaPixels[offset + 2] = clampRange(Math.round((canvas[offset + 2] ?? 0) + dither), 0, 255);
        rgbaPixels[offset + 3] = alphaByte;
      }
    }
  }
  return rgbaPixels;
}

/**
 * Encode an `rgbPixels` (`Uint8Array` of `width * height * 3` bytes) image into a compressed PNG `Buffer`.
 * @param width          Image width in pixels.
 * @param height         Image height in pixels.
 * @param rgbPixels      8-bit RGB scanline buffer.
 * @param sourceDigest   Hex SHA-256 digest of the source asset stored in a `tEXt` chunk.
 * @returns Complete PNG binary buffer.
 */
export function encodeRgbPng(
  width: number,
  height: number,
  rgbPixels: Uint8Array,
  sourceDigest: string
): Buffer {
  return encodePngBuffer(width, height, rgbPixels, 3, sourceDigest);
}

/**
 * Encode an `rgbaPixels` (`Uint8Array` of `width * height * 4` bytes) image into a compressed RGBA PNG `Buffer`.
 * @param width          Image width in pixels.
 * @param height         Image height in pixels.
 * @param rgbaPixels     8-bit RGBA scanline buffer.
 * @param sourceDigest   Hex SHA-256 digest of the source asset stored in a `tEXt` chunk.
 * @returns Complete RGBA PNG binary buffer.
 */
export function encodeRgbaPng(
  width: number,
  height: number,
  rgbaPixels: Uint8Array,
  sourceDigest: string
): Buffer {
  return encodePngBuffer(width, height, rgbaPixels, 4, sourceDigest);
}
