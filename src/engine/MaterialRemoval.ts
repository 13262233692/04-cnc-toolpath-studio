import * as THREE from "three";

const vertexShader = `
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vPosition = position;
    vNormal = normal;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  uniform vec3 uToolPosition;
  uniform float uToolRadius;
  uniform float uToolLength;
  uniform vec3 uToolDirection;
  uniform float uTime;
  uniform sampler2D uRemovedTexture;
  uniform vec2 uTextureSize;
  uniform bool uEnableRemoval;

  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
  }

  void main() {
    vec3 baseColor = vec3(0.85, 0.88, 0.92);
    vec3 machinedColor = vec3(0.65, 0.70, 0.78);

    float dist = 1e10;
    if (uEnableRemoval) {
      vec3 toP = vPosition - uToolPosition;
      vec3 dir = normalize(uToolDirection);
      float proj = dot(toP, dir);
      vec3 perp = toP - proj * dir;
      float perpDist = length(perp);

      if (proj >= -uToolLength * 0.5 && proj <= uToolLength * 0.5) {
        dist = perpDist - uToolRadius;
      } else if (proj < -uToolLength * 0.5) {
        vec3 endPt = uToolPosition - dir * uToolLength * 0.5;
        dist = length(vPosition - endPt) - uToolRadius;
      }
    }

    float intensity = 1.0;
    if (dist < 0.0) {
      intensity = clamp(dist / uToolRadius + 1.0, 0.0, 1.0);
    }

    vec2 texUV = vUv;
    float removed = texture2D(uRemovedTexture, texUV).r;
    float alpha = 0.95;

    if (dist < 0.0 || removed > 0.5) {
      baseColor = machinedColor;
      alpha = 0.7;
    }

    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
    float diff = max(dot(vNormal, lightDir), 0.0);
    float ambient = 0.3;
    vec3 color = baseColor * (ambient + diff * 0.7);

    if (dist < 1.0 && uEnableRemoval) {
      float glow = 1.0 - smoothstep(0.0, 1.0, dist);
      color += vec3(0.0, 0.8, 0.4) * glow * 0.3;
    }

    gl_FragColor = vec4(color, alpha);
  }
`;

export class MaterialRemovalSystem {
  private material: THREE.ShaderMaterial;
  private removedTexture: THREE.DataTexture;
  private textureSize: number = 512;

  constructor() {
    const data = new Uint8Array(this.textureSize * this.textureSize);
    this.removedTexture = new THREE.DataTexture(
      data,
      this.textureSize,
      this.textureSize,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    this.removedTexture.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uToolPosition: { value: new THREE.Vector3(0, 1000, 0) },
        uToolRadius: { value: 8.0 },
        uToolLength: { value: 50.0 },
        uToolDirection: { value: new THREE.Vector3(0, -1, 0) },
        uTime: { value: 0 },
        uRemovedTexture: { value: this.removedTexture },
        uTextureSize: { value: new THREE.Vector2(this.textureSize, this.textureSize) },
        uEnableRemoval: { value: true },
      },
      transparent: true,
      side: THREE.DoubleSide,
    });
  }

  public getMaterial(): THREE.ShaderMaterial {
    return this.material;
  }

  public updateToolPosition(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.material.uniforms.uToolPosition.value.copy(position);
    this.material.uniforms.uToolDirection.value.copy(direction);
    this.material.uniforms.uTime.value += 0.016;
  }

  public setToolRadius(radius: number): void {
    this.material.uniforms.uToolRadius.value = radius;
  }

  public setEnableRemoval(enabled: boolean): void {
    this.material.uniforms.uEnableRemoval.value = enabled;
  }

  public markRemoved(localPos: THREE.Vector3, radius: number): void {
    const data = this.removedTexture.image.data as unknown as Uint8Array;
    const u = Math.floor((localPos.x + 75) / 150 * this.textureSize);
    const v = Math.floor((localPos.z + 75) / 150 * this.textureSize);
    const texRadius = Math.ceil(radius / 150 * this.textureSize);

    for (let dy = -texRadius; dy <= texRadius; dy++) {
      for (let dx = -texRadius; dx <= texRadius; dx++) {
        const px = u + dx;
        const py = v + dy;
        if (px >= 0 && px < this.textureSize && py >= 0 && py < this.textureSize) {
          if (dx * dx + dy * dy <= texRadius * texRadius) {
            const idx = py * this.textureSize + px;
            data[idx] = 255;
          }
        }
      }
    }
    this.removedTexture.needsUpdate = true;
  }

  public reset(): void {
    const data = this.removedTexture.image.data as unknown as Uint8Array;
    data.fill(0);
    this.removedTexture.needsUpdate = true;
  }

  public dispose(): void {
    this.material.dispose();
    this.removedTexture.dispose();
  }
}
