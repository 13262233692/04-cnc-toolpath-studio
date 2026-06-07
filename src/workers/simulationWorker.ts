import { ToolpathBuffer } from "../data/ToolpathBuffer";
import { MachineConfig } from "../types";

const CHUNK_SIZE = 50000;
const IK_BATCH_SIZE = 5000;

interface WorkerState {
  buffer: ToolpathBuffer | null;
  config: MachineConfig | null;
}

const state: WorkerState = {
  buffer: null,
  config: null,
};

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function loadBinaryChunks(totalPoints: number): Promise<void> {
  if (!state.buffer) return;

  state.buffer.allocate(totalPoints);

  const totalChunks = Math.ceil(totalPoints / CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    try {
      const raw = await invoke<ArrayBuffer>("get_toolpath_binary_chunk", {
        chunkIndex: i,
      });

      const header = state.buffer.decodeAndStore(raw);

      self.postMessage({
        type: "chunk-loaded",
        chunkIndex: header.chunk_index,
        totalChunks: header.total_chunks,
        loadedPoints: state.buffer.loadedCount,
        totalPoints,
      });

      await computeAxesBatch(header.point_offset, header.point_count);
    } catch (err) {
      self.postMessage({
        type: "chunk-error",
        chunkIndex: i,
        error: String(err),
      });
    }
  }

  self.postMessage({
    type: "load-complete",
    totalPoints: state.buffer.totalCount,
    loadedPoints: state.buffer.loadedCount,
  });
}

async function computeAxesBatch(offset: number, count: number): Promise<void> {
  if (!state.buffer || !state.config) return;

  const points: {
    x: number;
    y: number;
    z: number;
    a: number;
    c: number;
    feed: number;
    spindle: number;
    line_number: number;
  }[] = [];

  for (let i = 0; i < count; i++) {
    points.push(state.buffer.getPoint(offset + i));
  }

  for (let batch = 0; batch < points.length; batch += IK_BATCH_SIZE) {
    const batchPoints = points.slice(batch, batch + IK_BATCH_SIZE);

    try {
      const rawAxes = await invoke<ArrayBuffer>("batch_inverse_kinematics", {
        points: batchPoints,
      });

      state.buffer.storeAxesBatch(rawAxes, offset + batch);
    } catch {
      for (let j = 0; j < batchPoints.length; j++) {
        const p = batchPoints[j];
        const fallback = new Float64Array([
          p.x, p.y, p.z, p.a, p.c,
        ]);
        state.buffer.storeAxesBatch(fallback.buffer, offset + batch + j);
      }
    }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  switch (type) {
    case "init": {
      state.config = e.data.config;
      break;
    }

    case "load-toolpath": {
      try {
        self.postMessage({ type: "load-start", totalPoints: e.data.totalPoints });
        await loadBinaryChunks(e.data.totalPoints);
      } catch (err) {
        self.postMessage({ type: "load-error", error: String(err) });
      }
      break;
    }

    case "get-point": {
      if (!state.buffer) return;
      const point = state.buffer.getPoint(e.data.index);
      const axes = state.buffer.getAxes(e.data.index);
      self.postMessage({ type: "point-result", point, axes, index: e.data.index });
      break;
    }

    case "get-range-positions": {
      if (!state.buffer) return;
      const { start, count } = e.data;
      const positions = state.buffer.getRangePositionsFloat32(start, count);
      self.postMessage(
        { type: "range-positions", start, positions },
        { transfer: [positions.buffer] } as any
      );
      break;
    }

    case "get-all-positions": {
      if (!state.buffer) return;
      const positions = state.buffer.getPositionsFloat32();
      self.postMessage(
        { type: "all-positions", positions },
        { transfer: [positions.buffer] } as any
      );
      break;
    }

    default:
      break;
  }
};
