import * as THREE from "three";
import { MachineConfig, MachineAxes } from "../types";

export class FiveAxisMachine {
  public group: THREE.Group;
  private base: THREE.Mesh;
  private column: THREE.Mesh;
  private saddle: THREE.Mesh;
  private spindleHead: THREE.Mesh;
  private cAxisGroup: THREE.Group;
  private aAxisGroup: THREE.Group;
  private tool: THREE.Mesh;
  private table: THREE.Mesh;
  private workpiece: THREE.Mesh;
  private config: MachineConfig;

  constructor(config: MachineConfig) {
    this.config = config;
    this.group = new THREE.Group();

    const baseGeo = new THREE.BoxGeometry(400, 100, 500);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      metalness: 0.5,
      roughness: 0.7,
    });
    this.base = new THREE.Mesh(baseGeo, baseMat);
    this.base.position.y = -50;
    this.base.castShadow = true;
    this.base.receiveShadow = true;
    this.group.add(this.base);

    const tableGeo = new THREE.BoxGeometry(300, 30, 350);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x718096,
      metalness: 0.6,
      roughness: 0.5,
    });
    this.table = new THREE.Mesh(tableGeo, tableMat);
    this.table.position.set(0, 20, 0);
    this.table.castShadow = true;
    this.table.receiveShadow = true;
    this.group.add(this.table);

    const workpieceGeo = new THREE.BoxGeometry(150, 80, 150);
    const workpieceMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.3,
      roughness: 0.8,
    });
    this.workpiece = new THREE.Mesh(workpieceGeo, workpieceMat);
    this.workpiece.position.set(0, 75, 0);
    this.workpiece.castShadow = true;
    this.workpiece.receiveShadow = true;
    this.group.add(this.workpiece);

    const columnGeo = new THREE.BoxGeometry(80, 400, 100);
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0x2d3748,
      metalness: 0.5,
      roughness: 0.6,
    });
    this.column = new THREE.Mesh(columnGeo, columnMat);
    this.column.position.set(250, 200, 0);
    this.column.castShadow = true;
    this.column.receiveShadow = true;
    this.group.add(this.column);

    const saddleGeo = new THREE.BoxGeometry(60, 120, 80);
    const saddleMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      metalness: 0.6,
      roughness: 0.5,
    });
    this.saddle = new THREE.Mesh(saddleGeo, saddleMat);
    this.saddle.position.set(250, 200, 0);
    this.saddle.castShadow = true;
    this.saddle.receiveShadow = true;
    this.group.add(this.saddle);

    this.cAxisGroup = new THREE.Group();
    this.cAxisGroup.position.set(250, 200, 0);
    this.group.add(this.cAxisGroup);

    this.aAxisGroup = new THREE.Group();
    this.cAxisGroup.add(this.aAxisGroup);

    const spindleGeo = new THREE.CylinderGeometry(25, 35, 80, 32);
    const spindleMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      metalness: 0.7,
      roughness: 0.4,
    });
    this.spindleHead = new THREE.Mesh(spindleGeo, spindleMat);
    this.spindleHead.rotation.x = Math.PI / 2;
    this.spindleHead.castShadow = true;
    this.spindleHead.receiveShadow = true;
    this.aAxisGroup.add(this.spindleHead);

    const toolGeo = new THREE.CylinderGeometry(6, 10, config.tool_length, 16);
    const toolMat = new THREE.MeshStandardMaterial({
      color: 0xf6e05e,
      metalness: 0.8,
      roughness: 0.3,
    });
    this.tool = new THREE.Mesh(toolGeo, toolMat);
    this.tool.position.y = -config.tool_length / 2 - 40;
    this.tool.castShadow = true;
    this.aAxisGroup.add(this.tool);
  }

  public updateAxes(axes: MachineAxes): void {
    this.saddle.position.y = 200 + axes.z;
    this.saddle.position.x = 250 + axes.x;
    this.cAxisGroup.position.set(250 + axes.x, 200 + axes.z, axes.y);

    this.cAxisGroup.rotation.z = THREE.MathUtils.degToRad(axes.c);
    this.aAxisGroup.rotation.x = THREE.MathUtils.degToRad(axes.a);

    const pivotOffset = this.config.pivot_distance;
    const aRad = THREE.MathUtils.degToRad(axes.a);
    const cRad = THREE.MathUtils.degToRad(axes.c);

    const offsetX = pivotOffset * Math.sin(cRad) * Math.sin(aRad);
    const offsetY = -pivotOffset * Math.cos(cRad) * Math.sin(aRad);
    const offsetZ = -pivotOffset * Math.cos(aRad);

    this.aAxisGroup.position.set(offsetX, offsetZ, offsetY);
  }

  public getWorkpiece(): THREE.Mesh {
    return this.workpiece;
  }

  public getToolTipWorldPosition(): THREE.Vector3 {
    const toolTip = new THREE.Vector3(0, -this.config.tool_length - 40, 0);
    this.tool.localToWorld(toolTip);
    return toolTip;
  }

  public setWorkpieceMaterial(material: THREE.Material): void {
    this.workpiece.material = material;
  }
}
