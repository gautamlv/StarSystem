// src/App.jsx
import React, { useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
import SolarSystem3D from "./SolarSystem3D";

function normalizeRow(rawRow) {
  // Keys → lowercase + no spaces: "Buying Entity" -> "buyingentity"
  const normalized = {};
  Object.keys(rawRow).forEach((key) => {
    const normKey = key.toLowerCase().replace(/\s+/g, "");
    normalized[normKey] = rawRow[key];
  });
  return normalized;
}

function parseCSVToHierarchy(csvText) {
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors && result.errors.length) {
    console.warn("CSV parse warnings:", result.errors);
  }

  const hierarchy = {};

  for (const rawRow of result.data) {
    const row = normalizeRow(rawRow);

    const buyingEntity = (row["buyingentity"] || "").trim();
    const tenant = (row["tenant"] || "").trim();
    const galaxy = (row["galaxy"] || "").trim();
    const star = (row["star"] || "").trim();

    if (!buyingEntity || !tenant || !galaxy || !star) continue;

    // ✅ Star styling (per row; we’ll store it on the star object)
    const starColor = (row["starcolor"] || "").trim();
    const starRadiusRaw = (row["starradius"] || "").toString().replace(",", ".");
    const starRadius = parseFloat(starRadiusRaw);

    // ✅ Orbit styling (per row)
    const orbitStyle = (row["orbitstyle"] || "").trim(); // Default | Dashed | Glow
    const orbitColor = (row["orbitcolor"] || "").trim(); // e.g. #27ae60

    const orbitIdRaw = row["orbit"] || row["orbitid"] || row["orbitindex"];
    const orbitId = (orbitIdRaw ?? "").toString().trim() || "orbit-1";

    const orbitAU = parseFloat((row["orbitau"] || "").toString().replace(",", "."));

    const bodyRadius = parseFloat(
      (row["bodyradius"] || row["planetradius"] || "").toString().replace(",", ".")
    );

    const bodyName =
      (row["bodyname"] || row["planet"] || row["name"] || "").trim();
    if (!bodyName) continue;

    const bodyType = (row["bodytype"] || "Planet").trim();
    const bodyColor = (row["bodycolor"] || row["planetcolor"] || "").trim();

    const periodRaw = row["perioddays"];
    const periodDays = periodRaw
      ? parseFloat(periodRaw.toString().replace(",", "."))
      : NaN;

    const orbitName =
      (row["orbitname"] || row["orbitlabel"] || row["orbitdesc"] || "").trim();

    const orbitType = (row["orbittype"] || "").trim();

    // --- Build hierarchy ---
    if (!hierarchy[buyingEntity]) {
      hierarchy[buyingEntity] = { name: buyingEntity, tenants: {} };
    }
    const entity = hierarchy[buyingEntity];

    if (!entity.tenants[tenant]) {
      entity.tenants[tenant] = { name: tenant, galaxies: {} };
    }
    const tenantObj = entity.tenants[tenant];

    if (!tenantObj.galaxies[galaxy]) {
      tenantObj.galaxies[galaxy] = { name: galaxy, stars: {} };
    }
    const galaxyObj = tenantObj.galaxies[galaxy];

    if (!galaxyObj.stars[star]) {
      galaxyObj.stars[star] = {
        name: star,
        color: starColor || "#fff1b5",
        radius: Number.isFinite(starRadius) ? starRadius : 1.6,
        orbits: {},
      };
    } else {
      // Always let CSV override if present
      if (starColor) galaxyObj.stars[star].color = starColor;
      if (Number.isFinite(starRadius)) galaxyObj.stars[star].radius = starRadius;
    }
    const starObj = galaxyObj.stars[star];

    if (!starObj.orbits[orbitId]) {
      starObj.orbits[orbitId] = {
        id: orbitId,
        name: orbitName || `Orbit ${orbitId}`,
        type: orbitType || "",
        style: orbitStyle || "",
        color: orbitColor || "",
        radiusAU: Number.isFinite(orbitAU) ? orbitAU : 1,
        bodies: [],
      };
    } else {
      // backfill orbit info if later rows have it
      if (orbitName) starObj.orbits[orbitId].name = orbitName;
      if (orbitType) starObj.orbits[orbitId].type = orbitType;
      if (orbitStyle) starObj.orbits[orbitId].style = orbitStyle;
      if (orbitColor) starObj.orbits[orbitId].color = orbitColor;
      if (Number.isFinite(orbitAU) && !Number.isFinite(starObj.orbits[orbitId].radiusAU)) {
        starObj.orbits[orbitId].radiusAU = orbitAU;
      }
    }

    const orbitObj = starObj.orbits[orbitId];

    // If orbit radius missing but this row has it
    if (!Number.isFinite(orbitObj.radiusAU) && Number.isFinite(orbitAU)) {
      orbitObj.radiusAU = orbitAU;
    }

    orbitObj.bodies.push({
      name: bodyName,
      type: bodyType || "Planet",
      orbitId,
      orbitAU: Number.isFinite(orbitAU) ? orbitAU : orbitObj.radiusAU,
      bodyRadius: Number.isFinite(bodyRadius) ? bodyRadius : 1,
      color: bodyColor,
      periodDays: Number.isFinite(periodDays) ? periodDays : null,
      notes: (row["notes"] || "").trim(),
      buyingEntity,
      tenant,
      galaxy,
      star,
    });
  }

  // --- Stats ---
  let entityCount = 0;
  let tenantCount = 0;
  let galaxyCount = 0;
  let starCount = 0;
  let bodyCount = 0;

  Object.values(hierarchy).forEach((entity) => {
    entityCount++;
    Object.values(entity.tenants).forEach((tenantObj) => {
      tenantCount++;
      Object.values(tenantObj.galaxies).forEach((galaxyObj) => {
        galaxyCount++;
        Object.values(galaxyObj.stars).forEach((starObj) => {
          starCount++;
          Object.values(starObj.orbits).forEach((orbitObj) => {
            bodyCount += orbitObj.bodies.length;
          });
        });
      });
    });
  });

  return {
    hierarchy,
    counts: { entityCount, tenantCount, galaxyCount, starCount, bodyCount },
  };
}


export default function App() {
  const [hierarchy, setHierarchy] = useState(null);
  const [error, setError] = useState("");
  const [stats, setStats] = useState("");

  const [selectedEntity, setSelectedEntity] = useState("");
  const [selectedTenant, setSelectedTenant] = useState("");
  const [selectedGalaxy, setSelectedGalaxy] = useState("");
  const [selectedStar, setSelectedStar] = useState("");

  const [showLabels, setShowLabels] = useState(true);
  const [selectedOrbitId, setSelectedOrbitId] = useState(null);

  const entityNames = useMemo(() => {
    if (!hierarchy) return [];
    return Object.keys(hierarchy).sort((a, b) => a.localeCompare(b));
  }, [hierarchy]);

  const tenantNames = useMemo(() => {
    if (!hierarchy || !selectedEntity || !hierarchy[selectedEntity]) return [];
    return Object.keys(hierarchy[selectedEntity].tenants).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [hierarchy, selectedEntity]);

  const galaxyNames = useMemo(() => {
    if (
      !hierarchy ||
      !selectedEntity ||
      !selectedTenant ||
      !hierarchy[selectedEntity]?.tenants[selectedTenant]
    )
      return [];
    return Object.keys(
      hierarchy[selectedEntity].tenants[selectedTenant].galaxies
    ).sort((a, b) => a.localeCompare(b));
  }, [hierarchy, selectedEntity, selectedTenant]);

  const starNames = useMemo(() => {
    if (
      !hierarchy ||
      !selectedEntity ||
      !selectedTenant ||
      !selectedGalaxy ||
      !hierarchy[selectedEntity]?.tenants[selectedTenant]?.galaxies[
        selectedGalaxy
      ]
    )
      return [];
    return Object.keys(
      hierarchy[selectedEntity].tenants[selectedTenant].galaxies[selectedGalaxy]
        .stars
    ).sort((a, b) => a.localeCompare(b));
  }, [hierarchy, selectedEntity, selectedTenant, selectedGalaxy]);

  const currentStar = useMemo(() => {
    if (
      !hierarchy ||
      !selectedEntity ||
      !selectedTenant ||
      !selectedGalaxy ||
      !selectedStar
    )
      return null;

    const starObj =
      hierarchy[selectedEntity].tenants[selectedTenant].galaxies[
        selectedGalaxy
      ].stars[selectedStar];

    if (!starObj) return null;

    const orbitsArray = Object.values(starObj.orbits).sort(
      (a, b) => a.radiusAU - b.radiusAU
    );

    return {
      name: starObj.name,
      color: starObj.color || "#fff1b5",
      radius: starObj.radius || 1.6,
      orbits: orbitsArray,
    };
  }, [hierarchy, selectedEntity, selectedTenant, selectedGalaxy, selectedStar]);

  const selectedOrbit = useMemo(() => {
    if (!currentStar || !selectedOrbitId) return null;
    return (
      currentStar.orbits.find((o) => String(o.id) === String(selectedOrbitId)) ||
      null
    );
    useEffect(() => {
  if (!hierarchy || !selectedEntity) return;

  // 1️⃣ Pick first Tenant if needed
  const tenants = Object.keys(hierarchy[selectedEntity]?.tenants || {}).sort();
  const tenant =
    selectedTenant && tenants.includes(selectedTenant)
      ? selectedTenant
      : tenants[0];

  if (!tenant) return;
  if (tenant !== selectedTenant) setSelectedTenant(tenant);

  // 2️⃣ Pick first Galaxy if needed
  const galaxies = Object.keys(
    hierarchy[selectedEntity].tenants[tenant]?.galaxies || {}
  ).sort();
  const galaxy =
    selectedGalaxy && galaxies.includes(selectedGalaxy)
      ? selectedGalaxy
      : galaxies[0];

  if (!galaxy) return;
  if (galaxy !== selectedGalaxy) setSelectedGalaxy(galaxy);

  // 3️⃣ Pick first Star if needed
  const stars = Object.keys(
    hierarchy[selectedEntity].tenants[tenant].galaxies[galaxy]?.stars || {}
  ).sort();
  const star =
    selectedStar && stars.includes(selectedStar)
      ? selectedStar
      : stars[0];

  if (!star) return;
  if (star !== selectedStar) setSelectedStar(star);
}, [hierarchy, selectedEntity]);

  }, [currentStar, selectedOrbitId]);

  function resetSelections() {
    setSelectedEntity("");
    setSelectedTenant("");
    setSelectedGalaxy("");
    setSelectedStar("");
    setSelectedOrbitId(null);
  }

  function handleFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    setError("");
    setStats("Parsing CSV…");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const { hierarchy: parsedHierarchy, counts } =
          parseCSVToHierarchy(text);

        if (!Object.keys(parsedHierarchy).length) {
          setError(
            "No valid rows found. Check that your CSV has Buying Entity, Tenant, Galaxy, Star, Orbit, BodyName, OrbitAU, BodyRadius."
          );
          setHierarchy(null);
          setStats("");
          resetSelections();
          return;
        }

        setHierarchy(parsedHierarchy);

        const entities = Object.keys(parsedHierarchy).sort((a, b) =>
          a.localeCompare(b)
        );
        const entity = entities[0];
        const tenants = Object.keys(parsedHierarchy[entity].tenants).sort(
          (a, b) => a.localeCompare(b)
        );
        const tenant = tenants[0];
        const galaxies = Object.keys(
          parsedHierarchy[entity].tenants[tenant].galaxies
        ).sort((a, b) => a.localeCompare(b));
        const galaxy = galaxies[0];
        const stars = Object.keys(
          parsedHierarchy[entity].tenants[tenant].galaxies[galaxy].stars
        ).sort((a, b) => a.localeCompare(b));
        const star = stars[0];

        setSelectedEntity(entity);
        setSelectedTenant(tenant);
        setSelectedGalaxy(galaxy);
        setSelectedStar(star);

        const firstStar =
          parsedHierarchy[entity].tenants[tenant].galaxies[galaxy].stars[star];
        const firstOrbitId = Object.values(firstStar.orbits)[0]?.id ?? null;
        setSelectedOrbitId(firstOrbitId);

        setStats(
          `Loaded ${counts.entityCount} buying entit(y/ies), ` +
            `${counts.tenantCount} tenant(s), ${counts.galaxyCount} galaxy(ies), ` +
            `${counts.starCount} star(s), ${counts.bodyCount} bodies (planets + asteroids).`
        );
        setError("");
      } catch (err) {
        console.error(err);
        setError("Failed to read CSV: " + err.message);
        setHierarchy(null);
        setStats("");
        resetSelections();
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>3D System Visualizer</h1>
        <span>Buying Entity → Tenant → Galaxy → Star → Orbits → Bodies</span>
      </header>

      <main className="app-main">
        <section className="panel control-panel">
          <h2>Data & Filters</h2>

          <label className="field-label">
            1. Upload CSV file
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="file-input"
            />
          </label>
          <div className="hint">
            Columns: <strong>Buying Entity</strong>, <strong>Tenant</strong>,{" "}
            <strong>Galaxy</strong>, <strong>Star</strong>, <strong>Orbit</strong>
            , <strong>OrbitName</strong> (optional),{" "}
            <strong>OrbitType</strong> (optional),{" "}
            <strong>BodyName</strong>, <strong>BodyType</strong>,{" "}
            <strong>OrbitAU</strong>, <strong>BodyRadius</strong>,{" "}
            <strong>BodyColor</strong> (optional),{" "}
            <strong>PeriodDays</strong> (optional), <strong>Notes</strong>.
          </div>

          <label className="field-label">
            Buying Entity
            <select
              value={selectedEntity}
              //onChange={(e) => {
              //  const val = e.target.value;
              //  setSelectedEntity(val);
              //  setSelectedTenant("");
              //  setSelectedGalaxy("");
              //  setSelectedStar("");
              //  setSelectedOrbitId(null);
              //}}
              onChange={(e) => {
              const entity = e.target.value;
              setSelectedEntity(entity);

              // Auto-pick first Tenant
              const tenants = Object.keys(hierarchy?.[entity]?.tenants || {}).sort();
              const tenant = tenants[0] || "";
              setSelectedTenant(tenant);

              // Auto-pick first Galaxy
              const galaxies = tenant
                ? Object.keys(hierarchy[entity].tenants[tenant]?.galaxies || {}).sort()
                : [];
              const galaxy = galaxies[0] || "";
              setSelectedGalaxy(galaxy);

              // Auto-pick first Star
              const stars = galaxy
                ? Object.keys(
                    hierarchy[entity].tenants[tenant].galaxies[galaxy]?.stars || {}
                  ).sort()
                : [];
              const star = stars[0] || "";
              setSelectedStar(star);

              // Auto-pick first Orbit (optional)
              let firstOrbitId = null;
              if (star) {
                const starObj =
                  hierarchy[entity].tenants[tenant].galaxies[galaxy].stars[star];
                const firstOrbit = Object.values(starObj.orbits || {})[0];
                firstOrbitId = firstOrbit?.id ?? null;
              }
              setSelectedOrbitId(firstOrbitId);
            }}

              disabled={!hierarchy}
            >
              {!hierarchy && <option value="">Upload CSV first…</option>}
              {entityNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label tenant-label">
            Tenant
            <select
              value={selectedTenant}
              //onChange={(e) => {
              //  const val = e.target.value;
              //  setSelectedTenant(val);
              //  setSelectedGalaxy("");
              //  setSelectedStar("");
              //  setSelectedOrbitId(null);
              //}}
              onChange={(e) => {
              const tenant = e.target.value;
              setSelectedTenant(tenant);

              const galaxies = Object.keys(
                hierarchy?.[selectedEntity]?.tenants?.[tenant]?.galaxies || {}
              ).sort();
              const galaxy = galaxies[0] || "";
              setSelectedGalaxy(galaxy);

              const stars = galaxy
                ? Object.keys(
                    hierarchy[selectedEntity].tenants[tenant].galaxies[galaxy]?.stars || {}
                  ).sort()
                : [];
              const star = stars[0] || "";
              setSelectedStar(star);

              let firstOrbitId = null;
              if (star) {
                const starObj =
                  hierarchy[selectedEntity].tenants[tenant].galaxies[galaxy].stars[star];
                const firstOrbit = Object.values(starObj.orbits || {})[0];
                firstOrbitId = firstOrbit?.id ?? null;
              }
              setSelectedOrbitId(firstOrbitId);
            }}
              disabled={!tenantNames.length}
            >
              {!tenantNames.length && (
                <option value="">Select Buying Entity…</option>
              )}
              {tenantNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Galaxy
            <select
              value={selectedGalaxy}
              onChange={(e) => {
                const galaxy = e.target.value;
                  setSelectedGalaxy(galaxy);

                  const stars = Object.keys(
                    hierarchy?.[selectedEntity]?.tenants?.[selectedTenant]?.galaxies?.[galaxy]
                      ?.stars || {}
                  ).sort();
                  const star = stars[0] || "";
                  setSelectedStar(star);

                  let firstOrbitId = null;
                  if (star) {
                    const starObj =
                      hierarchy[selectedEntity].tenants[selectedTenant].galaxies[galaxy].stars[
                        star
                      ];
                    firstOrbitId = Object.values(starObj.orbits || {})[0]?.id ?? null;
                  }
                  setSelectedOrbitId(firstOrbitId);
              }}
              disabled={!galaxyNames.length}
            >
              {!galaxyNames.length && (
                <option value="">Select Tenant…</option>
              )}
              {galaxyNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label">
            Star
            <select
              value={selectedStar}
              onChange={(e) => {
                const star = e.target.value;
                setSelectedStar(star);

                let firstOrbitId = null;
                if (star) {
                  const starObj =
                    hierarchy?.[selectedEntity]?.tenants?.[selectedTenant]?.galaxies?.[
                      selectedGalaxy
                    ]?.stars?.[star];

                  firstOrbitId = Object.values(starObj?.orbits || {})[0]?.id ?? null;
                }
                setSelectedOrbitId(firstOrbitId);
              }}
              disabled={!starNames.length}
            >
              {!starNames.length && <option value="">Select Galaxy…</option>}
              {starNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <div className="toggles">
            <label className="toggle">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={(e) => setShowLabels(e.target.checked)}
              />
              Show body labels
            </label>
          </div>

          {stats && <div className="stats">{stats}</div>}
          {error && <div className="error">{error}</div>}

          {currentStar && (
            <>
              <div className="system-meta">
                <div>
                  <span className="meta-label">Buying Entity:</span>{" "}
                  <span className="meta-value">
                    {selectedEntity || "—"}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Tenant:</span>{" "}
                  <span className="meta-value">
                    {selectedTenant || "—"}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Star:</span>{" "}
                  <span className="meta-value">{currentStar.name}</span>
                </div>
                <div>
                  <span className="meta-label">Orbits:</span>{" "}
                  <span className="meta-value">
                    {currentStar.orbits.length}
                  </span>
                </div>
                <div>
                  <span className="meta-label">Bodies:</span>{" "}
                  <span className="meta-value">
                    {currentStar.orbits.reduce(
                      (sum, o) => sum + o.bodies.length,
                      0
                    )}
                  </span>
                </div>
              </div>


              {selectedOrbit && (
                <div className="orbit-details">
                  <div className="orbit-details-title">
                    Selected Orbit: {selectedOrbit.name}{" "}
                    <span className="orbit-id">({selectedOrbit.id})</span>
                  </div>
                  <div className="orbit-details-meta">
                    Radius: {selectedOrbit.radiusAU} AU
                    {selectedOrbit.type && ` · Type: ${selectedOrbit.type}`}
                    <br />
                    Bodies in this orbit: {selectedOrbit.bodies.length}
                  </div>
                  <ul className="orbit-bodies-list">
                    {selectedOrbit.bodies.map((b) => (
                      <li key={b.name + b.type}>
                        <strong>{b.name}</strong> ({b.type}) · Radius {b.bodyRadius}
                        {" · "}
                        BE: {b.buyingEntity}
                        {b.notes && <> · {b.notes}</>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <section className="panel viz-panel">
          <h2>3D View</h2>
          <div className="canvas-wrapper">
            {currentStar ? (
              <SolarSystem3D
                key={`${selectedEntity}|${selectedTenant}|${selectedGalaxy}|${selectedStar}`}
                starName={currentStar.name}
                starColor={currentStar.color}
                starRadius={currentStar.radius}
                orbits={currentStar.orbits}
                showLabels={showLabels}
                selectedOrbitId={selectedOrbitId}
                onOrbitSelect={setSelectedOrbitId}
              />
            ) : (
              <div className="placeholder">
                Upload a CSV and select
                <br />
                Buying Entity → Tenant → Galaxy → Star
                <br />
                then click an orbit ring in 3D
              </div>
            )}
          </div>
          <div className="legend">
            <span>Drag to rotate · Scroll to zoom</span>
            <span>
              Click an orbit ring to select it · Rings = Orbits · Bodies =
              Planets + Asteroids
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
