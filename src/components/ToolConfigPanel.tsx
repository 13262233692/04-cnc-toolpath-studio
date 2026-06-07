import React from "react";
import { MrrAnalysisConfig, ToolType, MrrSummary } from "../types";

interface ToolConfigPanelProps {
  config: MrrAnalysisConfig;
  onConfigChange: (config: MrrAnalysisConfig) => void;
  onAnalyze: () => void;
  summary: MrrSummary | null;
  isAnalyzing: boolean;
}

const TOOL_TYPES: ToolType[] = ["BallEnd", "FlatEnd", "BullNose", "Chamfer"];

export const ToolConfigPanel: React.FC<ToolConfigPanelProps> = ({
  config,
  onConfigChange,
  onAnalyze,
  summary,
  isAnalyzing,
}) => {
  const update = (path: string, value: number | string) => {
    const next = { ...config, tool: { ...config.tool }, stock: { ...config.stock } };
    const parts = path.split(".");
    let obj: Record<string, unknown> = next as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
    onConfigChange(next);
  };

  return (
    <div className="panel">
      <div className="panel-title">⚙ Tool & MRR Config</div>

      <div className="config-section">
        <div className="config-label">Tool Type</div>
        <select
          value={config.tool.tool_type}
          onChange={(e) => update("tool.tool_type", e.target.value)}
          className="config-select"
        >
          {TOOL_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="config-row">
        <div className="config-field">
          <label className="config-label">Diameter</label>
          <input
            type="number"
            value={config.tool.diameter}
            onChange={(e) => update("tool.diameter", +e.target.value)}
            className="config-input"
            step="0.5"
          />
        </div>
        <div className="config-field">
          <label className="config-label">Corner R</label>
          <input
            type="number"
            value={config.tool.corner_radius}
            onChange={(e) => update("tool.corner_radius", +e.target.value)}
            className="config-input"
            step="0.1"
          />
        </div>
      </div>

      <div className="config-row">
        <div className="config-field">
          <label className="config-label">Flutes</label>
          <input
            type="number"
            value={config.tool.num_flutes}
            onChange={(e) => update("tool.num_flutes", +e.target.value)}
            className="config-input"
            step="1"
            min="1"
            max="12"
          />
        </div>
        <div className="config-field">
          <label className="config-label">Flute Len</label>
          <input
            type="number"
            value={config.tool.flute_length}
            onChange={(e) => update("tool.flute_length", +e.target.value)}
            className="config-input"
            step="1"
          />
        </div>
      </div>

      <div className="config-section" style={{ marginTop: 8 }}>
        <div className="config-label" style={{ marginBottom: 4 }}>MRR Parameters</div>
        <div className="config-row">
          <div className="config-field">
            <label className="config-label-sm">Max MRR</label>
            <input
              type="number"
              value={config.max_mrr}
              onChange={(e) => update("max_mrr", +e.target.value)}
              className="config-input"
              step="10"
            />
          </div>
          <div className="config-field">
            <label className="config-label-sm">Overload %</label>
            <input
              type="number"
              value={config.overload_threshold}
              onChange={(e) => update("overload_threshold", +e.target.value)}
              className="config-input"
              step="0.05"
              min="0"
              max="1"
            />
          </div>
        </div>
        <div className="config-row">
          <div className="config-field">
            <label className="config-label-sm">Min Override</label>
            <input
              type="number"
              value={config.min_feed_override}
              onChange={(e) => update("min_feed_override", +e.target.value)}
              className="config-input"
              step="0.05"
              min="0.05"
              max="1"
            />
          </div>
          <div className="config-field">
            <label className="config-label-sm">Lookahead mm</label>
            <input
              type="number"
              value={config.lookahead_distance}
              onChange={(e) => update("lookahead_distance", +e.target.value)}
              className="config-input"
              step="1"
            />
          </div>
        </div>
      </div>

      <button
        className="btn-analyze"
        onClick={onAnalyze}
        disabled={isAnalyzing}
      >
        {isAnalyzing ? "Analyzing..." : "▶ Analyze MRR"}
      </button>

      {summary && (
        <div className="mrr-summary">
          <div className="summary-row">
            <span>Avg MRR</span>
            <span className="summary-val">{summary.avg_mrr.toFixed(1)} mm³/min</span>
          </div>
          <div className="summary-row">
            <span>Max MRR</span>
            <span className="summary-val">{summary.max_mrr.toFixed(1)} mm³/min</span>
          </div>
          <div className="summary-row">
            <span>Min Override</span>
            <span className={`summary-val ${summary.min_feed_override < 0.5 ? "warning" : ""}`}>
              {(summary.min_feed_override * 100).toFixed(1)}%
            </span>
          </div>
          <div className="summary-row">
            <span>⚠ High Load</span>
            <span className="summary-val warning">{summary.high_points}</span>
          </div>
          <div className="summary-row">
            <span>🔴 Critical</span>
            <span className="summary-val critical">{summary.critical_points}</span>
          </div>
          <div className="summary-row">
            <span>Override Dist</span>
            <span className="summary-val">{summary.total_overridden_distance.toFixed(1)} mm</span>
          </div>
          <div className="summary-row">
            <span>Est. Time</span>
            <span className="summary-val">{summary.estimated_time_with_override.toFixed(1)} min</span>
          </div>
        </div>
      )}
    </div>
  );
};
