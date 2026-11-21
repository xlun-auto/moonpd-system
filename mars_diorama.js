/**
 * MarketLens Intelligence — Astroneer-Inspired 3D Outpost Simulation (MARS-04)
 * Diegetic 3D World + Tether Power Grid + Interactive Stations + Smooth Camera Focus
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Html, Lightformer, OrbitControls, Sparkles } from '@react-three/drei';

const h = React.createElement;

const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' &&
  window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULT_GAME_STATE = {
  tracks: {
    'TRK-01': { id: 'TRK-01', name: '핵심업무', completed: 1, total: 3, rate: 0.33 },
    'TRK-02': { id: 'TRK-02', name: '일상루틴', completed: 1, total: 3, rate: 0.33 },
    'TRK-03': { id: 'TRK-03', name: '미래자산·이직', completed: 1, total: 3, rate: 0.33 },
    'TRK-04': { id: 'TRK-04', name: '건강·라이프', completed: 1, total: 3, rate: 0.33 },
  },
  stats: {
    level: 2,
    levelTitle: '개척 전초기지',
    bytes: 480,
    powerKw: 45,
    oxygenPct: 75,
    totalJobs: 0,
    savedJobs: 0,
  },
};

// Station 3D anchor coordinates on the 7.4 x 7.4 plateau
const STATION_ANCHORS = {
  'TRK-01': { pos: [-2.45, 0.02, -2.05], focus: [-1.8, 0.5, -1.5], pinPos: [-2.25, 2.35, -1.95], color: '#38bdf8' },
  'TRK-02': { pos: [0.3, 0.02, 2.65], focus: [0.2, 0.25, 1.8], pinPos: [0.2, 1.25, 2.65], color: '#fde047' },
  'TRK-03': { pos: [0, 0.02, 0], focus: [0, 0.45, 0], pinPos: [0, 2.25, 0], color: '#ff9f0a' },
  'TRK-04': { pos: [1.85, 0.02, 1.05], focus: [1.2, 0.35, 0.7], pinPos: [1.85, 1.45, 1.05], color: '#10b981' },
  radar_jobs: { pos: [2.55, 0.02, -1.95], focus: [1.8, 0.55, -1.3], pinPos: [2.55, 2.15, -1.95], color: '#60a5fa' },
  research_lab: { pos: [-2.55, 0.02, 1.75], focus: [-1.8, 0.45, 1.2], pinPos: [-2.55, 1.75, 1.75], color: '#a78bfa' },
  warroom_hub: { pos: [-0.2, 0.02, -2.65], focus: [-0.1, 0.45, -1.8], pinPos: [-0.2, 1.95, -2.65], color: '#fb7185' },
};

/* ============================================================================
   0. Smooth Astroneer Camera Rig (Responsive Zoom + Focus Lerp on Station Click)
   ============================================================================ */
function AstroneerCameraRig({ controlsRef, selectedStation, drawerOpen, screensaverMode }) {
  const { camera, size } = useThree();
  const desiredTarget = useRef(new THREE.Vector3(0, -0.1, 0));
  const desiredZoom = useRef(68);

  useEffect(() => {
    const minDim = Math.min(size.width, size.height);
    const baseZoom = THREE.MathUtils.clamp(minDim * (screensaverMode ? 0.082 : 0.088), 40, 88);

    if (selectedStation && STATION_ANCHORS[selectedStation] && !screensaverMode) {
      const f = STATION_ANCHORS[selectedStation].focus;
      // Offset slightly left when holographic drawer is open on the right so focused building stays centered-left
      const xShift = drawerOpen && size.width > 960 ? 0.65 : 0;
      desiredTarget.current.set(f[0] + xShift, f[1], f[2] - xShift * 0.45);
      desiredZoom.current = Math.min(104, baseZoom * 1.18);
    } else {
      desiredTarget.current.set(0, -0.1, 0);
      desiredZoom.current = baseZoom;
    }
  }, [size.width, size.height, selectedStation, drawerOpen, screensaverMode]);

  useFrame((_, delta) => {
    if (!camera || !camera.isOrthographicCamera) return;
    const lerpAmt = PREFERS_REDUCED_MOTION ? 1 : Math.min(1, delta * 4.2);
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, desiredZoom.current, lerpAmt);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.lerp(desiredTarget.current, lerpAmt);
      controlsRef.current.update();
    }
  });

  return null;
}

/* ============================================================================
   1. Astroneer-Style Tether Cables + Animated Energy Pulses
   ============================================================================ */
function TetherLine({ from, to, color, powerRate }) {
  const pulseRef = useRef();
  const phaseRef = useRef(Math.random());

  const { curve, tubeGeo, midPole } = useMemo(() => {
    const p0 = new THREE.Vector3(from[0], from[1] + 0.24, from[2]);
    const p2 = new THREE.Vector3(to[0], to[1] + 0.24, to[2]);
    const mid = p0.clone().lerp(p2, 0.5);
    mid.y = Math.max(p0.y, p2.y) + 0.16;
    const c = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const geo = new THREE.TubeGeometry(c, 16, 0.022, 6, false);
    return { curve: c, tubeGeo: geo, midPole: [mid.x, 0.02, mid.z] };
  }, [from, to]);

  useFrame((_, delta) => {
    if (!pulseRef.current) return;
    const speed = PREFERS_REDUCED_MOTION ? 0.1 : 0.35 + powerRate * 0.9;
    phaseRef.current = (phaseRef.current + delta * speed) % 1;
    const pt = curve.getPoint(phaseRef.current);
    pulseRef.current.position.copy(pt);
  });

  return h(
    'group',
    null,
    // Tether cable
    h(
      'mesh',
      { geometry: tubeGeo },
      h('meshStandardMaterial', {
        color,
        emissive: color,
        emissiveIntensity: 0.55 + powerRate * 1.1,
        roughness: 0.3,
        toneMapped: false,
      })
    ),
    // Astroneer mini tether pole at midpoint
    h(
      'group',
      { position: midPole },
      h(
        'mesh',
        { position: [0, 0.14, 0], castShadow: true },
        h('cylinderGeometry', { args: [0.022, 0.032, 0.28, 6] }),
        h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.5 })
      ),
      h(
        'mesh',
        { position: [0, 0.3, 0] },
        h('sphereGeometry', { args: [0.042, 8, 8] }),
        h('meshStandardMaterial', {
          color,
          emissive: color,
          emissiveIntensity: 1.4,
          toneMapped: false,
        })
      )
    ),
    // Traveling glowing energy packet
    h(
      'mesh',
      { ref: pulseRef },
      h('sphereGeometry', { args: [0.055, 8, 8] }),
      h('meshStandardMaterial', {
        color: '#ffffff',
        emissive: color,
        emissiveIntensity: 2.6,
        toneMapped: false,
      })
    )
  );
}

function TetherNetwork({ tracks }) {
  const trk1 = tracks['TRK-01']?.rate ?? 0.33;
  const trk3 = tracks['TRK-03']?.rate ?? 0.33;
  const trk4 = tracks['TRK-04']?.rate ?? 0.33;
  const avg = (trk1 + trk3 + trk4) / 3;

  const links = useMemo(
    () => [
      { from: [0, 0.02, 0], to: [-2.15, 0.02, -1.85], color: '#38bdf8', rate: trk1 },
      { from: [0, 0.02, 0], to: [2.45, 0.02, -1.85], color: '#60a5fa', rate: Math.max(0.35, avg) },
      { from: [0, 0.02, 0], to: [-2.45, 0.02, 1.65], color: '#a78bfa', rate: Math.max(0.35, trk3) },
      { from: [0, 0.02, 0], to: [-0.2, 0.02, -2.55], color: '#fb7185', rate: Math.max(0.35, avg) },
      { from: [0, 0.02, 0], to: [1.85, 0.02, 1.05], color: '#10b981', rate: trk4 },
    ],
    [trk1, trk3, trk4, avg]
  );

  return h(
    'group',
    { name: 'TetherNetwork' },
    ...links.map((l, i) =>
      h(TetherLine, { key: `tether-${i}`, from: l.from, to: l.to, color: l.color, powerRate: l.rate })
    )
  );
}

/* ============================================================================
   2. Expanded Mars Terrain Cross-Section Cube (7.4 x 7.4 Outpost Plateau)
   ============================================================================ */
function MarsTerrainBlock() {
  const topGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(7.44, 7.44, 24, 24);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.hypot(x, z);
      const edgeDist = Math.max(Math.abs(x), Math.abs(z));
      let y = 0.02;
      if (dist > 2.2 && edgeDist < 3.55) {
        const wave =
          Math.sin(x * 0.95) * Math.cos(z * 0.95) * 0.13 +
          Math.sin(x * 2.1 + z * 1.5) * 0.05;
        const craterDist = Math.hypot(x - 2.35, z - 2.35);
        const crater = craterDist < 0.78 ? -0.17 * Math.cos((craterDist / 0.78) * (Math.PI / 2)) : 0;
        const blend = THREE.MathUtils.clamp((dist - 2.2) / 0.9, 0, 1);
        const edgeFade = THREE.MathUtils.clamp((3.68 - edgeDist) / 0.38, 0, 1);
        y += (wave + crater) * blend * edgeFade;
      }
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const rocks = useMemo(
    () => [
      { pos: [3.15, 0.12, -2.95], scale: [0.3, 0.22, 0.26], rot: [0.2, 0.7, 0.1], color: '#8f3920' },
      { pos: [-3.15, 0.11, 2.85], scale: [0.26, 0.19, 0.23], rot: [0.1, 2.1, 0.4], color: '#84341e' },
      { pos: [3.22, 0.09, 0.55], scale: [0.22, 0.15, 0.2], rot: [0.6, 1.8, 0.1], color: '#943c22' },
      { pos: [-1.15, 0.08, 3.22], scale: [0.23, 0.16, 0.19], rot: [0.2, 1.1, 0.5], color: '#9d4126' },
      { pos: [1.35, 0.08, -3.22], scale: [0.22, 0.17, 0.18], rot: [0.4, 2.5, 0.2], color: '#89361f' },
      { pos: [-3.25, 0.1, -0.35], scale: [0.24, 0.16, 0.21], rot: [0.3, 0.9, 0.2], color: '#a84729' },
    ],
    []
  );

  return h(
    'group',
    { name: 'MarsTerrainBlock' },
    h(
      'mesh',
      { geometry: topGeo, receiveShadow: true, castShadow: true },
      h('meshStandardMaterial', { color: '#cb5f38', roughness: 0.85, metalness: 0.05, flatShading: true })
    ),
    h(
      'mesh',
      { position: [0, -0.18, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [7.44, 0.38, 7.44] }),
      h('meshStandardMaterial', { color: '#a34022', roughness: 0.88, metalness: 0.05 })
    ),
    h(
      'mesh',
      { position: [0, -0.6, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [7.4, 0.48, 7.4] }),
      h('meshStandardMaterial', { color: '#6b2919', roughness: 0.9, metalness: 0.06 })
    ),
    h(
      'mesh',
      { position: [0, -1.04, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [7.34, 0.42, 7.34] }),
      h('meshStandardMaterial', { color: '#2b1817', roughness: 0.84, metalness: 0.14 })
    ),
    h(
      'mesh',
      { position: [0, -1.27, 0] },
      h('boxGeometry', { args: [7.4, 0.05, 7.4] }),
      h('meshStandardMaterial', { color: '#243044', roughness: 0.35, metalness: 0.72 })
    ),
    ...rocks.map((r, idx) =>
      h(
        'mesh',
        { key: `rock-${idx}`, position: r.pos, scale: r.scale, rotation: r.rot, castShadow: true, receiveShadow: true },
        h('dodecahedronGeometry', { args: [1, 0] }),
        h('meshStandardMaterial', { color: r.color, roughness: 0.9, flatShading: true })
      )
    )
  );
}

/* ============================================================================
   3. Central Geodesic Dome (TRK-03) + Rising Golden Bytes XP
   ============================================================================ */
function XpParticles({ rate, burstSignal }) {
  const count = 26;
  const groupRef = useRef();
  const burstRef = useRef(0);
  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2 + (i % 3) * 0.4,
        radius: 0.35 + (i % 5) * 0.17,
        speed: 0.45 + (i % 4) * 0.22,
        phase: (i / count) * 2.6,
        scale: 0.045 + (i % 3) * 0.02,
      })),
    []
  );

  useEffect(() => {
    if (burstSignal > 0) burstRef.current = 1.6;
  }, [burstSignal]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (burstRef.current > 0) burstRef.current = Math.max(0, burstRef.current - delta * 0.9);
    const motionScale = PREFERS_REDUCED_MOTION ? 0.2 : 1;
    const activeIntensity = Math.min(1, rate * 1.15 + burstRef.current);
    const children = groupRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const p = particles[i];
      p.phase += delta * p.speed * (0.7 + activeIntensity * 1.4) * motionScale;
      if (p.phase > 2.6) p.phase -= 2.6;
      const t = p.phase / 2.6;
      const mesh = children[i];
      const visibleCount = Math.floor(count * Math.max(rate > 0 ? 0.25 : 0, activeIntensity));
      mesh.visible = i < visibleCount;
      if (mesh.visible) {
        mesh.position.set(
          Math.cos(p.angle + t * 1.4) * (p.radius * (1 - t * 0.35)),
          0.65 + t * 2.15,
          Math.sin(p.angle + t * 1.4) * (p.radius * (1 - t * 0.35))
        );
        mesh.rotation.y += delta * 2.2 * motionScale;
        mesh.rotation.x += delta * 1.5 * motionScale;
        const fade = Math.sin(t * Math.PI);
        mesh.scale.setScalar(Math.max(0.001, p.scale * fade * (1 + burstRef.current * 0.45)));
      }
    }
  });

  return h(
    'group',
    { ref: groupRef },
    ...particles.map((_, i) =>
      h(
        'mesh',
        { key: `xp-${i}` },
        h('octahedronGeometry', { args: [1, 0] }),
        h('meshStandardMaterial', {
          color: '#ffd166',
          emissive: '#ff9f0a',
          emissiveIntensity: 2.2,
          roughness: 0.2,
          toneMapped: false,
        })
      )
    )
  );
}

function GeodesicDome({ rate, selected, hovered, onHover, onSelect, burstSignal }) {
  const beaconRef = useRef();
  const windowLightRef = useRef();
  const amberIntensity = 0.24 + rate * 2.1 + (selected ? 0.5 : 0) + (hovered ? 0.25 : 0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (beaconRef.current) beaconRef.current.material.emissiveIntensity = 1.2 + Math.sin(t * 3.2) * 0.65;
    if (windowLightRef.current) windowLightRef.current.intensity = (0.35 + rate * 2.4) * (0.94 + Math.sin(t * 2.1) * 0.06);
  });

  const windowAngles = [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3 + Math.PI / 6);

  return h(
    'group',
    {
      position: [0, 0.02, 0],
      onClick: (e) => {
        e.stopPropagation();
        onSelect('TRK-03');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('TRK-03');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    h(
      'mesh',
      { position: [0, 0.09, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [1.18, 1.28, 0.18, 10] }),
      h('meshStandardMaterial', { color: '#39414f', roughness: 0.65, metalness: 0.35, flatShading: true })
    ),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.04, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [1.34, 1.48, 28] }),
        h('meshBasicMaterial', { color: '#ff9f0a', transparent: true, opacity: selected ? 0.9 : 0.48, side: THREE.DoubleSide })
      ),
    h(
      'mesh',
      { position: [0, 0.16, 0], castShadow: true, receiveShadow: true },
      h('sphereGeometry', { args: [1.02, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52] }),
      h('meshStandardMaterial', { color: '#e8e2d8', roughness: 0.62, metalness: 0.12, flatShading: true })
    ),
    h(
      'mesh',
      { position: [0, 0.16, 0] },
      h('sphereGeometry', { args: [1.032, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52] }),
      h('meshStandardMaterial', { color: '#2b3442', wireframe: true, roughness: 0.45, metalness: 0.65 })
    ),
    ...windowAngles.map((ang, i) =>
      h(
        'mesh',
        {
          key: `dome-win-${i}`,
          position: [Math.cos(ang) * 0.94, 0.45, Math.sin(ang) * 0.94],
          rotation: [0, -ang + Math.PI / 2, 0],
        },
        h('boxGeometry', { args: [0.34, 0.24, 0.1] }),
        h('meshStandardMaterial', {
          color: rate > 0 ? '#ffd280' : '#4a5568',
          emissive: '#ff9f0a',
          emissiveIntensity: amberIntensity,
          roughness: 0.25,
        })
      )
    ),
    h(
      'mesh',
      { position: [0, 1.07, 0] },
      h('cylinderGeometry', { args: [0.3, 0.38, 0.1, 8] }),
      h('meshStandardMaterial', {
        color: '#ffd280',
        emissive: '#ff9f0a',
        emissiveIntensity: amberIntensity * 0.85,
        roughness: 0.3,
        flatShading: true,
      })
    ),
    h(
      'mesh',
      { position: [0, 1.38, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.025, 0.05, 0.58, 6] }),
      h('meshStandardMaterial', { color: '#5c6678', roughness: 0.35, metalness: 0.68 })
    ),
    h(
      'mesh',
      { ref: beaconRef, position: [0, 1.7, 0] },
      h('octahedronGeometry', { args: [0.065, 0] }),
      h('meshStandardMaterial', { color: '#ffb340', emissive: '#ff9f0a', emissiveIntensity: 1.6, toneMapped: false })
    ),
    h('pointLight', {
      ref: windowLightRef,
      position: [0, 0.72, 0],
      color: '#ff9f38',
      distance: 4.5,
      decay: 2,
      intensity: 0.4 + rate * 2.2,
    }),
    h(XpParticles, { rate, burstSignal })
  );
}

/* ============================================================================
   4. Habitat Modules x3 (TRK-04) + Pressurized Tunnels
   ============================================================================ */
function HabitatModules({ rate, selected, hovered, onHover, onSelect }) {
  const modules = useMemo(
    () => [
      { angle: (30 * Math.PI) / 180, dist: 2.05 },
      { angle: (145 * Math.PI) / 180, dist: 1.85 },
      { angle: (90 * Math.PI) / 180, dist: 1.85 },
    ],
    []
  );
  const lifeIntensity = 0.25 + rate * 2.3 + (selected ? 0.5 : 0) + (hovered ? 0.25 : 0);

  return h(
    'group',
    {
      name: 'HabitatModules',
      onClick: (e) => {
        e.stopPropagation();
        onSelect('TRK-04');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('TRK-04');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    ...modules.map((m, idx) => {
      const mx = Math.cos(m.angle) * m.dist;
      const mz = Math.sin(m.angle) * m.dist;
      const tx = Math.cos(m.angle) * 1.24;
      const tz = Math.sin(m.angle) * 1.24;
      const rotY = -m.angle + Math.PI / 2;

      return h(
        'group',
        { key: `hab-${idx}` },
        h(
          'group',
          { position: [tx, 0.34, tz], rotation: [0, rotY, 0] },
          h(
            'mesh',
            { rotation: [Math.PI / 2, 0, 0], castShadow: true, receiveShadow: true },
            h('cylinderGeometry', { args: [0.18, 0.18, 0.86, 8] }),
            h('meshStandardMaterial', { color: '#9aa4b2', roughness: 0.55, metalness: 0.4, flatShading: true })
          ),
          ...[-0.22, 0, 0.22].map((zOff, ri) =>
            h(
              'mesh',
              { key: `rib-${ri}`, position: [0, 0, zOff], rotation: [Math.PI / 2, 0, 0] },
              h('cylinderGeometry', { args: [0.21, 0.21, 0.06, 8] }),
              h('meshStandardMaterial', { color: '#394352', roughness: 0.45, metalness: 0.55 })
            )
          )
        ),
        h(
          'group',
          { position: [mx, 0.42, mz], rotation: [0, rotY, 0] },
          ...[-0.32, 0.32].map((xOff, li) =>
            h(
              'mesh',
              { key: `leg-${li}`, position: [xOff, -0.26, 0], castShadow: true },
              h('boxGeometry', { args: [0.12, 0.32, 0.52] }),
              h('meshStandardMaterial', { color: '#353e4c', roughness: 0.65, metalness: 0.45 })
            )
          ),
          h(
            'mesh',
            { rotation: [0, 0, Math.PI / 2], castShadow: true, receiveShadow: true },
            h('cylinderGeometry', { args: [0.36, 0.36, 1.08, 10] }),
            h('meshStandardMaterial', { color: '#dfe4ec', roughness: 0.6, metalness: 0.15, flatShading: true })
          ),
          ...[-0.54, 0.54].map((xEnd, ei) =>
            h(
              'mesh',
              { key: `cap-${ei}`, position: [xEnd, 0, 0], castShadow: true },
              h('sphereGeometry', { args: [0.355, 8, 6] }),
              h('meshStandardMaterial', { color: '#c4ccd8', roughness: 0.65, flatShading: true })
            )
          ),
          ...[-0.28, 0.28].map((xRib, ri) =>
            h(
              'mesh',
              { key: `hrib-${ri}`, position: [xRib, 0, 0], rotation: [0, 0, Math.PI / 2] },
              h('cylinderGeometry', { args: [0.375, 0.375, 0.08, 10] }),
              h('meshStandardMaterial', { color: '#3b4555', roughness: 0.5, metalness: 0.45 })
            )
          ),
          h(
            'mesh',
            { position: [0, 0.06, 0.35] },
            h('boxGeometry', { args: [0.46, 0.13, 0.05] }),
            h('meshStandardMaterial', {
              color: rate > 0 ? '#5eead4' : '#334155',
              emissive: '#10b981',
              emissiveIntensity: lifeIntensity,
              roughness: 0.2,
            })
          ),
          h(
            'mesh',
            { position: [0, 0.06, -0.35] },
            h('boxGeometry', { args: [0.46, 0.13, 0.05] }),
            h('meshStandardMaterial', {
              color: rate > 0 ? '#67e8f9' : '#334155',
              emissive: '#06b6d4',
              emissiveIntensity: lifeIntensity,
              roughness: 0.2,
            })
          ),
          h(
            'mesh',
            { position: [0, 0.39, 0] },
            h('cylinderGeometry', { args: [0.1, 0.12, 0.08, 8] }),
            h('meshStandardMaterial', {
              color: '#34d399',
              emissive: '#10b981',
              emissiveIntensity: lifeIntensity * 0.9,
              toneMapped: false,
            })
          ),
          (selected || hovered) &&
            h(
              'mesh',
              { position: [0, -0.38, 0], rotation: [-Math.PI / 2, 0, 0] },
              h('ringGeometry', { args: [0.62, 0.72, 20] }),
              h('meshBasicMaterial', { color: '#10b981', transparent: true, opacity: selected ? 0.88 : 0.45, side: THREE.DoubleSide })
            ),
          rate > 0 &&
            h('pointLight', {
              position: [0, 0.32, 0.45],
              color: idx % 2 === 0 ? '#10b981' : '#06b6d4',
              intensity: 0.3 + rate * 1.45,
              distance: 2.6,
              decay: 2,
            })
        )
      );
    })
  );
}

/* ============================================================================
   5. NEW Astroneer Station A: Deep-Space Radar Dish (radar_jobs — 채용·외주·공모)
   ============================================================================ */
function DeepSpaceRadarStation({ selected, hovered, onHover, onSelect }) {
  const dishRef = useRef();

  useFrame((state) => {
    if (!dishRef.current || PREFERS_REDUCED_MOTION) return;
    dishRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.7 - 0.6;
  });

  return h(
    'group',
    {
      position: STATION_ANCHORS.radar_jobs.pos,
      onClick: (e) => {
        e.stopPropagation();
        onSelect('radar_jobs');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('radar_jobs');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    // Base pad
    h(
      'mesh',
      { position: [0, 0.1, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [0.58, 0.68, 0.2, 8] }),
      h('meshStandardMaterial', { color: '#334155', roughness: 0.6, metalness: 0.4, flatShading: true })
    ),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.04, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.74, 0.86, 24] }),
        h('meshBasicMaterial', { color: '#60a5fa', transparent: true, opacity: selected ? 0.9 : 0.5, side: THREE.DoubleSide })
      ),
    // Pedestal mast
    h(
      'mesh',
      { position: [0, 0.52, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.16, 0.24, 0.7, 8] }),
      h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.5, metalness: 0.28, flatShading: true })
    ),
    // Rotating parabolic dish assembly
    h(
      'group',
      { ref: dishRef, position: [0, 0.95, 0] },
      h(
        'mesh',
        { rotation: [0.65, 0, 0], castShadow: true },
        h('cylinderGeometry', { args: [0.68, 0.14, 0.26, 12, 1, true] }),
        h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide, flatShading: true })
      ),
      h(
        'mesh',
        { position: [0, 0.26, 0.18], rotation: [0.65, 0, 0] },
        h('cylinderGeometry', { args: [0.025, 0.04, 0.45, 6] }),
        h('meshStandardMaterial', { color: '#475569', metalness: 0.6, roughness: 0.35 })
      ),
      h(
        'mesh',
        { position: [0, 0.42, 0.3] },
        h('octahedronGeometry', { args: [0.09, 0] }),
        h('meshStandardMaterial', {
          color: '#93c5fd',
          emissive: '#3b82f6',
          emissiveIntensity: selected ? 2.8 : 1.7,
          toneMapped: false,
        })
      ),
      h('pointLight', { position: [0, 0.45, 0.35], color: '#60a5fa', intensity: 1.1, distance: 3, decay: 2 })
    )
  );
}

/* ============================================================================
   6. NEW Astroneer Station B: Research & Printer Lab (research_lab — 직군분석·이력서)
   ============================================================================ */
function ResearchLabStation({ selected, hovered, onHover, onSelect }) {
  const crystalRef = useRef();

  useFrame((state, delta) => {
    if (!crystalRef.current || PREFERS_REDUCED_MOTION) return;
    crystalRef.current.rotation.y += delta * 1.4;
    crystalRef.current.position.y = 0.66 + Math.sin(state.clock.elapsedTime * 2.2) * 0.06;
  });

  return h(
    'group',
    {
      position: STATION_ANCHORS.research_lab.pos,
      onClick: (e) => {
        e.stopPropagation();
        onSelect('research_lab');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('research_lab');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    h(
      'mesh',
      { position: [0, 0.14, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [0.64, 0.72, 0.28, 6] }),
      h('meshStandardMaterial', { color: '#3b3754', roughness: 0.6, metalness: 0.35, flatShading: true })
    ),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.04, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.8, 0.92, 24] }),
        h('meshBasicMaterial', { color: '#a78bfa', transparent: true, opacity: selected ? 0.9 : 0.5, side: THREE.DoubleSide })
      ),
    // Translucent glass research pod
    h(
      'mesh',
      { position: [0, 0.62, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.46, 0.52, 0.68, 6] }),
      h('meshStandardMaterial', { color: '#c4b5fd', transparent: true, opacity: 0.32, roughness: 0.15, metalness: 0.2 })
    ),
    // Top cap
    h(
      'mesh',
      { position: [0, 0.98, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.34, 0.48, 0.14, 6] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.5, flatShading: true })
    ),
    // Floating holographic AI research crystal
    h(
      'mesh',
      { ref: crystalRef, position: [0, 0.66, 0] },
      h('octahedronGeometry', { args: [0.22, 0] }),
      h('meshStandardMaterial', {
        color: '#ddd6fe',
        emissive: '#8b5cf6',
        emissiveIntensity: selected ? 2.6 : 1.8,
        toneMapped: false,
      })
    ),
    h('pointLight', { position: [0, 0.7, 0], color: '#a78bfa', intensity: 1.25, distance: 3, decay: 2 })
  );
}

/* ============================================================================
   7. NEW Astroneer Station C: Mission Control Tower (warroom_hub — 일정·워룸·재무)
   ============================================================================ */
function WarRoomControlStation({ selected, hovered, onHover, onSelect }) {
  const ringRef = useRef();

  useFrame((state) => {
    if (!ringRef.current) return;
    ringRef.current.material.emissiveIntensity = 1.2 + Math.sin(state.clock.elapsedTime * 2.8) * 0.6;
  });

  return h(
    'group',
    {
      position: STATION_ANCHORS.warroom_hub.pos,
      onClick: (e) => {
        e.stopPropagation();
        onSelect('warroom_hub');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('warroom_hub');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    // Octagonal landing pad
    h(
      'mesh',
      { position: [0, 0.06, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [0.76, 0.84, 0.12, 8] }),
      h('meshStandardMaterial', { color: '#2e3748', roughness: 0.7, metalness: 0.32, flatShading: true })
    ),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.03, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.9, 1.02, 24] }),
        h('meshBasicMaterial', { color: '#fb7185', transparent: true, opacity: selected ? 0.9 : 0.5, side: THREE.DoubleSide })
      ),
    // Control tower shaft
    h(
      'mesh',
      { position: [0, 0.55, 0], castShadow: true },
      h('boxGeometry', { args: [0.36, 0.9, 0.36] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.55, flatShading: true })
    ),
    // Control deck cabin
    h(
      'mesh',
      { position: [0, 1.05, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.46, 0.34, 0.28, 6] }),
      h('meshStandardMaterial', { color: '#334155', roughness: 0.45, metalness: 0.45, flatShading: true })
    ),
    // Glowing War-Room ring
    h(
      'mesh',
      { ref: ringRef, position: [0, 1.05, 0] },
      h('cylinderGeometry', { args: [0.48, 0.48, 0.08, 6] }),
      h('meshStandardMaterial', {
        color: '#fda4af',
        emissive: '#f43f5e',
        emissiveIntensity: 1.5,
        toneMapped: false,
      })
    ),
    h('pointLight', { position: [0, 1.15, 0], color: '#fb7185', intensity: 1.05, distance: 3, decay: 2 })
  );
}

/* ============================================================================
   8. Solar Panel Arrays + Wind Turbines (TRK-01) + Rovers (TRK-02)
   ============================================================================ */
function SolarArrays({ avgRate }) {
  const arrays = [
    { pos: [1.55, 0.04, -1.25], rotY: -0.55 },
    { pos: [-1.45, 0.04, 2.38], rotY: 0.45 },
  ];
  return h(
    'group',
    { name: 'SolarArrays' },
    ...arrays.map((a, idx) =>
      h(
        'group',
        { key: `solar-${idx}`, position: a.pos, rotation: [0, a.rotY, 0] },
        h(
          'mesh',
          { position: [0, 0.16, 0], castShadow: true },
          h('cylinderGeometry', { args: [0.045, 0.07, 0.32, 6] }),
          h('meshStandardMaterial', { color: '#475569', roughness: 0.5, metalness: 0.55 })
        ),
        h(
          'group',
          { position: [0, 0.34, 0], rotation: [0.46, 0, 0] },
          h(
            'mesh',
            { castShadow: true, receiveShadow: true },
            h('boxGeometry', { args: [0.88, 0.04, 0.52] }),
            h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.35, metalness: 0.68 })
          ),
          h(
            'mesh',
            { position: [0, 0.025, 0] },
            h('boxGeometry', { args: [0.8, 0.015, 0.44] }),
            h('meshStandardMaterial', {
              color: '#1b4a8f',
              emissive: '#0ea5e9',
              emissiveIntensity: 0.28 + avgRate * 0.65,
              roughness: 0.18,
              metalness: 0.78,
            })
          )
        )
      )
    )
  );
}

function SingleTurbine({ pos, height, rate, selected, hovered }) {
  const rotorRef = useRef();
  useFrame((_, delta) => {
    if (!rotorRef.current) return;
    const motionScale = PREFERS_REDUCED_MOTION ? 0.15 : 1;
    rotorRef.current.rotation.z -= delta * (0.55 + rate * 3.85) * motionScale;
  });

  return h(
    'group',
    { position: pos },
    h(
      'mesh',
      { position: [0, 0.06, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [0.18, 0.24, 0.12, 8] }),
      h('meshStandardMaterial', { color: '#3b4454', roughness: 0.72, flatShading: true })
    ),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.03, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.28, 0.38, 16] }),
        h('meshBasicMaterial', { color: '#38bdf8', transparent: true, opacity: selected ? 0.88 : 0.48, side: THREE.DoubleSide })
      ),
    h(
      'mesh',
      { position: [0, height / 2 + 0.08, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.04, 0.085, height, 7] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.55, metalness: 0.18, flatShading: true })
    ),
    h(
      'mesh',
      { position: [0, height + 0.1, 0.04], castShadow: true },
      h('boxGeometry', { args: [0.14, 0.14, 0.3] }),
      h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.48, metalness: 0.32, flatShading: true })
    ),
    h(
      'mesh',
      { position: [0, height + 0.19, 0.02] },
      h('boxGeometry', { args: [0.06, 0.05, 0.06] }),
      h('meshStandardMaterial', { color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 0.5 + rate * 2.2, toneMapped: false })
    ),
    h(
      'group',
      { ref: rotorRef, position: [0, height + 0.1, 0.2] },
      h(
        'mesh',
        { rotation: [Math.PI / 2, 0, 0] },
        h('coneGeometry', { args: [0.06, 0.14, 6] }),
        h('meshStandardMaterial', { color: '#ff9f0a', roughness: 0.45, flatShading: true })
      ),
      ...[0, 1, 2].map((b) =>
        h(
          'group',
          { key: `blade-${b}`, rotation: [0, 0, (b * Math.PI * 2) / 3] },
          h(
            'mesh',
            { position: [0, 0.34, 0], rotation: [0, 0.18, 0], castShadow: true },
            h('boxGeometry', { args: [0.065, 0.62, 0.018] }),
            h('meshStandardMaterial', { color: '#f1f5f9', roughness: 0.52, flatShading: true })
          )
        )
      )
    )
  );
}

function WindTurbines({ rate, selected, hovered, onHover, onSelect }) {
  const turbines = [
    { pos: [-2.55, 0.02, -2.25], height: 1.78 },
    { pos: [-1.72, 0.02, -2.55], height: 1.5 },
    { pos: [-2.68, 0.02, -1.28], height: 1.6 },
  ];
  return h(
    'group',
    {
      name: 'WindTurbines',
      onClick: (e) => {
        e.stopPropagation();
        onSelect('TRK-01');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('TRK-01');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    ...turbines.map((t, i) => h(SingleTurbine, { key: `wt-${i}`, pos: t.pos, height: t.height, rate, selected, hovered }))
  );
}

function ExplorationRover({ orbitRadiusX, orbitRadiusZ, phaseOffset, direction, rate, selected, hovered, onHover, onSelect }) {
  const roverRef = useRef();
  const angleRef = useRef(phaseOffset);
  const headlightOn = rate > 0;
  const beamIntensity = headlightOn ? 0.9 + rate * 2.2 : 0.12;

  useFrame((_, delta) => {
    if (!roverRef.current) return;
    const motionScale = PREFERS_REDUCED_MOTION ? 0.15 : 1;
    const moveSpeed = headlightOn ? (0.18 + rate * 0.38) * direction * motionScale : 0;
    angleRef.current += delta * moveSpeed;

    const a = angleRef.current;
    const x = Math.cos(a) * orbitRadiusX;
    const z = Math.sin(a) * orbitRadiusZ;
    const aNext = a + 0.04 * direction;
    roverRef.current.position.set(x, 0.14 + (headlightOn ? Math.sin(a * 12) * 0.012 : 0), z);
    roverRef.current.rotation.y = Math.atan2(Math.cos(aNext) * orbitRadiusX - x, Math.sin(aNext) * orbitRadiusZ - z);
  });

  const wheelPositions = [
    [-0.17, -0.05, 0.18],
    [0.17, -0.05, 0.18],
    [-0.17, -0.05, 0],
    [0.17, -0.05, 0],
    [-0.17, -0.05, -0.18],
    [0.17, -0.05, -0.18],
  ];

  return h(
    'group',
    {
      ref: roverRef,
      position: [Math.cos(phaseOffset) * orbitRadiusX, 0.14, Math.sin(phaseOffset) * orbitRadiusZ],
      onClick: (e) => {
        e.stopPropagation();
        onSelect('TRK-02');
      },
      onPointerOver: (e) => {
        e.stopPropagation();
        onHover('TRK-02');
      },
      onPointerOut: (e) => {
        e.stopPropagation();
        onHover(null);
      },
    },
    h(
      'mesh',
      { position: [0, 0.05, 0], castShadow: true },
      h('boxGeometry', { args: [0.28, 0.13, 0.44] }),
      h('meshStandardMaterial', { color: '#e6a856', roughness: 0.55, metalness: 0.2, flatShading: true })
    ),
    h(
      'mesh',
      { position: [0, 0.13, -0.04], castShadow: true },
      h('boxGeometry', { args: [0.22, 0.05, 0.28] }),
      h('meshStandardMaterial', { color: '#1e3a5f', roughness: 0.3, metalness: 0.68 })
    ),
    h(
      'mesh',
      { position: [0, 0.23, 0.12], castShadow: true },
      h('cylinderGeometry', { args: [0.02, 0.025, 0.18, 6] }),
      h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.4, metalness: 0.55 })
    ),
    h(
      'mesh',
      { position: [0, 0.32, 0.13] },
      h('boxGeometry', { args: [0.11, 0.06, 0.07] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.45, flatShading: true })
    ),
    ...wheelPositions.map((wp, wi) =>
      h(
        'mesh',
        { key: `whl-${wi}`, position: wp, rotation: [0, 0, Math.PI / 2], castShadow: true },
        h('cylinderGeometry', { args: [0.065, 0.065, 0.055, 8] }),
        h('meshStandardMaterial', { color: '#272c36', roughness: 0.85, flatShading: true })
      )
    ),
    ...[-0.08, 0.08].map((hx, hi) =>
      h(
        'mesh',
        { key: `hl-${hi}`, position: [hx, 0.06, 0.23] },
        h('boxGeometry', { args: [0.055, 0.045, 0.03] }),
        h('meshStandardMaterial', {
          color: headlightOn ? '#fffbeb' : '#475569',
          emissive: headlightOn ? '#fde68a' : '#ff9f0a',
          emissiveIntensity: beamIntensity,
          toneMapped: false,
        })
      )
    ),
    headlightOn &&
      h(
        'mesh',
        { position: [0, 0.04, 0.62], rotation: [-Math.PI / 2, 0, 0] },
        h('coneGeometry', { args: [0.24, 0.78, 10, 1, true] }),
        h('meshBasicMaterial', {
          color: '#fef08a',
          transparent: true,
          opacity: 0.12 + rate * 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      ),
    headlightOn && h('pointLight', { position: [0, 0.12, 0.5], color: '#fef3c7', intensity: 0.45 + rate * 1.15, distance: 2.2, decay: 2 }),
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, -0.09, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.34, 0.44, 16] }),
        h('meshBasicMaterial', { color: '#fde047', transparent: true, opacity: selected ? 0.88 : 0.48, side: THREE.DoubleSide })
      )
  );
}

/* ============================================================================
   9. Diegetic Floating 3D Station Pins (Astroneer In-World Hologram Badges)
   ============================================================================ */
function DiegeticStationPins({ gameState, selectedStation, onSelect, visible }) {
  if (!visible) return null;
  const tracks = gameState.tracks || DEFAULT_GAME_STATE.tracks;
  const stats = gameState.stats || DEFAULT_GAME_STATE.stats;

  const pins = [
    {
      id: 'TRK-01',
      pos: STATION_ANCHORS['TRK-01'].pinPos,
      color: '#38bdf8',
      label: '풍력 발전소',
      metric: `${Math.round((tracks['TRK-01']?.rate || 0) * 100)}%`,
    },
    {
      id: 'TRK-02',
      pos: STATION_ANCHORS['TRK-02'].pinPos,
      color: '#fde047',
      label: '탐사 로버',
      metric: `${Math.round((tracks['TRK-02']?.rate || 0) * 100)}%`,
    },
    {
      id: 'TRK-03',
      pos: STATION_ANCHORS['TRK-03'].pinPos,
      color: '#ff9f0a',
      label: '중앙 본부 돔',
      metric: `${Math.round((tracks['TRK-03']?.rate || 0) * 100)}%`,
    },
    {
      id: 'TRK-04',
      pos: STATION_ANCHORS['TRK-04'].pinPos,
      color: '#10b981',
      label: '생명유지 모듈',
      metric: `${Math.round((tracks['TRK-04']?.rate || 0) * 100)}%`,
    },
    {
      id: 'radar_jobs',
      pos: STATION_ANCHORS.radar_jobs.pinPos,
      color: '#60a5fa',
      label: '기회 레이더',
      metric: stats.totalJobs > 0 ? `${stats.totalJobs}건` : 'SCAN',
    },
    {
      id: 'research_lab',
      pos: STATION_ANCHORS.research_lab.pinPos,
      color: '#a78bfa',
      label: 'AI 연구실',
      metric: 'LAB',
    },
    {
      id: 'warroom_hub',
      pos: STATION_ANCHORS.warroom_hub.pinPos,
      color: '#fb7185',
      label: '워룸 관제탑',
      metric: 'D-30',
    },
  ];

  return h(
    'group',
    { name: 'DiegeticStationPins' },
    ...pins.map((p) => {
      const isSelected = selectedStation === p.id;
      return h(
        Html,
        { key: `pin-${p.id}`, position: p.pos, center: true, zIndexRange: [15, 0] },
        h(
          'button',
          {
            type: 'button',
            className: `astro-pin ${isSelected ? 'is-selected' : ''}`,
            style: { '--pin-accent': p.color },
            onClick: (e) => {
              e.stopPropagation();
              onSelect(p.id);
            },
          },
          h('span', { className: 'astro-pin-dot' }),
          h('span', { className: 'astro-pin-label' }, p.label),
          h('span', { className: 'astro-pin-val num' }, p.metric)
        )
      );
    })
  );
}

/* ============================================================================
   10. Full Scene Assembly
   ============================================================================ */
function MarsDioramaScene({
  gameState,
  selectedStation,
  drawerOpen,
  onSelectStation,
  screensaverMode,
  burstSignal,
  resetSignal,
}) {
  const [hoveredStation, setHoveredStation] = useState(null);
  const dioramaRef = useRef();
  const controlsRef = useRef();

  useEffect(() => {
    document.body.style.cursor = hoveredStation ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoveredStation]);

  useEffect(() => {
    if (resetSignal > 0 && controlsRef.current) {
      controlsRef.current.reset();
    }
  }, [resetSignal]);

  useFrame((state) => {
    if (dioramaRef.current && !PREFERS_REDUCED_MOTION) {
      dioramaRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.045;
    }
  });

  const tracks = gameState.tracks || DEFAULT_GAME_STATE.tracks;
  const trk1 = tracks['TRK-01']?.rate ?? 0.33;
  const trk2 = tracks['TRK-02']?.rate ?? 0.33;
  const trk3 = tracks['TRK-03']?.rate ?? 0.33;
  const trk4 = tracks['TRK-04']?.rate ?? 0.33;
  const avgRate = (trk1 + trk2 + trk3 + trk4) / 4;

  return h(
    React.Fragment,
    null,
    h('color', { attach: 'background', args: ['#080c15'] }),
    h('fog', { attach: 'fog', args: ['#080c15', 22, 48] }),

    // Procedural Studio IBL
    h(
      Environment,
      { resolution: 256, frames: 1 },
      h(Lightformer, { form: 'rect', intensity: 2.2, color: '#ffb074', position: [6, 8, 6], scale: [8, 4, 1], target: [0, 0, 0] }),
      h(Lightformer, { form: 'rect', intensity: 1.6, color: '#6ca6ff', position: [-8, 5, -7], scale: [10, 4, 1], target: [0, 0, 0] }),
      h(Lightformer, { form: 'ring', intensity: 1.1, color: '#ff8a4c', position: [0, 10, 0], rotation: [Math.PI / 2, 0, 0], scale: 12 })
    ),

    h(AstroneerCameraRig, { controlsRef, selectedStation, drawerOpen, screensaverMode }),

    h('hemisphereLight', { args: ['#ffd5b3', '#161b29', 0.64] }),
    h('directionalLight', {
      position: [10, 14, 9],
      intensity: 2.25,
      color: '#ffab6b',
      castShadow: true,
      'shadow-mapSize-width': 2048,
      'shadow-mapSize-height': 2048,
      'shadow-camera-near': 2,
      'shadow-camera-far': 34,
      'shadow-camera-left': -7.5,
      'shadow-camera-right': 7.5,
      'shadow-camera-top': 7.5,
      'shadow-camera-bottom': -7.5,
      'shadow-bias': -0.0004,
      'shadow-radius': 4,
    }),
    h('directionalLight', { position: [-11, 7, -10], intensity: 1.05, color: '#6ca6ff' }),
    h('pointLight', { position: [0, -1.42, 0], intensity: 0.78, color: '#e0622d', distance: 10 }),

    !PREFERS_REDUCED_MOTION &&
      h(Sparkles, { count: 40, scale: [11, 5.5, 11], position: [0, 1.3, 0], size: 1.6, speed: 0.22, opacity: 0.34, color: '#ffbe8a' }),

    h(
      'group',
      { ref: dioramaRef },
      h(MarsTerrainBlock),
      h(TetherNetwork, { tracks }),
      h(GeodesicDome, {
        rate: trk3,
        selected: selectedStation === 'TRK-03',
        hovered: hoveredStation === 'TRK-03',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
        burstSignal,
      }),
      h(HabitatModules, {
        rate: trk4,
        selected: selectedStation === 'TRK-04',
        hovered: hoveredStation === 'TRK-04',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(DeepSpaceRadarStation, {
        selected: selectedStation === 'radar_jobs',
        hovered: hoveredStation === 'radar_jobs',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(ResearchLabStation, {
        selected: selectedStation === 'research_lab',
        hovered: hoveredStation === 'research_lab',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(WarRoomControlStation, {
        selected: selectedStation === 'warroom_hub',
        hovered: hoveredStation === 'warroom_hub',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(SolarArrays, { avgRate }),
      h(WindTurbines, {
        rate: trk1,
        selected: selectedStation === 'TRK-01',
        hovered: hoveredStation === 'TRK-01',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(ExplorationRover, {
        orbitRadiusX: 3.05,
        orbitRadiusZ: 2.9,
        phaseOffset: 0.65,
        direction: 1,
        rate: trk2,
        selected: selectedStation === 'TRK-02',
        hovered: hoveredStation === 'TRK-02',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(ExplorationRover, {
        orbitRadiusX: 2.75,
        orbitRadiusZ: 3.12,
        phaseOffset: 3.75,
        direction: -1,
        rate: trk2,
        selected: selectedStation === 'TRK-02',
        hovered: hoveredStation === 'TRK-02',
        onHover: setHoveredStation,
        onSelect: onSelectStation,
      }),
      h(DiegeticStationPins, {
        gameState,
        selectedStation,
        onSelect: onSelectStation,
        visible: !screensaverMode,
      })
    ),

    // Reflective Dark Studio Floor Plane (clicking empty space pulls camera back & closes drawer)
    h(
      'mesh',
      {
        position: [0, -1.72, 0],
        rotation: [-Math.PI / 2, 0, 0],
        receiveShadow: true,
        onClick: () => onSelectStation(null),
      },
      h('planeGeometry', { args: [70, 70] }),
      h('meshStandardMaterial', { color: '#0e1422', roughness: 0.2, metalness: 0.78 })
    ),
    h(
      'mesh',
      { position: [0, -1.71, 0], rotation: [-Math.PI / 2, 0, 0] },
      h('ringGeometry', { args: [5.1, 5.22, 72] }),
      h('meshBasicMaterial', { color: '#ff9f4a', transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    ),
    h(ContactShadows, { position: [0, -1.7, 0], opacity: 0.72, scale: 16, blur: 2.4, far: 4.8, color: '#000000' }),

    h(OrbitControls, {
      ref: controlsRef,
      makeDefault: true,
      target: [0, -0.1, 0],
      enablePan: false,
      enableDamping: true,
      dampingFactor: 0.06,
      minPolarAngle: Math.PI / 6,
      maxPolarAngle: Math.PI / 2.25,
      minZoom: 36,
      maxZoom: 118,
      autoRotate: screensaverMode && !PREFERS_REDUCED_MOTION,
      autoRotateSpeed: screensaverMode ? 0.55 : 0,
    })
  );
}

/* ============================================================================
   11. React Root Wrapper + Event Bridge
   ============================================================================ */
function MarsViewportApp() {
  const [gameState, setGameState] = useState(() => window.__MARS_GAME_STATE__ || DEFAULT_GAME_STATE);
  const [selectedStation, setSelectedStation] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [screensaverMode, setScreensaverMode] = useState(() => Boolean(window.__MARS_SCREENSAVER_MODE__));
  const [burstSignal, setBurstSignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    const onGameUpdated = (ev) => {
      if (ev?.detail) setGameState({ ...ev.detail });
    };
    const onScreensaverChanged = (ev) => {
      const active = Boolean(ev?.detail?.active);
      setScreensaverMode(active);
      if (active) {
        setSelectedStation(null);
        setDrawerOpen(false);
      }
    };
    const onStationChangedFromUI = (ev) => {
      setSelectedStation(ev?.detail?.stationId || null);
      setDrawerOpen(Boolean(ev?.detail?.drawerOpen));
    };
    const onXpBurst = () => setBurstSignal((n) => n + 1);
    const onResetCamera = () => {
      setSelectedStation(null);
      setDrawerOpen(false);
      setResetSignal((n) => n + 1);
    };

    window.addEventListener('mars:game-updated', onGameUpdated);
    window.addEventListener('mars:screensaver', onScreensaverChanged);
    window.addEventListener('mars:station-changed', onStationChangedFromUI);
    window.addEventListener('mars:xp-burst', onXpBurst);
    window.addEventListener('mars:reset-camera', onResetCamera);

    return () => {
      window.removeEventListener('mars:game-updated', onGameUpdated);
      window.removeEventListener('mars:screensaver', onScreensaverChanged);
      window.removeEventListener('mars:station-changed', onStationChangedFromUI);
      window.removeEventListener('mars:xp-burst', onXpBurst);
      window.removeEventListener('mars:reset-camera', onResetCamera);
    };
  }, []);

  const handleSelectStation = (stationId) => {
    if (screensaverMode) return;
    if (!stationId) {
      setSelectedStation(null);
      setDrawerOpen(false);
      if (typeof window.closeMarsStationDrawer === 'function') {
        window.closeMarsStationDrawer(true);
      }
      return;
    }
    setSelectedStation(stationId);
    setDrawerOpen(true);
    if (typeof window.openMarsStation === 'function') {
      window.openMarsStation(stationId, true);
    }
  };

  return h(
    Canvas,
    {
      shadows: 'percentage',
      orthographic: true,
      camera: { position: [14, 11.8, 14], zoom: 68, near: -25, far: 120 },
      dpr: [1, 2],
      gl: { antialias: true, powerPreference: 'high-performance' },
      style: { width: '100%', height: '100%', display: 'block' },
    },
    h(MarsDioramaScene, {
      gameState,
      selectedStation,
      drawerOpen,
      onSelectStation: handleSelectStation,
      screensaverMode,
      burstSignal,
      resetSignal,
    })
  );
}

function mountMarsDiorama() {
  const container = document.getElementById('marsCanvasRoot');
  if (!container) return;
  try {
    const root = createRoot(container);
    root.render(h(MarsViewportApp));
    const loader = document.getElementById('marsLoadingBadge');
    if (loader) loader.style.display = 'none';
  } catch (err) {
    console.error('[MarsDiorama] Mount error:', err);
    const loader = document.getElementById('marsLoadingBadge');
    if (loader) loader.textContent = '3D WebGL 초기화 실패 (브라우저 WebGL 확인)';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountMarsDiorama);
} else {
  mountMarsDiorama();
}
