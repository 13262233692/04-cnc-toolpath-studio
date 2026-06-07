export const POINT_BYTE_SIZE = 60;

export interface DecodedToolpoint {
  x: number;
  y: number;
  z: number;
  a: number;
  c: number;
  feed: number;
  spindle: number;
  line_number: number;
}

export interface BinaryChunkHeader {
  chunk_index: number;
  total_chunks: number;
  point_offset: number;
  point_count: number;
  total_points: number;
}

export class ToolpathBuffer {
  private buffer: SharedArrayBuffer | null = null;
  private floatView: Float64Array | null = null;
  private uint32View: Uint32Array | null = null;
  private totalPoints: number = 0;
  private loadedPoints: number = 0;
  private axesBuffer: SharedArrayBuffer | null = null;
  private axesFloatView: Float64Array | null = null;

  get totalCount(): number {
    return this.totalPoints;
  }

  get loadedCount(): number {
    return this.loadedPoints;
  }

  get isReady(): boolean {
    return this.loadedPoints >= this.totalPoints && this.totalPoints > 0;
  }

  get pointsBuffer(): SharedArrayBuffer | null {
    return this.buffer;
  }

  get axesData(): Float64Array | null {
    return this.axesFloatView;
  }

  allocate(totalPoints: number): void {
    this.totalPoints = totalPoints;
    this.loadedPoints = 0;

    const pointsByteLength = totalPoints * POINT_BYTE_SIZE;
    this.buffer = new SharedArrayBuffer(pointsByteLength);
    this.floatView = new Float64Array(this.buffer);
    this.uint32View = new Uint32Array(this.buffer);

    const axesByteLength = totalPoints * 5 * 8;
    this.axesBuffer = new SharedArrayBuffer(axesByteLength);
    this.axesFloatView = new Float64Array(this.axesBuffer);
  }

  decodeAndStore(raw: ArrayBuffer): BinaryChunkHeader {
    const view = new DataView(raw);

    const headerLen = view.getUint32(0, true);
    const headerBytes = new Uint8Array(raw, 4, headerLen);
    const headerText = new TextDecoder().decode(headerBytes);
    const header: BinaryChunkHeader = JSON.parse(headerText);

    const dataOffset = 4 + headerLen;
    const pointCount = header.point_count;
    const baseIndex = header.point_offset;

    const srcView = new DataView(raw, dataOffset);

    for (let i = 0; i < pointCount; i++) {
      const srcOffset = i * POINT_BYTE_SIZE;
      const dstFloatBase = (baseIndex + i) * (POINT_BYTE_SIZE / 8);
      const dstUintBase = (baseIndex + i) * (POINT_BYTE_SIZE / 4);

      this.floatView![dstFloatBase + 0] = srcView.getFloat64(srcOffset + 0, true);
      this.floatView![dstFloatBase + 1] = srcView.getFloat64(srcOffset + 8, true);
      this.floatView![dstFloatBase + 2] = srcView.getFloat64(srcOffset + 16, true);
      this.floatView![dstFloatBase + 3] = srcView.getFloat64(srcOffset + 24, true);
      this.floatView![dstFloatBase + 4] = srcView.getFloat64(srcOffset + 32, true);
      this.floatView![dstFloatBase + 5] = srcView.getFloat64(srcOffset + 40, true);
      this.floatView![dstFloatBase + 6] = srcView.getFloat64(srcOffset + 48, true);
      this.uint32View![dstUintBase + 14] = srcView.getUint32(srcOffset + 56, true);
    }

    this.loadedPoints += pointCount;
    return header;
  }

  storeAxesBatch(rawAxes: ArrayBuffer, offset: number): void {
    const src = new Float64Array(rawAxes);
    const dstOffset = offset * 5;
    this.axesFloatView!.set(src, dstOffset);
  }

  getPoint(index: number): DecodedToolpoint {
    const floatBase = index * (POINT_BYTE_SIZE / 8);
    const uintBase = index * (POINT_BYTE_SIZE / 4);
    return {
      x: this.floatView![floatBase + 0],
      y: this.floatView![floatBase + 1],
      z: this.floatView![floatBase + 2],
      a: this.floatView![floatBase + 3],
      c: this.floatView![floatBase + 4],
      feed: this.floatView![floatBase + 5],
      spindle: this.floatView![floatBase + 6],
      line_number: this.uint32View![uintBase + 14],
    };
  }

  getAxes(index: number): { x: number; y: number; z: number; a: number; c: number } {
    const offset = index * 5;
    return {
      x: this.axesFloatView![offset + 0],
      y: this.axesFloatView![offset + 1],
      z: this.axesFloatView![offset + 2],
      a: this.axesFloatView![offset + 3],
      c: this.axesFloatView![offset + 4],
    };
  }

  getPositionsFloat32(): Float32Array {
    const positions = new Float32Array(this.loadedPoints * 3);
    for (let i = 0; i < this.loadedPoints; i++) {
      const floatBase = i * (POINT_BYTE_SIZE / 8);
      positions[i * 3] = this.floatView![floatBase + 0];
      positions[i * 3 + 1] = this.floatView![floatBase + 2];
      positions[i * 3 + 2] = this.floatView![floatBase + 1];
    }
    return positions;
  }

  getRangePositionsFloat32(start: number, count: number): Float32Array {
    const end = Math.min(start + count, this.loadedPoints);
    const len = end - start;
    const positions = new Float32Array(len * 3);
    for (let i = 0; i < len; i++) {
      const floatBase = (start + i) * (POINT_BYTE_SIZE / 8);
      positions[i * 3] = this.floatView![floatBase + 0];
      positions[i * 3 + 1] = this.floatView![floatBase + 2];
      positions[i * 3 + 2] = this.floatView![floatBase + 1];
    }
    return positions;
  }

  dispose(): void {
    this.buffer = null;
    this.floatView = null;
    this.uint32View = null;
    this.axesBuffer = null;
    this.axesFloatView = null;
    this.totalPoints = 0;
    this.loadedPoints = 0;
  }
}
