// src/SolarSystem3D.jsx
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const defaultColors = [
  "#ffb347",
  "#74b9ff",
  "#ff7675",
  "#a29bfe",
  "#ffeaa7",
  "#55efc4",
  "#fab1a0",
  "#fd79a8",
];

export default function SolarSystem3D({
    starName,
    starColor,
    starRadius,
    orbits,
    showLabels,
    selectedOrbitId,
    onOrbitSelect,
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    console.log("3D rebuild:", starName, starColor, starRadius, orbits.length);

    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 400;

    // Scene & camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050a);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 30, 45);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Resize handler
    function onResize() {
      if (!container || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight || w * 0.6;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    const pointLight = new THREE.PointLight(0xffffff, 2, 0);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Star at center
    const starGeometry = new THREE.SphereGeometry(starRadius || 1.6, 32, 32);
    const starMaterial = new THREE.MeshBasicMaterial({
     color: new THREE.Color(starColor || "#fff1b5"),
});

    const starMesh = new THREE.Mesh(starGeometry, starMaterial);
    scene.add(starMesh);

    // --- Star Name Label ---
    let starLabel = null;

    if (starName) {
    starLabel = createLabelSprite(starName, 48, 0.95);

    // put it slightly above the star
    starLabel.position.set(0, (starRadius || 1.6) + 1.6, 0);

    // size of the label in the scene
    starLabel.scale.set(7, 3.5, 1);

    // match the star color
    starLabel.material.color = new THREE.Color(starColor || "#ffffff");

    // ⭐ always on top of everything
    starLabel.renderOrder = 999;
    starLabel.material.depthTest = false;
    starLabel.material.depthWrite = false;

    scene.add(starLabel);
    }



    // Create a radial gradient texture (no square background)
    function createRadialGlowTexture(size = 256) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2
    );

    gradient.addColorStop(0, "rgba(255,255,200,1.0)");       // bright center
    gradient.addColorStop(0.4, "rgba(255,255,200,0.35)");    // fade
    gradient.addColorStop(1, "rgba(255,255,200,0)");         // fully transparent edge

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
    }

    const glowTexture = createRadialGlowTexture();

    const spriteMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: new THREE.Color(starColor || "#fff1b5"),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
    });


    // this is the only sprite we want around the star
    //const starGlow = new THREE.Sprite(spriteMaterial);

    

    const starGlow = new THREE.Sprite(spriteMaterial);
    starGlow.scale.set((starRadius || 1.6) * 7, (starRadius || 1.6) * 7, 1); // adjust glow size
    scene.add(starGlow);
    // --- End Star Label ---


    // Scaling
    const maxOrbitRadiusAU = orbits.reduce(
      (m, o) => Math.max(m, o.radiusAU),
      orbits.length ? orbits[0].radiusAU : 1
    );
    const baseOrbitScale = 15;
    const orbitScale =
      maxOrbitRadiusAU > 0 ? baseOrbitScale / maxOrbitRadiusAU : 1;

    const allBodies = orbits.flatMap((o) => o.bodies);
    const allRadiiRaw = allBodies.map((b) => b.bodyRadius || 1);
    const minR = allRadiiRaw.length ? Math.min(...allRadiiRaw) : 1;
    const maxR = allRadiiRaw.length ? Math.max(...allRadiiRaw) : 1;
    const rangeR = maxR - minR || 1;

    const planetObjects = [];
    const orbitMeshes = []; // for raycasting`

    function createLabelSprite(text, fontSize = 32, alpha = 0.85) {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        alphaTest: 0.1,
    });

    return new THREE.Sprite(material);
    }


    const createCurvedOrbitLabelSprites = (text, radius) => {
      const chars = text.split("");
      if (!chars.length) return [];

      const sprites = [];
      const centerAngle = Math.PI / 2; // top
      const arcSpan = Math.min(Math.PI / 6.5, 0.06 * chars.length); // clamp a bit

      const halfSpan = arcSpan / 2;
      const startAngle = centerAngle - halfSpan;
      const endAngle = centerAngle + halfSpan;

      chars.forEach((ch, idx) => {
        const t =
          chars.length === 1
            ? 0.5
            : idx / (chars.length - 1); // 0..1 across chars
        const angle = startAngle + t * (endAngle - startAngle);
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);

        const sprite = createLabelSprite(ch, 40, 0.8);
        sprite.position.set(x, 0.25, z);
        sprite.scale.set(0.8 * 4, 0.8 * 2, 1); // slightly smaller
        sprites.push(sprite);
        scene.add(sprite);
      });

      return sprites;
    };

    const getOrbitColor = (orbit) => {
      const type = (orbit.type || "").toLowerCase();
      const name = (orbit.name || "").toLowerCase();

      // Simple heuristics
      if (type.includes("habitable") || name.includes("habitable")) {
        return 0x27ae60; // green
      }
      if (type.includes("asteroid") || name.includes("asteroid")) {
        return 0x7f8c8d; // gray
      }
      if (type.includes("inner") || name.includes("inner")) {
        return 0x2980b9; // blue-ish
      }
      if (type.includes("outer") || name.includes("outer")) {
        return 0x8e44ad; // purple-ish
      }
      return 0x34495e; // default
    };

    // Build orbits + bodies
    let colorIndex = 0;

    orbits.forEach((orbit, orbitIndex) => {
      const orbitRadius = orbit.radiusAU * orbitScale || 0.1;

      const curve = new THREE.EllipseCurve(0, 0, orbitRadius, orbitRadius);
      const points = curve.getPoints(256);
      const orbitGeometry = new THREE.BufferGeometry().setFromPoints(points);

      const pos = orbitGeometry.attributes.position;
      const positions = [];
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = 0;
        const z = pos.getY(i);
        positions.push(x, y, z);
      }
      orbitGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );

      const baseColor = getOrbitColor(orbit);
      const isSelected = selectedOrbitId && String(selectedOrbitId) === String(orbit.id);

      
      // --- ORBIT STYLE HANDLING (simple version) ---

    const style = (orbit.style || "").toLowerCase();
    

    // choose color: CSV override → fallback logic
    const orbitHex = orbit.color
    ? new THREE.Color(orbit.color).getHex()
    : getOrbitColor(orbit);

    let orbitLine;

    // 1️⃣ DASHED ORBIT (asteroid belt)
    if (style === "dashed") {
    const dashedMaterial = new THREE.LineDashedMaterial({
        color: orbitHex,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.7,
        dashSize: 0.6,
        gapSize: 0.35,
    });

    orbitLine = new THREE.LineLoop(orbitGeometry, dashedMaterial);
    orbitLine.computeLineDistances(); // REQUIRED for dashed lines
    }
    // 2️⃣ NORMAL OR GLOW ORBIT (solid line)
    else {
    const solidMaterial = new THREE.LineBasicMaterial({
        color: orbitHex,
        transparent: true,
        opacity: isSelected ? 1.0 : 0.6,
    });

    orbitLine = new THREE.LineLoop(orbitGeometry, solidMaterial);
    }

    // common setup
    orbitLine.userData.orbitId = orbit.id;
    scene.add(orbitLine);
    orbitMeshes.push(orbitLine);

    // 3️⃣ OPTIONAL GLOW (for habitable zones)
    if (style === "glow") {
    const glowMaterial = new THREE.LineBasicMaterial({
        color: orbitHex,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    const glowLine = new THREE.LineLoop(
        orbitGeometry.clone(),
        glowMaterial
    );
    glowLine.scale.set(1.01, 1.01, 1.01); // slightly bigger ring
    scene.add(glowLine);
    }



      // Curved orbit name
      if (orbit.name) {
        createCurvedOrbitLabelSprites(orbit.name, orbitRadius);
      }

      const bodies = orbit.bodies || [];
      const count = bodies.length || 1;

      bodies.forEach((body, bodyIndex) => {
        const isAsteroid =
          body.type && body.type.toLowerCase() === "asteroid";

        const t =
          (body.bodyRadius - minR) / rangeR; // normalized 0..1
        const minPlanetRadius = isAsteroid ? 0.08 : 0.25;
        const maxPlanetRadius = isAsteroid ? 0.18 : 0.8;
        const radiusScaled =
          minPlanetRadius +
          (maxPlanetRadius - minPlanetRadius) *
            Math.sqrt(Math.max(0, Math.min(1, t)));

        const geometry = new THREE.SphereGeometry(radiusScaled, 24, 24);

        const defaultColor = isAsteroid
          ? "#b2bec3"
          : defaultColors[colorIndex++ % defaultColors.length];
        const colorHex = body.color || defaultColor;
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          roughness: 0.5,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(geometry, material);

        const baseAngle = (bodyIndex / count) * Math.PI * 2;
        const angleOffset = orbitIndex * 0.1;
        const initialAngle = baseAngle + angleOffset;

        mesh.position.set(
          orbitRadius * Math.cos(initialAngle),
          0,
          orbitRadius * Math.sin(initialAngle)
        );
        scene.add(mesh);

        let labelSprite = null;
        if (showLabels) {
          labelSprite = createLabelSprite(body.name, 32, 0.9);
          labelSprite.position.set(
            mesh.position.x,
            mesh.position.y + radiusScaled * 1.8,
            mesh.position.z
          );
          labelSprite.scale.set(4, 2, 1);
          scene.add(labelSprite);
        }

        let angularSpeed;
        if (body.periodDays && body.periodDays > 0) {
          angularSpeed = (2 * Math.PI) / body.periodDays;
        } else {
          const base = 2 * Math.PI;
          const rAU = Math.max(body.orbitAU || orbit.radiusAU || 0.1, 0.1);
          angularSpeed = base / Math.pow(rAU, 1.5);
        }

        planetObjects.push({
          mesh,
          labelSprite,
          orbitRadius,
          angularSpeed,
          angle: initialAngle,
          radiusScaled,
        });
      });
    });

    // Camera controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.zoomSpeed = 0.6;
    controls.minDistance = 5;
    controls.maxDistance = 120;
    controls.enablePan = false;

    // Raycasting for orbit click
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerDown = (event) => {
      if (!onOrbitSelect) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x =
        ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y =
        -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(orbitMeshes, false);
      if (intersects.length > 0) {
        const mesh = intersects[0].object;
        const orbitId = mesh.userData.orbitId;
        onOrbitSelect(orbitId);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);

    // Animation loop
    let lastTime = performance.now();
    const speedFactor = 0.008;

    const animate = () => {
      const now = performance.now();
      const deltaMs = now - lastTime;
      lastTime = now;
      const deltaSeconds = deltaMs / 1000;

      planetObjects.forEach((obj) => {
        obj.angle += obj.angularSpeed * deltaSeconds * speedFactor;
        const x = obj.orbitRadius * Math.cos(obj.angle);
        const z = obj.orbitRadius * Math.sin(obj.angle);
        obj.mesh.position.set(x, 0, z);
        if (obj.labelSprite) {
          obj.labelSprite.position.set(x, obj.radiusScaled * 2.0, z);
        }
      });

      controls.update();
      renderer.render(scene, camera);
      animationIdRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationIdRef.current);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener(
        "pointerdown",
        handlePointerDown
      );
      controls.dispose();

      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose && m.dispose());
          } else {
            obj.material.dispose && obj.material.dispose();
          }
        }
        if (obj.texture) obj.texture.dispose && obj.texture.dispose();
      });

      if (starLabel) {
        if (starLabel.material?.map) starLabel.material.map.dispose();
        if (starLabel.material) starLabel.material.dispose();
      } 

      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [orbits, showLabels, starName, starColor, starRadius, selectedOrbitId, onOrbitSelect]);

  return <div className="three-container" ref={containerRef} />;
}
