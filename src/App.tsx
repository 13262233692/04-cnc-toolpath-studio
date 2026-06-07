import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RenderEngine } from "./engine/RenderEngine";
import { MaterialRemovalSystem } from "./engine/MaterialRemoval";
import { ToolpathBuffer } from "./data/ToolpathBuffer";
import { parseGCode, getMachineConfig } from "./ipc";
import { ToolpathInfo, MachineConfig } from "./types";

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
  }>({
    isPlaying: false,
    currentPoint: 0,
    speed: 1,
    lastTime: 0,
    totalPoints: 0,
    bufferReady: false,
  });
  const rafRef = useRef<number>(0);

  const [toolpathInfo, setToolpathInfo] = useState<ToolpathInfo | null>(null);
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null);
  const [currentPointIdx, setCurrentPointIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [status, setStatus] = useState<string>("就绪");

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
        const interval = 16 / sim.speed;

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

          sim.currentPoint++;
          if (sim.currentPoint % 5 === 0) {
            setCurrentPointIdx(sim.currentPoint);
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
    setCurrentPointIdx(0);
    setIsPlaying(false);
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

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>CNC Toolpath Studio</h1>
        <span className="status-badge">{status}</span>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <div className="panel">
            <h3>文件加载</h3>
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
              <h3>刀轨信息</h3>
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
            <h3>仿真控制</h3>
            <div className="control-group">
              <button className="control-btn play-btn" onClick={togglePlay} disabled={!simRef.current.bufferReady}>
                {isPlaying ? "⏸ 暂停" : "▶ 播放"}
              </button>
              <button className="control-btn" onClick={resetSimulation} disabled={!simRef.current.bufferReady}>
                ⟲ 重置
              </button>
            </div>

            <div className="slider-group">
              <label>速度: {speed.toFixed(1)}x</label>
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

          {machineConfig && (
            <div className="panel">
              <h3>机床参数</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="label">A轴范围</span>
                  <span className="value">{machineConfig.a_axis_min}° ~ {machineConfig.a_axis_max}°</span>
                </div>
                <div className="info-item">
                  <span className="label">C轴范围</span>
                  <span className="value">{machineConfig.c_axis_min}° ~ {machineConfig.c_axis_max}°</span>
                </div>
                <div className="info-item">
                  <span className="label">X/Y/Z行程</span>
                  <span className="value">{machineConfig.x_travel}/{machineConfig.y_travel}/{machineConfig.z_travel}</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        <main className="viewport">
          <div ref={canvasRef} className="canvas-container" />
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
