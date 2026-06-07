import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RenderEngine } from "./engine/RenderEngine";
import { MaterialRemovalSystem } from "./engine/MaterialRemoval";
import { parseGCode, getToolpathChunk, getMachineConfig } from "./ipc";
import { Toolpoint, ToolpathInfo, MachineConfig } from "./types";

const App: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<RenderEngine | null>(null);
  const materialRemovalRef = useRef<MaterialRemovalSystem | null>(null);
  const simulationRef = useRef<{
    isPlaying: boolean;
    currentPoint: number;
    speed: number;
    lastTime: number;
  }>({
    isPlaying: false,
    currentPoint: 0,
    speed: 1,
    lastTime: 0,
  });

  const [toolpathInfo, setToolpathInfo] = useState<ToolpathInfo | null>(null);
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null);
  const [toolpath, setToolpath] = useState<Toolpoint[]>([]);
  const [currentPointIdx, setCurrentPointIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
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
    };

    init();

    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
      }
      if (materialRemovalRef.current) {
        materialRemovalRef.current.dispose();
      }
    };
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setLoading(true);
      setStatus("正在解析 G-code...");

      try {
        const content = await file.text();
        const info = await parseGCode(content);
        setToolpathInfo(info);

        const chunkSize = 10000;
        const allPoints: Toolpoint[] = [];
        let offset = 0;

        while (offset < info.num_points) {
          const chunk = await getToolpathChunk(offset, chunkSize);
          allPoints.push(...chunk);
          offset += chunk.length;
          setStatus(`加载刀轨点... ${offset}/${info.num_points}`);
        }

        setToolpath(allPoints);
        if (engineRef.current && allPoints.length > 0) {
          engineRef.current.displayToolpath(allPoints);
          simulationRef.current.currentPoint = 0;
          setCurrentPointIdx(0);
        }

        setStatus(`解析完成 - 共 ${info.num_points} 个刀位点`);
      } catch (err) {
        setStatus(`解析失败: ${err}`);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!engineRef.current || toolpath.length === 0) return;

    const simulate = (time: number) => {
      const sim = simulationRef.current;

      if (sim.isPlaying && sim.currentPoint < toolpath.length) {
        const delta = time - sim.lastTime;
        if (delta > 16 / sim.speed) {
          const point = toolpath[sim.currentPoint];
          engineRef.current?.updateToolPosition(point);

          if (materialRemovalRef.current && engineRef.current) {
            const tipPos = engineRef.current.getToolTipPosition();
            materialRemovalRef.current.updateToolPosition(
              tipPos,
              new THREE.Vector3(0, -1, 0)
            );
          }

          sim.currentPoint++;
          setCurrentPointIdx(sim.currentPoint);
          sim.lastTime = time;
        }
      }

      if (sim.currentPoint >= toolpath.length && sim.isPlaying) {
        sim.isPlaying = false;
        setIsPlaying(false);
        setStatus("仿真完成");
      }

      requestAnimationFrame(simulate);
    };

    const id = requestAnimationFrame(simulate);
    return () => cancelAnimationFrame(id);
  }, [toolpath]);

  const togglePlay = useCallback(() => {
    const sim = simulationRef.current;
    if (sim.currentPoint >= toolpath.length) {
      sim.currentPoint = 0;
      setCurrentPointIdx(0);
    }
    sim.isPlaying = !sim.isPlaying;
    setIsPlaying(sim.isPlaying);
    setStatus(sim.isPlaying ? "仿真运行中..." : "已暂停");
  }, [toolpath.length]);

  const resetSimulation = useCallback(() => {
    simulationRef.current.currentPoint = 0;
    simulationRef.current.isPlaying = false;
    setCurrentPointIdx(0);
    setIsPlaying(false);
    if (engineRef.current && toolpath.length > 0) {
      engineRef.current.updateToolPosition(toolpath[0]);
    }
    if (materialRemovalRef.current) {
      materialRemovalRef.current.reset();
    }
    setStatus("已重置");
  }, [toolpath]);

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newSpeed = parseFloat(e.target.value);
      simulationRef.current.speed = newSpeed;
      setSpeed(newSpeed);
    },
    []
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value);
      simulationRef.current.currentPoint = idx;
      setCurrentPointIdx(idx);
      if (engineRef.current && toolpath[idx]) {
        engineRef.current.updateToolPosition(toolpath[idx]);
      }
    },
    [toolpath]
  );

  const loadDemoToolpath = useCallback(async () => {
    setLoading(true);
    setStatus("生成演示刀轨...");

    const demoGCode = generateDemoGCode();
    const info = await parseGCode(demoGCode);
    setToolpathInfo(info);

    const allPoints: Toolpoint[] = [];
    let offset = 0;
    const chunkSize = 10000;

    while (offset < info.num_points) {
      const chunk = await getToolpathChunk(offset, chunkSize);
      allPoints.push(...chunk);
      offset += chunk.length;
    }

    setToolpath(allPoints);
    if (engineRef.current && allPoints.length > 0) {
      engineRef.current.displayToolpath(allPoints);
      engineRef.current.updateToolPosition(allPoints[0]);
    }

    setLoading(false);
    setStatus(`演示刀轨已加载 - ${info.num_points} 点`);
  }, []);

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
              {loading ? "加载中..." : "打开 G-code 文件"}
            </label>
            <button className="demo-btn" onClick={loadDemoToolpath} disabled={loading}>
              加载演示程序
            </button>
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
              <button className="control-btn play-btn" onClick={togglePlay} disabled={toolpath.length === 0}>
                {isPlaying ? "⏸ 暂停" : "▶ 播放"}
              </button>
              <button className="control-btn" onClick={resetSimulation} disabled={toolpath.length === 0}>
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

            {toolpath.length > 0 && (
              <div className="slider-group">
                <label>进度: {currentPointIdx} / {toolpath.length}</label>
                <input
                  type="range"
                  min="0"
                  max={toolpath.length - 1}
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
