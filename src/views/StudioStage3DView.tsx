import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Camera,
  Maximize2,
  Minimize2,
} from 'lucide-react';

type CameraPreset = 'hero' | 'turntable' | 'violin' | 'vocal';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  hero: { label: 'Stage Overview', pos: [5.4, 3.1, 6.2], target: [0, 0.85, 0] },
  turntable: { label: 'Gold Turntable', pos: [-2.4, 2.35, 3.3], target: [-1.15, 0.55, 0.35] },
  violin: { label: 'Acoustic Violin', pos: [1.9, 2.1, 3.2], target: [0.05, 1.35, -0.35] },
  vocal: { label: 'Vocal Booth', pos: [3.2, 2.3, 2.1], target: [1.55, 1.35, 0.25] },
};

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const str = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || ''
    );
    return /SwiftShader|llvmpipe|Software|Mesa/i.test(str);
  } catch {
    return false;
  }
}

function createSoftContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createVinylGrooveTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.fillStyle = '#080B14';
    ctx.fillRect(0, 0, size, size);
    for (let r = 86; r < 248; r += 3) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = r % 9 === 0 ? 'rgba(0, 168, 255, 0.14)' : 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Gold center label
    const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 82);
    grad.addColorStop(0, '#F5D58A');
    grad.addColorStop(0.65, '#D4AF37');
    grad.addColorStop(1, '#8C6218');
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner dark ring
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.strokeStyle = '#030509';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.max(1, maxAnisotropy);
  return tex;
}

export const StudioStage3DView: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPreset>('hero');
  const [dockOpen, setDockOpen] = useState(true);
  const [cinemaMode, setCinemaMode] = useState(false);

  const isPlayingRef = useRef(isPlaying);
  const autoOrbitRef = useRef(autoOrbit);
  const targetCameraPosRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.hero.pos));
  const targetLookAtRef = useRef(new THREE.Vector3(...CAMERA_PRESETS.hero.target));
  const transitioningRef = useRef(false);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  const applyPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    const cfg = CAMERA_PRESETS[preset];
    targetCameraPosRef.current.set(...cfg.pos);
    targetLookAtRef.current.set(...cfg.target);
    transitioningRef.current = true;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 960;
    const height = container.clientHeight || 580;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareGl = detectSoftwareWebGL(renderer);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Scene + Horizon-Matched Fog
    const scene = new THREE.Scene();
    const bgColor = new THREE.Color('#020817');
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2('#020817', 0.042);

    // PMREM RoomEnvironment for metallic PBR gold & steel reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 80);
    camera.position.set(...CAMERA_PRESETS.hero.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 2.4;
    controls.maxDistance = 14;
    controls.target.set(...CAMERA_PRESETS.hero.target);
    controls.update();

    const cancelTransition = () => {
      transitioningRef.current = false;
    };
    controls.addEventListener('start', cancelTransition);

    // Lighting: warm golden key + cool electric-blue sky fill + rim highlight
    const hemiLight = new THREE.HemisphereLight('#78B8FF', '#081226', 0.8);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFE4B0', 2.4);
    keyLight.position.set(5.5, 9.5, 6.0);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 25;
      const d = 6;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const blueRimLight = new THREE.DirectionalLight('#00A8FF', 1.45);
    blueRimLight.position.set(-6.5, 4.5, -5.5);
    scene.add(blueRimLight);

    const stageAccentPoint = new THREE.PointLight('#00D5FF', 2.2, 12, 2);
    stageAccentPoint.position.set(0, 2.2, 1.8);
    scene.add(stageAccentPoint);

    // Reusable Materials (varied roughness & metalness)
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#D4AF37',
      metalness: 0.92,
      roughness: 0.22,
      envMapIntensity: 0.95,
    });
    const champagneGoldMat = new THREE.MeshStandardMaterial({
      color: '#F5D58A',
      metalness: 0.88,
      roughness: 0.18,
      envMapIntensity: 1.0,
    });
    const obsidianMat = new THREE.MeshStandardMaterial({
      color: '#0A1326',
      metalness: 0.25,
      roughness: 0.42,
      envMapIntensity: 0.8,
    });
    const matteStageMat = new THREE.MeshStandardMaterial({
      color: '#050C1C',
      metalness: 0.12,
      roughness: 0.78,
      envMapIntensity: 0.65,
    });
    const woodViolinMat = new THREE.MeshPhysicalMaterial({
      color: '#5C2611',
      metalness: 0.08,
      roughness: 0.28,
      clearcoat: 0.9,
      clearcoatRoughness: 0.15,
      envMapIntensity: 0.9,
    });
    const electricEmissiveMat = new THREE.MeshStandardMaterial({
      color: '#00A8FF',
      emissive: '#00D5FF',
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.25,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: '#D7E2F0',
      metalness: 0.94,
      roughness: 0.16,
      envMapIntensity: 1.0,
    });

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableTextures: THREE.Texture[] = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      disposableGeometries.push(g);
      return g;
    };

    // Studio Ground Plane & Soft Contact Shadow
    const floorGeo = trackGeo(new THREE.CircleGeometry(28, 64));
    const floorMesh = new THREE.Mesh(floorGeo, matteStageMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const contactTex = createSoftContactShadowTexture();
    disposableTextures.push(contactTex);
    const contactMat = new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      depthWrite: false,
    });
    const contactPlane = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(9.2, 9.2)), contactMat);
    contactPlane.rotation.x = -Math.PI / 2;
    contactPlane.position.y = 0.005;
    scene.add(contactPlane);

    // =========================================================================
    // COMPOSITE STAGE GROUP (BOTTOM-CENTER PIVOT FLUSH AT Y = 0)
    // =========================================================================
    const stageRoot = new THREE.Group();
    scene.add(stageRoot);

    // 1. Stepped Acoustic Dais
    const lowerDais = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(3.45, 3.65, 0.22, 64)),
      obsidianMat
    );
    lowerDais.position.y = 0.11;
    lowerDais.receiveShadow = true;
    lowerDais.castShadow = true;
    stageRoot.add(lowerDais);

    const upperDais = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(2.95, 3.08, 0.16, 64)),
      obsidianMat
    );
    upperDais.position.y = 0.30;
    upperDais.receiveShadow = true;
    upperDais.castShadow = true;
    stageRoot.add(upperDais);

    const goldDaisTrim = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(3.01, 0.032, 16, 96)),
      goldMat
    );
    goldDaisTrim.rotation.x = Math.PI / 2;
    goldDaisTrim.position.y = 0.38;
    stageRoot.add(goldDaisTrim);

    const electricDaisRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(3.52, 0.024, 16, 96)),
      electricEmissiveMat
    );
    electricDaisRing.rotation.x = Math.PI / 2;
    electricDaisRing.position.y = 0.21;
    stageRoot.add(electricDaisRing);

    // =========================================================================
    // 2. COMPOSITE GOLD & OBSIDIAN VINYL TURNTABLE (LEFT STAGE)
    // =========================================================================
    const turntableGroup = new THREE.Group();
    turntableGroup.position.set(-1.15, 0.38, 0.35);
    turntableGroup.rotation.y = 0.32;
    stageRoot.add(turntableGroup);

    const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.65, 0.16, 1.32)), obsidianMat);
    plinth.position.y = 0.08;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    turntableGroup.add(plinth);

    const plinthTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.69, 0.025, 1.36)), goldMat);
    plinthTrim.position.y = 0.15;
    turntableGroup.add(plinthTrim);

    // Spinning Platter + Vinyl Record
    const platterGroup = new THREE.Group();
    platterGroup.position.set(-0.14, 0.17, 0);
    turntableGroup.add(platterGroup);

    const platterBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.56, 0.58, 0.06, 48)),
      goldMat
    );
    platterBase.position.y = 0.03;
    platterBase.castShadow = true;
    platterGroup.add(platterBase);

    const vinylTex = createVinylGrooveTexture(renderer.capabilities.getMaxAnisotropy());
    disposableTextures.push(vinylTex);
    const vinylTopMat = new THREE.MeshStandardMaterial({
      map: vinylTex,
      roughness: 0.26,
      metalness: 0.35,
      envMapIntensity: 0.9,
    });
    const vinylDisc = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.54, 0.54, 0.016, 48)),
      vinylTopMat
    );
    vinylDisc.position.y = 0.068;
    platterGroup.add(vinylDisc);

    const spindle = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 16)),
      chromeMat
    );
    spindle.position.y = 0.095;
    platterGroup.add(spindle);

    // Tonearm Assembly
    const tonearmBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.12, 24)),
      champagneGoldMat
    );
    tonearmBase.position.set(0.62, 0.22, -0.36);
    turntableGroup.add(tonearmBase);

    const tonearmPivot = new THREE.Group();
    tonearmPivot.position.set(0.62, 0.29, -0.36);
    turntableGroup.add(tonearmPivot);

    const tonearmRod = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.78, 12)),
      chromeMat
    );
    tonearmRod.rotation.x = Math.PI / 2;
    tonearmRod.position.set(-0.08, 0, 0.32);
    tonearmRod.rotation.z = 0.24;
    tonearmPivot.add(tonearmRod);

    const headshell = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.08, 0.04, 0.14)),
      champagneGoldMat
    );
    headshell.position.set(-0.18, -0.02, 0.69);
    headshell.rotation.y = 0.3;
    tonearmPivot.add(headshell);

    const counterweight = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.048, 0.048, 0.09, 18)),
      goldMat
    );
    counterweight.rotation.x = Math.PI / 2;
    counterweight.position.set(0.02, 0, -0.1);
    tonearmPivot.add(counterweight);

    // =========================================================================
    // 3. SCULPTED ACOUSTIC VIOLIN EMBLEM ON DISPLAY STAND (CENTER BACK)
    // =========================================================================
    const violinStandGroup = new THREE.Group();
    violinStandGroup.position.set(0.05, 0.38, -0.45);
    stageRoot.add(violinStandGroup);

    const standPedestal = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 32)),
      obsidianMat
    );
    standPedestal.position.y = 0.06;
    standPedestal.castShadow = true;
    violinStandGroup.add(standPedestal);

    const standStem = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.028, 0.036, 0.62, 16)),
      goldMat
    );
    standStem.position.y = 0.42;
    violinStandGroup.add(standStem);

    // Extruded Violin Body Silhouette
    const violinGroup = new THREE.Group();
    violinGroup.position.set(0, 1.08, 0.06);
    violinGroup.rotation.x = -0.14;
    violinStandGroup.add(violinGroup);

    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(0, -0.58);
    bodyShape.bezierCurveTo(0.38, -0.58, 0.44, -0.22, 0.24, -0.05);
    bodyShape.bezierCurveTo(0.14, 0.02, 0.15, 0.14, 0.26, 0.22);
    bodyShape.bezierCurveTo(0.36, 0.35, 0.31, 0.56, 0, 0.58);
    bodyShape.bezierCurveTo(-0.31, 0.56, -0.36, 0.35, -0.26, 0.22);
    bodyShape.bezierCurveTo(-0.15, 0.14, -0.14, 0.02, -0.24, -0.05);
    bodyShape.bezierCurveTo(-0.44, -0.22, -0.38, -0.58, 0, -0.58);

    const violinBodyGeo = trackGeo(
      new THREE.ExtrudeGeometry(bodyShape, {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.028,
        bevelSize: 0.024,
        bevelSegments: 4,
        curveSegments: 24,
      })
    );
    violinBodyGeo.center();

    const violinBodyMesh = new THREE.Mesh(violinBodyGeo, woodViolinMat);
    violinBodyMesh.castShadow = true;
    violinGroup.add(violinBodyMesh);

    const violinNeck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.085, 0.68, 0.055)),
      obsidianMat
    );
    violinNeck.position.set(0, 0.84, 0.02);
    violinGroup.add(violinNeck);

    const violinScroll = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.058, 0.024, 12, 24)),
      champagneGoldMat
    );
    violinScroll.position.set(0, 1.22, 0.02);
    violinGroup.add(violinScroll);

    const bridgeMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.16, 0.032, 0.07)),
      champagneGoldMat
    );
    bridgeMesh.position.set(0, -0.14, 0.095);
    violinGroup.add(bridgeMesh);

    const tailpieceMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.11, 0.28, 0.03)),
      obsidianMat
    );
    tailpieceMesh.position.set(0, -0.38, 0.092);
    violinGroup.add(tailpieceMesh);

    // 4 Golden Violin Strings
    for (let s = 0; s < 4; s++) {
      const offsetX = -0.024 + s * 0.016;
      const stringMesh = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.004, 0.004, 1.38, 8)),
        champagneGoldMat
      );
      stringMesh.position.set(offsetX, 0.34, 0.105);
      violinGroup.add(stringMesh);
    }

    // Golden Halo Emblem Ring behind Violin
    const emblemHalo = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.95, 0.024, 16, 72)),
      goldMat
    );
    emblemHalo.position.set(0, 1.26, -0.16);
    violinStandGroup.add(emblemHalo);

    // =========================================================================
    // 4. STUDIO CONDENSER MICROPHONE ON GOLD BOOM STAND (RIGHT STAGE)
    // =========================================================================
    const micGroup = new THREE.Group();
    micGroup.position.set(1.55, 0.38, 0.25);
    micGroup.rotation.y = -0.55;
    stageRoot.add(micGroup);

    const micBase = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 0.07, 32)),
      obsidianMat
    );
    micBase.position.y = 0.035;
    micBase.castShadow = true;
    micGroup.add(micBase);

    const micPole = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.022, 0.026, 1.48, 16)),
      chromeMat
    );
    micPole.position.y = 0.78;
    micPole.castShadow = true;
    micGroup.add(micPole);

    const micCollar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16)),
      goldMat
    );
    micCollar.position.y = 1.48;
    micGroup.add(micCollar);

    const shockMountRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.14, 0.015, 12, 32)),
      goldMat
    );
    shockMountRing.position.set(0, 1.66, 0.08);
    shockMountRing.rotation.x = Math.PI / 2;
    micGroup.add(shockMountRing);

    const micBody = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.082, 0.076, 0.34, 24)),
      obsidianMat
    );
    micBody.position.set(0, 1.68, 0.08);
    micBody.castShadow = true;
    micGroup.add(micBody);

    const micGrille = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.084, 0.12, 12, 24)),
      champagneGoldMat
    );
    micGrille.position.set(0, 1.9, 0.08);
    micGroup.add(micGrille);

    const popFilterArm = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.14, 0.012, 10, 32)),
      electricEmissiveMat
    );
    popFilterArm.position.set(0, 1.86, 0.32);
    micGroup.add(popFilterArm);

    // =========================================================================
    // 5. 64-BAR RADIAL ELECTRIC-BLUE SPECTRUM RING (INSTANCED MESH)
    // =========================================================================
    const BAR_COUNT = 64;
    const barGeo = trackGeo(new THREE.BoxGeometry(0.075, 1, 0.11));
    const barMat = new THREE.MeshStandardMaterial({
      color: '#00A8FF',
      emissive: '#0092E6',
      emissiveIntensity: 0.95,
      metalness: 0.35,
      roughness: 0.25,
    });
    const spectrumMesh = new THREE.InstancedMesh(barGeo, barMat, BAR_COUNT);
    spectrumMesh.frustumCulled = false;
    stageRoot.add(spectrumMesh);

    const scratchObj = new THREE.Object3D();
    const spectrumRadius = 3.24;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // ResizeObserver for clean responsive sizing
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(200, Math.floor(entry.contentRect.width));
        const h = Math.max(260, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Animation Loop (software-GL safe pacing via WebGL2 fenceSync + 80ms rest)
    let rafId = 0;
    let timerId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;

    const afterDraw = (fn: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              timerId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              timerId = window.setTimeout(fn, 80);
            }
          };
          timerId = window.setTimeout(poll, 5);
        } else {
          timerId = window.setTimeout(fn, 80);
        }
      } else {
        rafId = window.requestAnimationFrame(fn);
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (isPlayingRef.current) {
        elapsed += dt;
        platterGroup.rotation.y -= dt * 1.45;
        tonearmPivot.rotation.y = 0.28 + Math.sin(elapsed * 0.7) * 0.015;
        emblemHalo.rotation.z = Math.sin(elapsed * 0.6) * 0.08;
        violinGroup.position.y = 1.08 + Math.sin(elapsed * 1.3) * 0.025;
      } else {
        const armDamp = 1 - Math.exp(-4.5 * dt);
        tonearmPivot.rotation.y += (0.04 - tonearmPivot.rotation.y) * armDamp;
      }

      if (autoOrbitRef.current && !transitioningRef.current) {
        stageRoot.rotation.y += dt * 0.16;
      }

      if (transitioningRef.current) {
        const lerpAlpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(targetCameraPosRef.current, lerpAlpha);
        controls.target.lerp(targetLookAtRef.current, lerpAlpha);
        if (
          camera.position.distanceTo(targetCameraPosRef.current) < 0.04 &&
          controls.target.distanceTo(targetLookAtRef.current) < 0.04
        ) {
          transitioningRef.current = false;
        }
      }

      // Update 64-bar radial spectrum (zero per-frame heap allocations)
      for (let i = 0; i < BAR_COUNT; i++) {
        const angle = (i / BAR_COUNT) * Math.PI * 2;
        const wave = isPlayingRef.current
          ? 0.22 +
            0.34 * Math.abs(Math.sin(elapsed * 3.2 + i * 0.35)) +
            0.22 * Math.abs(Math.cos(elapsed * 1.9 - i * 0.22))
          : 0.14 + 0.05 * Math.sin(i * 0.4);

        scratchObj.position.set(
          Math.cos(angle) * spectrumRadius,
          0.22 + wave * 0.5,
          Math.sin(angle) * spectrumRadius
        );
        scratchObj.rotation.set(0, -angle, 0);
        scratchObj.scale.set(1, wave, 1);
        scratchObj.updateMatrix();
        spectrumMesh.setMatrixAt(i, scratchObj.matrix);
      }
      spectrumMesh.instanceMatrix.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', cancelTransition);
      controls.dispose();
      envTarget.dispose();
      disposableGeometries.forEach((g) => g.dispose());
      disposableTextures.forEach((t) => t.dispose());
      goldMat.dispose();
      champagneGoldMat.dispose();
      obsidianMat.dispose();
      matteStageMat.dispose();
      woodViolinMat.dispose();
      electricEmissiveMat.dispose();
      chromeMat.dispose();
      contactMat.dispose();
      vinylTopMat.dispose();
      barMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={cinemaMode ? 'fixed inset-0 z-50 bg-[#020817]' : 'space-y-4'}>
      {!cinemaMode && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#00D5FF]">
              Music High Sky · Interactive 3D Showcase
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient mt-1">
              3D Acoustic Studio Stage
            </h1>
          </div>
          <p className="text-xs text-[#8D9AAA]">
            Drag to orbit · Scroll to zoom · Select camera angles below
          </p>
        </div>
      )}

      {/* Full-Bleed WebGL Canvas Stage (NO backdrop-blur over WebGL!) */}
      <div
        className={`relative w-full overflow-hidden border border-[#D4AF37]/30 bg-[#020817] ${
          cinemaMode ? 'h-screen rounded-none border-0' : 'h-[72vh] min-h-[500px] rounded-2xl'
        }`}
      >
        <div ref={mountRef} className="w-full h-full" />

        {/* Single Compact Collapsible Bottom Control Dock (solid dark surface, NO backdrop-filter) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(94%,740px)]">
          <div className="rounded-xl bg-[#030509]/95 border border-[#D4AF37]/35 shadow-2xl overflow-hidden">
            <div className="px-4 py-2 flex items-center justify-between gap-3 border-b border-[#D4AF37]/15">
              <span className="text-[11px] font-display font-bold tracking-[0.14em] text-[#F5D58A] uppercase">
                Stage Deck Controls
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCinemaMode((v) => !v)}
                  className="px-2.5 py-1 rounded-md bg-[#06152E] border border-[#00A8FF]/35 text-[11px] text-[#00D5FF] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  {cinemaMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span>{cinemaMode ? 'Exit Fullscreen' : 'Cinema Mode'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDockOpen((o) => !o)}
                  aria-label="Toggle stage controls"
                  className="p-1 rounded-md text-[#C8D0DB] hover:text-[#F5D58A] cursor-pointer"
                >
                  {dockOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {dockOpen && (
              <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    className="btn-gold inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlaying ? 'Pause Deck' : 'Spin Deck'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoOrbit((o) => !o)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      autoOrbit
                        ? 'bg-[#00A8FF]/20 border-[#00D5FF]/60 text-[#00D5FF]'
                        : 'bg-[#06152E] border-[#D4AF37]/25 text-[#C8D0DB]'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Auto-Rotate
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-[#8D9AAA] mr-1" />
                  {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                        activePreset === key
                          ? 'bg-[#D4AF37] text-[#030509]'
                          : 'bg-[#06152E] text-[#C8D0DB] hover:text-white border border-[#D4AF37]/20'
                      }`}
                    >
                      {CAMERA_PRESETS[key].label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
