import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RenderEngine } from "./engine/RenderEngine";
import { MaterialRemovalSystem } from "./engine/MaterialRemoval";
import { ToolpathBuffer } from "./data/ToolpathBuffer";
import { parseGCode, getMachineConfig } from "./ipc";
import { ToolpathInfo, MachineConfig, MrrAnalysisConfig, MrrSummary } from "./types";
import { MrrChart } from "./components/MrrChart";
import { ToolConfigPanel } from "./components/ToolConfigPanel";

const DEFAULT_MRR_CONFIG: MrrAnalysisConfig = {
  tool: {
    tool_type: "BallEnd",
    diameter: 10,
    corner_radius: 5,
    flute_length: 25,
    num_flutes: 4,
    rake_angle: 12,
  },
  stock: {
    min_x: -100, min_y: -100, min_z: -50,
    max_x: 100, max_y: 100, max_z: 0,
    resolution: 0.5,
  },
  max_mrr: 500,
  overload_threshold: 0.8,
  min_feed_override: 0.1,
  smoothing_window: 20,
  lookahead_distance: 5.0,
};

const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const materialRemovalRef = useRef<MaterialRemovalSystem | null>(null);
  const bufferRef = useRef<ToolpathBuffer | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const simRef = useRef<{
    isPlaying: boolean;
    currentPoint: number;
    speed: number;
    lastTime: number;
    totalPoints: number;
    bufferReady: boolean;
    feedOverride: number;
    loadLevel: number;
  }>({
    isPlaying: false,
    currentPoint: 0,
    speed: 1,
    lastTime: 0,
    totalPoints: 0,
    bufferReady: false,
    feedOverride: 1.0,
    loadLevel: 0,
  });
  const rafRef = useRef<number>(0);

  const [toolpathInfo, setToolpathInfo] = useState<ToolpathInfo | null>(null);
  const [, setMachineConfig] = useState<MachineConfig | null>(null);
  const [currentPointIdx, setCurrentPointIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [status, setStatus] = useState<string>("就绪");

  const [mrrConfig, setMrrConfig] = useState<MrrAnalysisConfig>(DEFAULT_MRR_CONFIG);
  const [mrrSummary, setMrrSummary] = useState<MrrSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mrrData, setMrrData] = useState<Float64Array | null>(null);
  const [overrideData, setOverrideData] = useState<Float64Array | null>(null);
  const [loadLevelData, setLoadLevelData] = useState<Uint32Array | null>(null);
  const [currentFeedOverride, setCurrentFeedOverride] = useState(1.0);
  const [currentLoadLevel, setCurrentLoadLevel] = useState<number>(0);

  const mrrChartRangeRef = useRef({ start: 0, end: 1000 });

  useEffect(() => {
    const init = async () => {
      const config = await getMachineConfig();
      setMachineConfig(config);

      if (canvasRef.current) {
        const engine = new RenderEngine(canvasRef.current, config);
        engineRef.current = engine;

        const matRemoval = new MaterialRemovalSystem();
        materialRemovalRef.current = matRemoval;
        engine.setWorkpieceMaterial(matRemoval.getMaterial());
      }

      const worker = new Worker(
        new URL("./workers/simulationWorker.ts", import.meta.url),
        { type: "module" }
      );

      worker.postMessage({ type: "init", config });

      worker.onmessage = (e: MessageEvent) => {
        const { type } = e.data;
        switch (type) {
          case "chunk-loaded": {
            const { loadedPoints, totalPoints, chunkIndex, totalChunks } = e.data;
            const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
            setLoadProgress(progress);
            setStatus(`加载刀轨数据... ${progress}% (${loadedPoints.toLocaleString()}/${totalPoints.toLocaleString()})`);

            if (bufferRef.current && engineRef.current) {
              const positions = bufferRef.current.getRangePositionsFloat32(
                e.data.chunkIndex * 50000,
                loadedPoints - e.data.chunkIndex * 50000
              );
              engineRef.current.appendToolpathPositions(positions, e.data.chunkIndex * 50000);
            }
            break;
          }

          case "load-complete": {
            const { totalPoints } = e.data;
            simRef.current.totalPoints = totalPoints;
            simRef.current.bufferReady = true;
            simRef.current.currentPoint = 0;
            setCurrentPointIdx(0);
            setLoading(false);
            setStatus(`加载完成 - 共 ${totalPoints.toLocaleString()} 个刀位点`);

            if (toolpathInfo) {
              setMrrConfig((prev) => ({
                ...prev,
                stock: {
                  ...prev.stock,
                  min_x: toolpathInfo.bounds.min_x,
                  min_y: toolpathInfo.bounds.min_y,
                  max_x: toolpathInfo.bounds.max_x,
                  max_y: toolpathInfo.bounds.max_y,
                  max_z: toolpathInfo.bounds.max_z,
                  min_z: toolpathInfo.bounds.min_z,
                },
              }));
            }
            break;
          }

          case "load-error": {
            setLoading(false);
            setStatus(`加载失败: ${e.data.error}`);
            break;
          }

          case "chunk-error": {
            setStatus(`分片 ${e.data.chunkIndex} 加载失败: ${e.data.error}`);
            break;
          }

          case "mrr-chunk-loaded": {
            const { chunkIndex, totalChunks } = e.data;
            const mrrProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
            setStatus(`MRR 数据加载... ${mrrProgress}%`);
            break;
          }

          case "mrr-load-complete": {
            setIsAnalyzing(false);
            setStatus("MRR 分析完成");

            if (bufferRef.current && bufferRef.current.hasMrrData) {
              const total = bufferRef.current.totalCount;
              const range = bufferRef.current.getMrrRange(0, total);
              setMrrData(range.mrr);
              setOverrideData(range.override);
              setLoadLevelData(range.loadLevel);
              mrrChartRangeRef.current = { start: 0, end: Math.min(2000, total) };
            }
            break;
          }

          case "mrr-error": {
            setIsAnalyzing(false);
            setStatus(`MRR 分析失败: ${e.data.error}`);
            break;
          }

          case "mrr-chunk-error": {
            setStatus(`MRR 分片 ${e.data.chunkIndex} 加载失败`);
            break;
          }
        }
      };

      workerRef.current = worker;
    };

    init();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (workerRef.current) workerRef.current.terminate();
      if (engineRef.current) engineRef.current.dispose();
      if (materialRemovalRef.current) materialRemovalRef.current.dispose();
      if (bufferRef.current) bufferRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    if (!engineRef.current || !bufferRef.current) return;

    const simulate = (time: number) => {
      const sim = simRef.current;

      if (sim.isPlaying && sim.bufferReady && sim.currentPoint < sim.totalPoints) {
        const delta = time - sim.lastTime;
        const effectiveSpeed = sim.speed * sim.feedOverride;
        const interval = 16 / effectiveSpeed;

        if (delta >= interval) {
          const buffer = bufferRef.current!;
          const point = buffer.getPoint(sim.currentPoint);
          const axes = buffer.getAxes(sim.currentPoint);

          engineRef.current!.updateMachineAxes(axes);
          engineRef.current!.updateToolMarker(point.x, point.y, point.z);

          if (materialRemovalRef.current && engineRef.current) {
            const tipPos = engineRef.current.getToolTipPosition();
            materialRemovalRef.current.updateToolPosition(
              tipPos,
              new THREE.Vector3(0, -1, 0)
            );
          }

          if (buffer.hasMrrData) {
            sim.feedOverride = buffer.getFeedOverride(sim.currentPoint);
            sim.loadLevel = buffer.getLoadLevel(sim.currentPoint);
          } else {
            sim.feedOverride = 1.0;
            sim.loadLevel = 0;
          }

          sim.currentPoint++;
          if (sim.currentPoint % 5 === 0) {
            setCurrentPointIdx(sim.currentPoint);
            setCurrentFeedOverride(sim.feedOverride);
            setCurrentLoadLevel(sim.loadLevel);
          }
          sim.lastTime = time;
        }
      }

      if (sim.currentPoint >= sim.totalPoints && sim.isPlaying) {
        sim.isPlaying = false;
        setIsPlaying(false);
        setCurrentPointIdx(sim.totalPoints);
        setStatus("仿真完成");
      }

      rafRef.current = requestAnimationFrame(simulate);
    };

    rafRef.current = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setLoadProgress(0);
      setStatus("正在解析 G-code...");
      setMrrData(null);
      setOverrideData(null);
      setLoadLevelData(null);
      setMrrSummary(null);

      try {
        const content = await file.text();
        const info = await parseGCode(content);
        setToolpathInfo(info);

        if (info.num_points === 0) {
          setStatus("未生成刀位点");
          setLoading(false);
          return;
        }

        bufferRef.current = new ToolpathBuffer();

        if (engineRef.current) {
          engineRef.current.initToolpathLine(info.num_points);
        }

        workerRef.current?.postMessage({
          type: "load-toolpath",
          totalPoints: info.num_points,
        });
      } catch (err) {
        setStatus(`解析失败: ${err}`);
        setLoading(false);
      }
    },
    []
  );

  const handleAnalyzeMrr = useCallback(() => {
    if (!workerRef.current || !simRef.current.bufferReady) return;

    setIsAnalyzing(true);
    setStatus("MRR 分析中...");

    workerRef.current.postMessage({
      type: "analyze-mrr",
      config: mrrConfig,
    });
  }, [mrrConfig]);

  const togglePlay = useCallback(() => {
    const sim = simRef.current;
    if (sim.currentPoint >= sim.totalPoints) {
      sim.currentPoint = 0;
      setCurrentPointIdx(0);
    }
    sim.isPlaying = !sim.isPlaying;
    sim.lastTime = performance.now();
    setIsPlaying(sim.isPlaying);
    setStatus(sim.isPlaying ? "仿真运行中..." : "已暂停");
  }, []);

  const resetSimulation = useCallback(() => {
    simRef.current.currentPoint = 0;
    simRef.current.isPlaying = false;
    simRef.current.feedOverride = 1.0;
    simRef.current.loadLevel = 0;
    setCurrentPointIdx(0);
    setIsPlaying(false);
    setCurrentFeedOverride(1.0);
    setCurrentLoadLevel(0);
    if (materialRemovalRef.current) {
      materialRemovalRef.current.reset();
    }
    if (engineRef.current && bufferRef.current && bufferRef.current.loadedCount > 0) {
      const point = bufferRef.current.getPoint(0);
      const axes = bufferRef.current.getAxes(0);
      engineRef.current.updateMachineAxes(axes);
      engineRef.current.updateToolMarker(point.x, point.y, point.z);
    }
    setStatus("已重置");
  }, []);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSpeed = parseFloat(e.target.value);
      simRef.current.speed = newSpeed;
      setSpeed(newSpeed);
    },
    []
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value);
      simRef.current.currentPoint = idx;
      setCurrentPointIdx(idx);
      if (engineRef.current && bufferRef.current && idx < bufferRef.current.loadedCount) {
        const point = bufferRef.current.getPoint(idx);
        const axes = bufferRef.current.getAxes(idx);
        engineRef.current.updateMachineAxes(axes);
        engineRef.current.updateToolMarker(point.x, point.y, point.z);

        if (bufferRef.current.hasMrrData) {
          const fo = bufferRef.current.getFeedOverride(idx);
          const ll = bufferRef.current.getLoadLevel(idx);
          setCurrentFeedOverride(fo);
          setCurrentLoadLevel(ll);
          simRef.current.feedOverride = fo;
          simRef.current.loadLevel = ll;
        }
      }
    },
    []
  );

  const loadDemoToolpath = useCallback(async () => {
    setLoading(true);
    setLoadProgress(0);
    setStatus("生成演示刀轨...");

    const demoGCode = generateDemoGCode();
    const info = await parseGCode(demoGCode);
    setToolpathInfo(info);

    if (info.num_points === 0) {
      setStatus("未生成刀位点");
      setLoading(false);
      return;
    }

    bufferRef.current = new ToolpathBuffer();

    if (engineRef.current) {
      engineRef.current.initToolpathLine(info.num_points);
    }

    workerRef.current?.postMessage({
      type: "load-toolpath",
      totalPoints: info.num_points,
    });
  }, []);

  const totalPts = simRef.current.totalPoints;

  const overridePercent = (currentFeedOverride * 100).toFixed(0);
  const loadLevelColors: Record<number, string> = {
    0: "#22c55e",
    1: "#3b82f6",
    2: "#f59e0b",
    3: "#ef4444",
  };
  const loadLevelLabels: Record<number, string> = {
    0: "Low",
    1: "Normal",
    2: "High",
    3: "Critical",
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>CNC Toolpath Studio</h1>
        <div className="header-status-group">
          {mrrData && (
            <div className="override-indicator" style={{ borderColor: loadLevelColors[currentLoadLevel] || "#334155" }}>
              <span className="override-label">Feed Override</span>
              <span className="override-value" style={{ color: loadLevelColors[currentLoadLevel] || "#e2e8f0" }}>
                {overridePercent}%
              </span>
              <span className="load-label" style={{ color: loadLevelColors[currentLoadLevel] || "#94a3b8" }}>
                {loadLevelLabels[currentLoadLevel] || "N/A"}
              </span>
            </div>
          )}
          <span className="status-badge">{status}</span>
        </div>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="panel">
            <div className="panel-title">📁 File Load</div>
            <label className="file-upload-btn">
              <input type="file" accept=".nc,.txt,.gcode" onChange={handleFileUpload} disabled={loading} />
              {loading ? `加载中 ${loadProgress}%...` : "打开 G-code 文件"}
            </label>
            <button className="demo-btn" onClick={loadDemoToolpath} disabled={loading}>
              加载演示程序
            </button>
            {loading && (
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${loadProgress}%` }} />
              </div>
            )}
          </div>

          {toolpathInfo && (
            <div className="panel">
              <div className="panel-title">📊 Toolpath Info</div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">刀位点</span>
                  <span className="value">{toolpathInfo.num_points.toLocaleString()}</span>
                </div>
                <div className="info-item">
                  <span className="label">总行程</span>
                  <span className="value">{toolpathInfo.total_distance.toFixed(1)} mm</span>
                </div>
                <div className="info-item">
                  <span className="label">预计时间</span>
                  <span className="value">{(toolpathInfo.estimated_time / 60).toFixed(1)} min</span>
                </div>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-title">🎮 Simulation Control</div>
            <div className="control-group">
              <button className="control-btn play-btn" onClick={togglePlay} disabled={!simRef.current.bufferReady}>
                {isPlaying ? "⏸ 暂停" : "▶ 播放"}
              </button>
              <button className="control-btn" onClick={resetSimulation} disabled={!simRef.current.bufferReady}>
                ⟲ 重置
              </button>
            </div>

            <div className="slider-group">
              <label>速度: {speed.toFixed(1)}x{currentFeedOverride < 1.0 ? ` × ${currentFeedOverride.toFixed(2)} (MRR)` : ""}</label>
              <input
                type="range"
                min="0.1"
                max="10"
                step="0.1"
                value={speed}
                onChange={handleSpeedChange}
              />
            </div>

            {totalPts > 0 && (
              <div className="slider-group">
                <label>进度: {currentPointIdx.toLocaleString()} / {totalPts.toLocaleString()}</label>
                <input
                  type="range"
                  min="0"
                  max={totalPts - 1}
                  value={currentPointIdx}
                  onChange={handleSeek}
                />
              </div>
            )}
          </div>

          <ToolConfigPanel
            config={mrrConfig}
            onConfigChange={setMrrConfig}
            onAnalyze={handleAnalyzeMrr}
            summary={mrrSummary}
            isAnalyzing={isAnalyzing}
          />
        </aside>

        <main className="viewport">
          <div ref={canvasRef} className="canvas-container" />
          {mrrData && (
            <div className="mrr-chart-overlay">
              <MrrChart
                mrrData={mrrData}
                overrideData={overrideData}
                loadLevelData={loadLevelData}
                currentPoint={currentPointIdx}
                summary={mrrSummary}
                visibleRange={mrrChartRangeRef.current}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

function generateDemoGCode(): string {
  let code = "%\nO0001 (DEMO PROGRAM)\n";
  code += "G90 G54 G17\n";
  code += "S1000 M03\n";
  code += "G00 X-50 Y-50 Z50\n";
  code += "Z5\n";

  const radius = 40;
  const step = 2;
  for (let z = 0; z > -40; z -= step) {
    code += `G01 Z${z.toFixed(2)} F100\n`;
    for (let angle = 0; angle <= 360; angle += 5) {
      const rad = (angle * Math.PI) / 180;
      const x = radius * Math.cos(rad);
      const y = radius * Math.sin(rad);
      code += `G01 X${x.toFixed(3)} Y${y.toFixed(3)} A${(angle * 0.2).toFixed(2)} C${angle.toFixed(2)} F500\n`;
    }
  }

  code += "G00 Z50\n";
  code += "M05\n";
  code += "M30\n";
  code += "%\n";
  return code;
}

export default App;
