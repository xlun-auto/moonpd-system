/**
 * MarketLens Intelligence — 3D Sector Twin Simulation (Low-Poly Mars Base Diorama)
 * Powered by Three.js + @react-three/fiber + @react-three/drei (Zero-build ESM)
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';

const h = React.createElement;

const DEFAULT_TRACK_STATE = {
  'TRK-01': { id: 'TRK-01', name: '핵심업무', structure: '풍력 발전기 (x3)', completed: 1, total: 3, rate: 0.33 },
  'TRK-02': { id: 'TRK-02', name: '일상루틴', structure: '탐사 로버 (x2)', completed: 1, total: 3, rate: 0.33 },
  'TRK-03': { id: 'TRK-03', name: '미래자산·이직', structure: '중앙 지오데식 돔', completed: 1, total: 3, rate: 0.33 },
  'TRK-04': { id: 'TRK-04', name: '건강·라이프', structure: '거주 모듈 (x3)', completed: 1, total: 3, rate: 0.33 },
};

/* ============================================================================
   1. Mars Terrain Cross-Section Cube (Floating Miniature Diorama Plinth)
   ============================================================================ */
function MarsTerrainBlock() {
  const topGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(6.24, 6.24, 22, 22);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.hypot(x, z);
      const edgeDist = Math.max(Math.abs(x), Math.abs(z));
      // Keep central base pad flat so buildings sit flush
      let y = 0.02;
      if (dist > 1.7 && edgeDist < 2.95) {
        const wave =
          Math.sin(x * 1.15) * Math.cos(z * 1.1) * 0.14 +
          Math.sin(x * 2.4 + z * 1.7) * 0.06;
        // Subtle crater depression near front-right
        const craterDist = Math.hypot(x - 1.95, z - 1.95);
        const crater = craterDist < 0.72 ? -0.16 * Math.cos((craterDist / 0.72) * (Math.PI / 2)) : 0;
        const blend = THREE.MathUtils.clamp((dist - 1.7) / 0.85, 0, 1);
        const edgeFade = THREE.MathUtils.clamp((3.08 - edgeDist) / 0.35, 0, 1);
        y += (wave + crater) * blend * edgeFade;
      }
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  const rocks = useMemo(
    () => [
      { pos: [2.45, 0.12, -2.35], scale: [0.28, 0.2, 0.24], rot: [0.2, 0.7, 0.1], color: '#8f3920' },
      { pos: [2.15, 0.08, -2.55], scale: [0.16, 0.12, 0.15], rot: [0.5, 1.2, 0.3], color: '#a84729' },
      { pos: [-2.52, 0.11, 2.15], scale: [0.24, 0.18, 0.22], rot: [0.1, 2.1, 0.4], color: '#84341e' },
      { pos: [-2.18, 0.07, 2.48], scale: [0.15, 0.11, 0.14], rot: [0.3, 0.4, 0.2], color: '#b04e2e' },
      { pos: [2.58, 0.09, 0.35], scale: [0.2, 0.14, 0.19], rot: [0.6, 1.8, 0.1], color: '#943c22' },
      { pos: [-0.85, 0.08, 2.62], scale: [0.22, 0.15, 0.18], rot: [0.2, 1.1, 0.5], color: '#9d4126' },
      { pos: [0.95, 0.08, -2.65], scale: [0.21, 0.16, 0.17], rot: [0.4, 2.5, 0.2], color: '#89361f' },
    ],
    []
  );

  return h(
    'group',
    { name: 'MarsTerrainBlock' },
    // Top sculpted low-poly regolith surface
    h(
      'mesh',
      { geometry: topGeo, receiveShadow: true, castShadow: true },
      h('meshStandardMaterial', {
        color: '#c95c36',
        roughness: 0.88,
        metalness: 0.04,
        flatShading: true,
      })
    ),
    // Upper regolith strata
    h(
      'mesh',
      { position: [0, -0.18, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [6.24, 0.38, 6.24] }),
      h('meshStandardMaterial', { color: '#a34022', roughness: 0.9, metalness: 0.05 })
    ),
    // Mid terracotta sedimentary strata
    h(
      'mesh',
      { position: [0, -0.6, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [6.2, 0.48, 6.2] }),
      h('meshStandardMaterial', { color: '#6b2919', roughness: 0.92, metalness: 0.06 })
    ),
    // Deep basalt bedrock base
    h(
      'mesh',
      { position: [0, -1.04, 0], receiveShadow: true, castShadow: true },
      h('boxGeometry', { args: [6.14, 0.42, 6.14] }),
      h('meshStandardMaterial', { color: '#2b1817', roughness: 0.86, metalness: 0.12 })
    ),
    // Subtle dark brushed metallic plinth rim
    h(
      'mesh',
      { position: [0, -1.27, 0] },
      h('boxGeometry', { args: [6.2, 0.05, 6.2] }),
      h('meshStandardMaterial', { color: '#1b2230', roughness: 0.45, metalness: 0.65 })
    ),
    // Low-poly Martian rocks
    ...rocks.map((r, idx) =>
      h(
        'mesh',
        {
          key: `rock-${idx}`,
          position: r.pos,
          scale: r.scale,
          rotation: r.rot,
          castShadow: true,
          receiveShadow: true,
        },
        h('dodecahedronGeometry', { args: [1, 0] }),
        h('meshStandardMaterial', { color: r.color, roughness: 0.9, flatShading: true })
      )
    )
  );
}

/* ============================================================================
   2. Central Geodesic Dome (TRK-03 미래자산·이직) + Amber Glow & XP Particles
   ============================================================================ */
function XpParticles({ rate, burstSignal }) {
  const count = 26;
  const groupRef = useRef();
  const burstRef = useRef(0);
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      angle: (i / count) * Math.PI * 2 + (i % 3) * 0.4,
      radius: 0.35 + (i % 5) * 0.17,
      speed: 0.45 + (i % 4) * 0.22,
      phase: (i / count) * 2.6,
      scale: 0.045 + (i % 3) * 0.02,
    }));
  }, []);

  useEffect(() => {
    if (burstSignal > 0) {
      burstRef.current = 1.6;
    }
  }, [burstSignal]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (burstRef.current > 0) {
      burstRef.current = Math.max(0, burstRef.current - delta * 0.9);
    }
    const activeIntensity = Math.min(1, rate * 1.15 + burstRef.current);
    const children = groupRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const p = particles[i];
      p.phase += delta * p.speed * (0.7 + activeIntensity * 1.4);
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
        mesh.rotation.y += delta * 2.2;
        mesh.rotation.x += delta * 1.5;
        const fade = Math.sin(t * Math.PI);
        const s = p.scale * fade * (1 + burstRef.current * 0.45);
        mesh.scale.setScalar(Math.max(0.001, s));
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
  const amberIntensity = 0.22 + rate * 2.1 + (selected ? 0.45 : 0) + (hovered ? 0.25 : 0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (beaconRef.current) {
      beaconRef.current.material.emissiveIntensity = 1.2 + Math.sin(t * 3.2) * 0.65;
    }
    if (windowLightRef.current) {
      windowLightRef.current.intensity = (0.35 + rate * 2.4) * (0.94 + Math.sin(t * 2.1) * 0.06);
    }
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
    // Foundation ring
    h(
      'mesh',
      { position: [0, 0.09, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [1.18, 1.28, 0.18, 10] }),
      h('meshStandardMaterial', { color: '#39414f', roughness: 0.72, metalness: 0.28, flatShading: true })
    ),
    // Selection highlight ring
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.04, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [1.34, 1.46, 24] }),
        h('meshBasicMaterial', {
          color: '#ff9f0a',
          transparent: true,
          opacity: selected ? 0.85 : 0.45,
          side: THREE.DoubleSide,
        })
      ),
    // Outer geodesic matte shell (hemisphere)
    h(
      'mesh',
      { position: [0, 0.16, 0], castShadow: true, receiveShadow: true },
      h('sphereGeometry', { args: [1.02, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52] }),
      h('meshStandardMaterial', {
        color: '#e8e2d8',
        roughness: 0.68,
        metalness: 0.08,
        flatShading: true,
      })
    ),
    // Geodesic wireframe structural ribs
    h(
      'mesh',
      { position: [0, 0.16, 0] },
      h('sphereGeometry', { args: [1.032, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52] }),
      h('meshStandardMaterial', {
        color: '#2b3442',
        wireframe: true,
        roughness: 0.5,
        metalness: 0.55,
      })
    ),
    // 6 Glowing Warm Amber Dome Windows
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
    // Top skylight ring
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
    // Comms spire + pulsing beacon
    h(
      'mesh',
      { position: [0, 1.38, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.025, 0.05, 0.58, 6] }),
      h('meshStandardMaterial', { color: '#5c6678', roughness: 0.4, metalness: 0.6 })
    ),
    h(
      'mesh',
      { ref: beaconRef, position: [0, 1.7, 0] },
      h('octahedronGeometry', { args: [0.065, 0] }),
      h('meshStandardMaterial', {
        color: '#ffb340',
        emissive: '#ff9f0a',
        emissiveIntensity: 1.6,
        toneMapped: false,
      })
    ),
    // Warm amber interior point light
    h('pointLight', {
      ref: windowLightRef,
      position: [0, 0.72, 0],
      color: '#ff9f38',
      distance: 4.5,
      decay: 2,
      intensity: 0.4 + rate * 2.2,
    }),
    // Rising XP Particles
    h(XpParticles, { rate, burstSignal })
  );
}

/* ============================================================================
   3. Connecting Tunnels + 3 Cylindrical Habitat Modules (TRK-04 건강·라이프)
   ============================================================================ */
function HabitatModules({ rate, selected, hovered, onHover, onSelect }) {
  const modules = useMemo(
    () => [
      { angle: (210 * Math.PI) / 180, dist: 1.88 },
      { angle: (330 * Math.PI) / 180, dist: 1.88 },
      { angle: (90 * Math.PI) / 180, dist: 1.88 },
    ],
    []
  );

  const lifeIntensity = 0.25 + rate * 2.3 + (selected ? 0.45 : 0) + (hovered ? 0.25 : 0);

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
        // Pressurized connecting tunnel
        h(
          'group',
          { position: [tx, 0.34, tz], rotation: [0, rotY, 0] },
          h(
            'mesh',
            { rotation: [Math.PI / 2, 0, 0], castShadow: true, receiveShadow: true },
            h('cylinderGeometry', { args: [0.18, 0.18, 0.86, 8] }),
            h('meshStandardMaterial', { color: '#9aa4b2', roughness: 0.6, metalness: 0.35, flatShading: true })
          ),
          // Tunnel structural ribs
          ...[-0.22, 0, 0.22].map((zOff, ri) =>
            h(
              'mesh',
              { key: `rib-${ri}`, position: [0, 0, zOff], rotation: [Math.PI / 2, 0, 0] },
              h('cylinderGeometry', { args: [0.21, 0.21, 0.06, 8] }),
              h('meshStandardMaterial', { color: '#394352', roughness: 0.5, metalness: 0.5 })
            )
          )
        ),
        // Cylindrical habitat module
        h(
          'group',
          { position: [mx, 0.42, mz], rotation: [0, rotY, 0] },
          // Support legs
          ...[-0.32, 0.32].map((xOff, li) =>
            h(
              'mesh',
              { key: `leg-${li}`, position: [xOff, -0.26, 0], castShadow: true },
              h('boxGeometry', { args: [0.12, 0.32, 0.52] }),
              h('meshStandardMaterial', { color: '#353e4c', roughness: 0.7, metalness: 0.4 })
            )
          ),
          // Main horizontal cylinder hull
          h(
            'mesh',
            { rotation: [0, 0, Math.PI / 2], castShadow: true, receiveShadow: true },
            h('cylinderGeometry', { args: [0.36, 0.36, 1.08, 10] }),
            h('meshStandardMaterial', { color: '#dfe4ec', roughness: 0.65, metalness: 0.12, flatShading: true })
          ),
          // End caps
          ...[-0.54, 0.54].map((xEnd, ei) =>
            h(
              'mesh',
              { key: `cap-${ei}`, position: [xEnd, 0, 0], castShadow: true },
              h('sphereGeometry', { args: [0.355, 8, 6] }),
              h('meshStandardMaterial', { color: '#c4ccd8', roughness: 0.68, flatShading: true })
            )
          ),
          // Dark hull ribs
          ...[-0.28, 0.28].map((xRib, ri) =>
            h(
              'mesh',
              { key: `hrib-${ri}`, position: [xRib, 0, 0], rotation: [0, 0, Math.PI / 2] },
              h('cylinderGeometry', { args: [0.375, 0.375, 0.08, 10] }),
              h('meshStandardMaterial', { color: '#3b4555', roughness: 0.55, metalness: 0.4 })
            )
          ),
          // Emerald / Cyan Life-Support Accent Strip & Porthole Windows
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
          // Rooftop life-support status beacon
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
          // Selection ring under module
          (selected || hovered) &&
            h(
              'mesh',
              { position: [0, -0.38, 0], rotation: [-Math.PI / 2, 0, 0] },
              h('ringGeometry', { args: [0.62, 0.72, 20] }),
              h('meshBasicMaterial', {
                color: '#10b981',
                transparent: true,
                opacity: selected ? 0.85 : 0.45,
                side: THREE.DoubleSide,
              })
            ),
          // Localized emerald/cyan life-support point light
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
   4. Solar Panel Arrays
   ============================================================================ */
function SolarArrays() {
  const arrays = [
    { pos: [1.55, 0.04, -1.55], rotY: -0.55 },
    { pos: [2.15, 0.04, -1.05], rotY: -0.55 },
    { pos: [-1.52, 0.04, 2.02], rotY: 0.45 },
  ];

  return h(
    'group',
    { name: 'SolarArrays' },
    ...arrays.map((a, idx) =>
      h(
        'group',
        { key: `solar-${idx}`, position: a.pos, rotation: [0, a.rotY, 0] },
        // Pedestal
        h(
          'mesh',
          { position: [0, 0.16, 0], castShadow: true },
          h('cylinderGeometry', { args: [0.045, 0.07, 0.32, 6] }),
          h('meshStandardMaterial', { color: '#475569', roughness: 0.55, metalness: 0.5 })
        ),
        // Angled solar frame
        h(
          'group',
          { position: [0, 0.34, 0], rotation: [0.46, 0, 0] },
          h(
            'mesh',
            { castShadow: true, receiveShadow: true },
            h('boxGeometry', { args: [0.92, 0.04, 0.56] }),
            h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.4, metalness: 0.6 })
          ),
          h(
            'mesh',
            { position: [0, 0.025, 0] },
            h('boxGeometry', { args: [0.84, 0.015, 0.48] }),
            h('meshStandardMaterial', {
              color: '#163b72',
              emissive: '#0a254d',
              emissiveIntensity: 0.45,
              roughness: 0.22,
              metalness: 0.72,
            })
          )
        )
      )
    )
  );
}

/* ============================================================================
   5. 3 Rotating Wind Turbines (TRK-01 핵심업무)
   ============================================================================ */
function SingleTurbine({ pos, height, rate, selected, hovered }) {
  const rotorRef = useRef();

  useFrame((_, delta) => {
    if (!rotorRef.current) return;
    // Speed scales from gentle idle (0.55) to high-output (4.4) with TRK-01 completion
    const speed = 0.55 + rate * 3.85;
    rotorRef.current.rotation.z -= delta * speed;
  });

  return h(
    'group',
    { position: pos },
    // Base pad
    h(
      'mesh',
      { position: [0, 0.06, 0], castShadow: true, receiveShadow: true },
      h('cylinderGeometry', { args: [0.18, 0.24, 0.12, 8] }),
      h('meshStandardMaterial', { color: '#3b4454', roughness: 0.75, flatShading: true })
    ),
    // Selection ring
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, 0.03, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.28, 0.36, 16] }),
        h('meshBasicMaterial', {
          color: '#38bdf8',
          transparent: true,
          opacity: selected ? 0.85 : 0.45,
          side: THREE.DoubleSide,
        })
      ),
    // Tower
    h(
      'mesh',
      { position: [0, height / 2 + 0.08, 0], castShadow: true },
      h('cylinderGeometry', { args: [0.04, 0.085, height, 7] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.6, metalness: 0.15, flatShading: true })
    ),
    // Nacelle
    h(
      'mesh',
      { position: [0, height + 0.1, 0.04], castShadow: true },
      h('boxGeometry', { args: [0.14, 0.14, 0.3] }),
      h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.5, metalness: 0.3, flatShading: true })
    ),
    // Status LED on nacelle
    h(
      'mesh',
      { position: [0, height + 0.19, 0.02] },
      h('boxGeometry', { args: [0.06, 0.05, 0.06] }),
      h('meshStandardMaterial', {
        color: '#38bdf8',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.5 + rate * 2.2,
        toneMapped: false,
      })
    ),
    // Rotating 3-blade rotor
    h(
      'group',
      { ref: rotorRef, position: [0, height + 0.1, 0.2] },
      // Hub nose cone
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
            h('meshStandardMaterial', { color: '#f1f5f9', roughness: 0.55, flatShading: true })
          )
        )
      )
    )
  );
}

function WindTurbines({ rate, selected, hovered, onHover, onSelect }) {
  const turbines = [
    { pos: [-2.25, 0.02, -1.95], height: 1.75 },
    { pos: [-1.45, 0.02, -2.35], height: 1.48 },
    { pos: [-2.42, 0.02, -1.02], height: 1.58 },
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
    ...turbines.map((t, i) =>
      h(SingleTurbine, {
        key: `wt-${i}`,
        pos: t.pos,
        height: t.height,
        rate,
        selected,
        hovered,
      })
    )
  );
}

/* ============================================================================
   6. 2 Moving Exploration Rovers (TRK-02 일상루틴)
   ============================================================================ */
function ExplorationRover({
  orbitRadiusX,
  orbitRadiusZ,
  phaseOffset,
  direction,
  rate,
  selected,
  hovered,
  onHover,
  onSelect,
}) {
  const roverRef = useRef();
  const angleRef = useRef(phaseOffset);
  const headlightOn = rate > 0;
  const beamIntensity = headlightOn ? 0.9 + rate * 2.2 : 0.12;

  useFrame((_, delta) => {
    if (!roverRef.current) return;
    // Active patrol when TRK-02 routines are checked; parked in standby if 0%
    const moveSpeed = headlightOn ? (0.2 + rate * 0.42) * direction : 0;
    angleRef.current += delta * moveSpeed;

    const a = angleRef.current;
    const x = Math.cos(a) * orbitRadiusX;
    const z = Math.sin(a) * orbitRadiusZ;

    // Next point for smooth heading orientation
    const aNext = a + 0.04 * direction;
    const xNext = Math.cos(aNext) * orbitRadiusX;
    const zNext = Math.sin(aNext) * orbitRadiusZ;

    roverRef.current.position.set(x, 0.14 + (headlightOn ? Math.sin(a * 12) * 0.012 : 0), z);
    roverRef.current.rotation.y = Math.atan2(xNext - x, zNext - z);
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
    // Chassis
    h(
      'mesh',
      { position: [0, 0.05, 0], castShadow: true },
      h('boxGeometry', { args: [0.28, 0.13, 0.44] }),
      h('meshStandardMaterial', { color: '#e6a856', roughness: 0.58, metalness: 0.18, flatShading: true })
    ),
    // Upper deck
    h(
      'mesh',
      { position: [0, 0.13, -0.04], castShadow: true },
      h('boxGeometry', { args: [0.22, 0.05, 0.28] }),
      h('meshStandardMaterial', { color: '#1e3a5f', roughness: 0.35, metalness: 0.65 })
    ),
    // Sensor mast
    h(
      'mesh',
      { position: [0, 0.23, 0.12], castShadow: true },
      h('cylinderGeometry', { args: [0.02, 0.025, 0.18, 6] }),
      h('meshStandardMaterial', { color: '#cbd5e1', roughness: 0.45, metalness: 0.5 })
    ),
    h(
      'mesh',
      { position: [0, 0.32, 0.13] },
      h('boxGeometry', { args: [0.11, 0.06, 0.07] }),
      h('meshStandardMaterial', { color: '#e2e8f0', roughness: 0.45, flatShading: true })
    ),
    // 6 Wheels
    ...wheelPositions.map((wp, wi) =>
      h(
        'mesh',
        { key: `whl-${wi}`, position: wp, rotation: [0, 0, Math.PI / 2], castShadow: true },
        h('cylinderGeometry', { args: [0.065, 0.065, 0.055, 8] }),
        h('meshStandardMaterial', { color: '#272c36', roughness: 0.85, flatShading: true })
      )
    ),
    // Dual Headlights
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
    // Volumetric-style headlight beam cone when active
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
    headlightOn &&
      h('pointLight', {
        position: [0, 0.12, 0.5],
        color: '#fef3c7',
        intensity: 0.45 + rate * 1.15,
        distance: 2.2,
        decay: 2,
      }),
    // Selection ring
    (selected || hovered) &&
      h(
        'mesh',
        { position: [0, -0.09, 0], rotation: [-Math.PI / 2, 0, 0] },
        h('ringGeometry', { args: [0.34, 0.42, 16] }),
        h('meshBasicMaterial', {
          color: '#fde047',
          transparent: true,
          opacity: selected ? 0.85 : 0.45,
          side: THREE.DoubleSide,
        })
      )
  );
}

/* ============================================================================
   7. Reflective Dark Studio Floor + Diorama Scene Assembly
   ============================================================================ */
function MarsDioramaScene({
  trackState,
  selectedTrack,
  onSelectTrack,
  screensaverMode,
  burstSignal,
  resetSignal,
}) {
  const [hoveredTrack, setHoveredTrack] = useState(null);
  const dioramaRef = useRef();
  const controlsRef = useRef();

  useEffect(() => {
    document.body.style.cursor = hoveredTrack ? 'pointer' : 'auto';
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, [hoveredTrack]);

  useEffect(() => {
    if (resetSignal > 0 && controlsRef.current) {
      controlsRef.current.reset();
    }
  }, [resetSignal]);

  useFrame((state) => {
    if (dioramaRef.current) {
      // Gentle museum-plinth float
      dioramaRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.85) * 0.055;
    }
  });

  const trk1 = trackState['TRK-01']?.rate ?? 0.33;
  const trk2 = trackState['TRK-02']?.rate ?? 0.33;
  const trk3 = trackState['TRK-03']?.rate ?? 0.33;
  const trk4 = trackState['TRK-04']?.rate ?? 0.33;

  const hoverLabels = {
    'TRK-01': { title: '풍력 발전기 ×3', sub: 'TRK-01 핵심업무', pos: [-2.1, 2.3, -1.8] },
    'TRK-02': { title: '탐사 로버 ×2', sub: 'TRK-02 일상루틴', pos: [0, 1.25, 2.3] },
    'TRK-03': { title: '중앙 지오데식 돔', sub: 'TRK-03 미래자산·이직', pos: [0, 2.05, 0] },
    'TRK-04': { title: '거주 모듈 ×3', sub: 'TRK-04 건강·라이프', pos: [1.7, 1.25, 1.0] },
  };
  const activeHover = hoveredTrack ? hoverLabels[hoveredTrack] : null;

  return h(
    React.Fragment,
    null,
    // Studio Background & Atmospheric Fog
    h('color', { attach: 'background', args: ['#080b12'] }),
    h('fog', { attach: 'fog', args: ['#080b12', 18, 42] }),

    // Warm Amber Key Light + Soft Shadows + Cool Rim Light
    h('hemisphereLight', { args: ['#ffd5b3', '#161b29', 0.58] }),
    h('directionalLight', {
      position: [9, 13, 8],
      intensity: 2.15,
      color: '#ffab6b',
      castShadow: true,
      'shadow-mapSize-width': 2048,
      'shadow-mapSize-height': 2048,
      'shadow-camera-near': 2,
      'shadow-camera-far': 30,
      'shadow-camera-left': -6,
      'shadow-camera-right': 6,
      'shadow-camera-top': 6,
      'shadow-camera-bottom': -6,
      'shadow-bias': -0.0004,
      'shadow-radius': 4,
    }),
    // Cool indigo/cyan rim light for miniature silhouette pop
    h('directionalLight', {
      position: [-10, 6, -9],
      intensity: 0.95,
      color: '#6ca6ff',
    }),
    // Warm under-bounce accent
    h('pointLight', {
      position: [0, -1.45, 0],
      intensity: 0.55,
      color: '#d95b26',
      distance: 8,
    }),

    // Floating Diorama Group
    h(
      'group',
      { ref: dioramaRef },
      h(MarsTerrainBlock),
      h(GeodesicDome, {
        rate: trk3,
        selected: selectedTrack === 'TRK-03',
        hovered: hoveredTrack === 'TRK-03',
        onHover: setHoveredTrack,
        onSelect: onSelectTrack,
        burstSignal,
      }),
      h(HabitatModules, {
        rate: trk4,
        selected: selectedTrack === 'TRK-04',
        hovered: hoveredTrack === 'TRK-04',
        onHover: setHoveredTrack,
        onSelect: onSelectTrack,
      }),
      h(SolarArrays),
      h(WindTurbines, {
        rate: trk1,
        selected: selectedTrack === 'TRK-01',
        hovered: hoveredTrack === 'TRK-01',
        onHover: setHoveredTrack,
        onSelect: onSelectTrack,
      }),
      h(ExplorationRover, {
        orbitRadiusX: 2.48,
        orbitRadiusZ: 2.38,
        phaseOffset: 0.55,
        direction: 1,
        rate: trk2,
        selected: selectedTrack === 'TRK-02',
        hovered: hoveredTrack === 'TRK-02',
        onHover: setHoveredTrack,
        onSelect: onSelectTrack,
      }),
      h(ExplorationRover, {
        orbitRadiusX: 2.18,
        orbitRadiusZ: 2.58,
        phaseOffset: 3.65,
        direction: -1,
        rate: trk2,
        selected: selectedTrack === 'TRK-02',
        hovered: hoveredTrack === 'TRK-02',
        onHover: setHoveredTrack,
        onSelect: onSelectTrack,
      }),
      // Floating hover tooltip in 3D space (hidden during screensaver)
      !screensaverMode &&
        activeHover &&
        h(
          Html,
          { position: activeHover.pos, center: true, style: { pointerEvents: 'none' } },
          h(
            'div',
            { className: 'mars-3d-tooltip' },
            h('strong', null, activeHover.title),
            h('span', null, activeHover.sub)
          )
        )
    ),

    // Dark Reflective Studio Floor Plane
    h(
      'mesh',
      {
        position: [0, -1.72, 0],
        rotation: [-Math.PI / 2, 0, 0],
        receiveShadow: true,
        onClick: () => onSelectTrack(null),
      },
      h('planeGeometry', { args: [60, 60] }),
      h('meshStandardMaterial', {
        color: '#070a11',
        roughness: 0.22,
        metalness: 0.68,
      })
    ),
    // Soft contact shadows on the dark floor under the floating diorama
    h(ContactShadows, {
      position: [0, -1.7, 0],
      opacity: 0.68,
      scale: 13.5,
      blur: 2.4,
      far: 4.5,
      color: '#000000',
    }),

    // Isometric OrbitControls with zoom & polar angle limits
    h(OrbitControls, {
      ref: controlsRef,
      makeDefault: true,
      enablePan: false,
      enableDamping: true,
      dampingFactor: 0.06,
      minPolarAngle: Math.PI / 6,
      maxPolarAngle: Math.PI / 2.25,
      minZoom: 34,
      maxZoom: 86,
      autoRotate: screensaverMode,
      autoRotateSpeed: screensaverMode ? 0.55 : 0,
    })
  );
}

/* ============================================================================
   8. React Root Wrapper + Event Bridge to app.js
   ============================================================================ */
function MarsViewportApp() {
  const [trackState, setTrackState] = useState(() => window.__MARS_TRACK_STATE__ || DEFAULT_TRACK_STATE);
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [screensaverMode, setScreensaverMode] = useState(() => Boolean(window.__MARS_SCREENSAVER_MODE__));
  const [burstSignal, setBurstSignal] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    const onTracksUpdated = (ev) => {
      if (ev?.detail) setTrackState({ ...ev.detail });
    };
    const onScreensaverChanged = (ev) => {
      setScreensaverMode(Boolean(ev?.detail?.active));
      if (ev?.detail?.active) setSelectedTrack(null);
    };
    const onTrackSelectedFromUI = (ev) => {
      setSelectedTrack(ev?.detail?.trackId || null);
    };
    const onXpBurst = () => {
      setBurstSignal((n) => n + 1);
    };
    const onResetCamera = () => {
      setResetSignal((n) => n + 1);
    };

    window.addEventListener('mars:tracks-updated', onTracksUpdated);
    window.addEventListener('mars:screensaver', onScreensaverChanged);
    window.addEventListener('mars:select-track', onTrackSelectedFromUI);
    window.addEventListener('mars:xp-burst', onXpBurst);
    window.addEventListener('mars:reset-camera', onResetCamera);

    return () => {
      window.removeEventListener('mars:tracks-updated', onTracksUpdated);
      window.removeEventListener('mars:screensaver', onScreensaverChanged);
      window.removeEventListener('mars:select-track', onTrackSelectedFromUI);
      window.removeEventListener('mars:xp-burst', onXpBurst);
      window.removeEventListener('mars:reset-camera', onResetCamera);
    };
  }, []);

  const handleSelectTrack = (trackId) => {
    if (screensaverMode) return;
    setSelectedTrack(trackId);
    if (typeof window.onMarsStructureSelected === 'function') {
      window.onMarsStructureSelected(trackId);
    }
  };

  return h(
    Canvas,
    {
      shadows: 'percentage',
      orthographic: true,
      camera: { position: [12, 10.5, 12], zoom: 54, near: -20, far: 100 },
      dpr: [1, 2],
      gl: { antialias: true, powerPreference: 'high-performance' },
      style: { width: '100%', height: '100%', display: 'block' },
    },
    h(MarsDioramaScene, {
      trackState,
      selectedTrack,
      onSelectTrack: handleSelectTrack,
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
    if (loader) {
      loader.textContent = '3D WebGL 초기화 실패 (브라우저 WebGL 확인)';
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountMarsDiorama);
} else {
  mountMarsDiorama();
}
