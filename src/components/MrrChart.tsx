import React, { useRef, useEffect, useCallback } from "react";
import { MrrSummary } from "../types";

interface MrrChartProps {
  mrrData: Float64Array | null;
  overrideData: Float64Array | null;
  loadLevelData: Uint32Array | null;
  currentPoint: number;
  summary: MrrSummary | null;
  visibleRange: { start: number; end: number };
}

const LOAD_COLORS: Record<number, string> = {
  0: "#22c55e",
  1: "#3b82f6",
  2: "#f59e0b",
  3: "#ef4444",
};

const LOAD_LABELS: Record<number, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  3: "Critical",
};

export const MrrChart: React.FC<MrrChartProps> = ({
  mrrData,
  overrideData,
  loadLevelData,
  currentPoint,
  summary,
  visibleRange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = "#0a0e17";
    ctx.fillRect(0, 0, w, h);

    const margin = { top: 30, right: 10, bottom: 25, left: 55 };
    const plotW = w - margin.left - margin.right;
    const plotH = h - margin.top - margin.bottom;

    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(margin.left + plotW, y);
      ctx.stroke();
    }

    if (!mrrData || mrrData.length === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No MRR data", w / 2, h / 2);
      return;
    }

    const { start, end } = visibleRange;
    const viewLen = end - start;
    if (viewLen <= 0) return;

    let maxMrr = 0;
    for (let i = start; i < end && i < mrrData.length; i++) {
      if (mrrData[i] > maxMrr) maxMrr = mrrData[i];
    }
    maxMrr = Math.max(maxMrr, 1);

    ctx.beginPath();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    let firstDraw = true;
    for (let i = start; i < end && i < mrrData.length; i++) {
      const px = margin.left + ((i - start) / viewLen) * plotW;
      const py = margin.top + plotH - (mrrData[i] / maxMrr) * plotH;
      if (firstDraw) {
        ctx.moveTo(px, py);
        firstDraw = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    if (summary && summary.max_mrr > 0) {
      const threshY = margin.top + plotH - (summary.avg_mrr * 1.5 / maxMrr) * plotH;
      ctx.beginPath();
      ctx.strokeStyle = "#f59e0b44";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(margin.left, threshY);
      ctx.lineTo(margin.left + plotW, threshY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#f59e0b";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText("1.5×Avg", margin.left - 4, threshY + 3);
    }

    if (overrideData) {
      ctx.beginPath();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1.5;
      firstDraw = true;
      for (let i = start; i < end && i < overrideData.length; i++) {
        const px = margin.left + ((i - start) / viewLen) * plotW;
        const py = margin.top + plotH - overrideData[i] * plotH;
        if (firstDraw) {
          ctx.moveTo(px, py);
          firstDraw = false;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }

    if (loadLevelData) {
      const segSize = Math.max(1, Math.floor(viewLen / plotW));
      for (let i = start; i < end && i < loadLevelData.length; i += segSize) {
        const lvl = loadLevelData[i];
        if (lvl >= 2) {
          const px = margin.left + ((i - start) / viewLen) * plotW;
          ctx.fillStyle = lvl === 3 ? "#ef444433" : "#f59e0b22";
          ctx.fillRect(px, margin.top, Math.max(1, (plotW / viewLen) * segSize), plotH);
        }
      }
    }

    if (currentPoint >= start && currentPoint < end) {
      const cursorX = margin.left + ((currentPoint - start) / viewLen) * plotW;
      ctx.beginPath();
      ctx.strokeStyle = "#ffffff88";
      ctx.lineWidth = 1;
      ctx.moveTo(cursorX, margin.top);
      ctx.lineTo(cursorX, margin.top + plotH);
      ctx.stroke();

      if (mrrData && currentPoint < mrrData.length) {
        const mrrVal = mrrData[currentPoint];
        const mrrY = margin.top + plotH - (mrrVal / maxMrr) * plotH;
        ctx.beginPath();
        ctx.fillStyle = "#3b82f6";
        ctx.arc(cursorX, mrrY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (overrideData && currentPoint < overrideData.length) {
        const ovVal = overrideData[currentPoint];
        const ovY = margin.top + plotH - ovVal * plotH;
        ctx.beginPath();
        ctx.fillStyle = "#22c55e";
        ctx.arc(cursorX, ovY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = "#94a3b8";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = margin.top + (plotH * i) / 4;
      const val = maxMrr * (1 - i / 4);
      ctx.fillText(val.toFixed(1), margin.left - 4, y + 3);
    }

    ctx.textAlign = "center";
    ctx.fillText(`${start}`, margin.left, margin.top + plotH + 16);
    ctx.fillText(`${end}`, margin.left + plotW, margin.top + plotH + 16);

    ctx.fillStyle = "#3b82f6";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("MRR (mm³/min)", margin.left, margin.top - 16);

    ctx.fillStyle = "#22c55e";
    ctx.fillText("Feed Override", margin.left + 140, margin.top - 16);

    if (summary) {
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      const infoX = margin.left + plotW;
      ctx.fillText(`Avg: ${summary.avg_mrr.toFixed(1)}  Max: ${summary.max_mrr.toFixed(1)}  ⚠${summary.high_points} 🔴${summary.critical_points}`, infoX, margin.top - 4);
    }
  }, [mrrData, overrideData, loadLevelData, currentPoint, summary, visibleRange]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas ref={canvasRef} />
      <div style={{
        position: "absolute", bottom: 2, right: 4, display: "flex", gap: 8, fontSize: "9px", fontFamily: "monospace",
      }}>
        {[0, 1, 2, 3].map((lvl) => (
          <span key={lvl} style={{ color: LOAD_COLORS[lvl] }}>
            ● {LOAD_LABELS[lvl]}
          </span>
        ))}
      </div>
    </div>
  );
};
