import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FiveAxisMachine } from "./MachineModel";
import { MachineConfig, MachineAxes } from "../types";

export class RenderEngine {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private container: HTMLElement;
  private machine: FiveAxisMachine;
  private toolpathLine: THREE.Line | null = null;
  private currentToolpoint: THREE.Mesh | null = null;
  private animationId: number | null = null;
  private boundsHelper: THREE.Box3Helper | null = null;
  private toolpathPositions: Float32Array | null = null;

  constructor(container: HTMLElement, config: MachineConfig) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(600, 400, 600);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2;

    this.setupLighting();
    this.setupGrid();

    this.machine = new FiveAxisMachine(config);
    this.scene.add(this.machine.group);

    this.addAxesHelper();

    window.addEventListener("resize", this.handleResize);
    this.animate();
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 800, 500);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 5000;
    dirLight.shadow.camera.left = -1000;
    dirLight.shadow.camera.right = 1000;
    dirLight.shadow.camera.top = 1000;
    dirLight.shadow.camera.bottom = -1000;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-500, 300, -500);
    this.scene.add(fillLight);
  }

  private setupGrid(): void {
    const grid = new THREE.GridHelper(1000, 50, 0x444444, 0x333333);
    grid.position.y = -5;
    this.scene.add(grid);

    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x16213e,
      transparent: true,
      opacity: 0.8,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -50;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private addAxesHelper(): void {
    const axesHelper = new THREE.AxesHelper(200);
    this.scene.add(axesHelper);
  }

  public initToolpathLine(totalPoints: number): void {
    if (this.toolpathLine) {
      this.scene.remove(this.toolpathLine);
      this.toolpathLine.geometry.dispose();
    }
    if (this.currentToolpoint) {
      this.scene.remove(this.currentToolpoint);
    }

    this.toolpathPositions = new Float32Array(totalPoints * 3);

    const geometry = new THREE.BufferGeometry();
    const attr = new THREE.BufferAttribute(this.toolpathPositions, 3);
    attr.setUsage(THREE.DynamicDrawUsage);
    attr.updateRange = { offset: 0, count: 0 };
    geometry.setAttribute("position", attr);
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.8,
    });

    this.toolpathLine = new THREE.Line(geometry, material);
    this.scene.add(this.toolpathLine);

    const sphereGeo = new THREE.SphereGeometry(5, 16, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    this.currentToolpoint = new THREE.Mesh(sphereGeo, sphereMat);
    this.scene.add(this.currentToolpoint);
  }

  public appendToolpathPositions(positions: Float32Array, pointOffset: number): void {
    if (!this.toolpathLine || !this.toolpathPositions) return;

    const destOffset = pointOffset * 3;
    this.toolpathPositions.set(positions, destOffset);

    const totalVisible = pointOffset + positions.length / 3;

    const attr = this.toolpathLine.geometry.getAttribute("position") as THREE.BufferAttribute;
    attr.updateRange = { offset: 0, count: totalVisible * 3 };
    attr.needsUpdate = true;
    this.toolpathLine.geometry.setDrawRange(0, totalVisible);
  }

  public updateMachineAxes(axes: MachineAxes): void {
    this.machine.updateAxes(axes);
  }

  public updateToolMarker(x: number, y: number, z: number): void {
    if (this.currentToolpoint) {
      this.currentToolpoint.position.set(x, z, y);
    }
  }

  public showBounds(min: THREE.Vector3, max: THREE.Vector3): void {
    if (this.boundsHelper) {
      this.scene.remove(this.boundsHelper);
    }
    const box = new THREE.Box3(min, max);
    this.boundsHelper = new THREE.Box3Helper(box, 0xffff00);
    this.scene.add(this.boundsHelper);
  }

  public getWorkpiece(): THREE.Mesh {
    return this.machine.getWorkpiece();
  }

  public setWorkpieceMaterial(material: THREE.Material): void {
    this.machine.setWorkpieceMaterial(material);
  }

  public getToolTipPosition(): THREE.Vector3 {
    return this.machine.getToolTipWorldPosition();
  }

  private handleResize = (): void => {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
    this.controls.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
