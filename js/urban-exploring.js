/**
 * urban-exploring.js — Urban Exploring Susceptibility Scoring
 *
 * Estimates the susceptibility of an agro-industrial facility to unauthorized
 * access (urban exploring, trespassing) based on:
 *   1. Perimeter visibility (fences, walls, vegetation)
 *   2. Access point density (gates, road proximity)
 *   3. Surveillance infrastructure (CCTV, lighting)
 *   4. Isolation index (distance to populated areas)
 *   5. Building complexity (footprint size, entrances)
 *
 * Data sources:
 *   - OpenStreetMap via Overpass API (free, no auth)
 *   - Nominatim for geocoding (free, no auth)
 *
 * Score: 0–100 (higher = more susceptible to unauthorized access)
 */

'use strict';

// ── Geocoding ─────────────────────────────────────────────────────────────────

/**
 * Geocode an address to lat/lon using Nominatim (OSM).
 * @param {string} address
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
export async function geocodeAddress(address) {
  const query = encodeURIComponent(address);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Lycalopex/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };
  } catch {
    return null;
  }
}

// ── Overpass API queries ──────────────────────────────────────────────────────

/**
 * Query Overpass API for buildings, barriers, gates, and surveillance.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusKm - Search radius in kilometers (default 0.5 km)
 * @returns {Promise<{buildings: Array, barriers: Array, gates: Array, surveillance: Array}>}
 */
export async function queryOverpassData(lat, lon, radiusKm = 0.5) {
  // Convert km to degrees (rough approximation: 1 degree ≈ 111 km)
  const delta = radiusKm / 111;
  const bbox = `${lat - delta},${lon - delta},${lat + delta},${lon + delta}`;

  const query = `
[bbox:${bbox}];
(
  way["building"];
  way["barrier"="fence"];
  way["barrier"="wall"];
  way["barrier"="hedge"];
  node["barrier"="gate"];
  node["barrier"="lift_gate"];
  node["barrier"="bollard"];
  node["man_made"="surveillance"];
  node["amenity"="parking"];
  way["highway"];
);
out geom;
`;

  const url = 'https://overpass-api.de/api/interpreter';
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/osm3s' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return { buildings: [], barriers: [], gates: [], surveillance: [] };
    const data = await res.json();
    return parseOverpassResponse(data);
  } catch {
    return { buildings: [], barriers: [], gates: [], surveillance: [] };
  }
}

/**
 * Parse Overpass JSON response into categorized features.
 * @param {object} data
 * @returns {object}
 */
function parseOverpassResponse(data) {
  const buildings = [];
  const barriers = [];
  const gates = [];
  const surveillance = [];

  const elements = data.elements || [];
  for (const elem of elements) {
    const tags = elem.tags || {};

    if (tags.building) {
      buildings.push(elem);
    } else if (tags.barrier === 'fence' || tags.barrier === 'wall' || tags.barrier === 'hedge') {
      barriers.push(elem);
    } else if (tags.barrier === 'gate' || tags.barrier === 'lift_gate') {
      gates.push(elem);
    } else if (tags['man_made'] === 'surveillance') {
      surveillance.push(elem);
    }
  }

  return { buildings, barriers, gates, surveillance };
}

// ── Scoring functions ─────────────────────────────────────────────────────────

/**
 * Calculate perimeter visibility score (0-30 pts).
 * Lower = more visible/accessible; Higher = more protected
 * @param {Array} barriers
 * @param {Array} buildings
 * @returns {number}
 */
function scorePerimeterVisibility(barriers, buildings) {
  let score = 15; // baseline

  // Presence of fences/walls reduces visibility
  if (barriers.length > 0) score += 8;
  if (barriers.length > 3) score += 7;

  // Large building footprints are more visible
  const largeBuildings = buildings.filter(b => {
    const area = estimatePolygonArea(b);
    return area > 5000; // > ~5000 m²
  });
  if (largeBuildings.length > 0) score -= 5;

  return Math.min(30, Math.max(0, score));
}

/**
 * Calculate access point density score (0-25 pts).
 * More gates/access = higher score
 * @param {Array} gates
 * @param {Array} barriers
 * @returns {number}
 */
function scoreAccessPointDensity(gates, barriers) {
  let score = 5; // baseline

  // More gates = more potential entry points
  if (gates.length > 0) score += 5;
  if (gates.length > 2) score += 8;
  if (gates.length > 5) score += 7;

  // Fewer barriers = easier access
  if (barriers.length === 0) score += 5;

  return Math.min(25, Math.max(0, score));
}

/**
 * Calculate surveillance infrastructure score (0-20 pts).
 * More surveillance = lower susceptibility
 * @param {Array} surveillance
 * @returns {number}
 */
function scoreSurveillanceInfra(surveillance) {
  let score = 10; // baseline

  // Presence of CCTV cameras reduces susceptibility
  if (surveillance.length > 0) score -= 3;
  if (surveillance.length > 2) score -= 4;
  if (surveillance.length > 5) score -= 3;

  return Math.min(20, Math.max(0, score));
}

/**
 * Calculate isolation index score (0-15 pts).
 * More isolated = higher score (easier to access without detection)
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<number>}
 */
async function scoreIsolationIndex(lat, lon) {
  // Query for nearby populated places (amenities, shops, etc.)
  const query = `
[bbox:${lat - 0.05},${lon - 0.05},${lat + 0.05},${lon + 0.05}];
(
  node["place"="village"];
  node["place"="town"];
  node["place"="city"];
  node["amenity"];
  way["highway"="residential"];
  way["highway"="primary"];
);
out center;
`;

  const url = 'https://overpass-api.de/api/interpreter';
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: query,
      headers: { 'Content-Type': 'application/osm3s' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return 8;
    const data = await res.json();
    const nearby = (data.elements || []).length;

    // More nearby amenities = less isolated = lower score
    if (nearby > 20) return 3;
    if (nearby > 10) return 6;
    if (nearby > 5) return 9;
    return 12; // isolated
  } catch {
    return 8; // default if query fails
  }
}

/**
 * Calculate building complexity score (0-10 pts).
 * Larger buildings = higher score
 * @param {Array} buildings
 * @returns {number}
 */
function scoreBuildingComplexity(buildings) {
  if (buildings.length === 0) return 2;

  let score = 3;
  const totalArea = buildings.reduce((sum, b) => sum + estimatePolygonArea(b), 0);

  if (totalArea > 10000) score += 4;
  else if (totalArea > 5000) score += 3;
  else if (totalArea > 1000) score += 2;

  if (buildings.length > 2) score += 2;

  return Math.min(10, Math.max(0, score));
}

// ── Main scoring function ─────────────────────────────────────────────────────

/**
 * Calculate Urban Exploring Susceptibility Score (0-100).
 * Higher = more susceptible to unauthorized access.
 * @param {object} companyData - Normalized company record
 * @returns {Promise<{score: number, label: string, breakdown: object, indicators: Array}>}
 */
export async function calcUrbanExploringScore(companyData) {
  const address = [
    companyData.logradouro,
    companyData.numero,
    companyData.municipio,
    companyData.uf
  ].filter(Boolean).join(', ');

  // Geocode
  const coords = await geocodeAddress(address);
  if (!coords) {
    return {
      score: 50,
      label: 'Indisponível',
      breakdown: {},
      indicators: ['Endereço não pode ser geocodificado'],
      reason: 'geocoding_failed'
    };
  }

  // Query Overpass
  const osmData = await queryOverpassData(coords.lat, coords.lon, 0.5);

  // Calculate sub-scores
  const perimeter = scorePerimeterVisibility(osmData.barriers, osmData.buildings);
  const access = scoreAccessPointDensity(osmData.gates, osmData.barriers);
  const surveillance = scoreSurveillanceInfra(osmData.surveillance);
  const isolation = await scoreIsolationIndex(coords.lat, coords.lon);
  const complexity = scoreBuildingComplexity(osmData.buildings);

  const total = Math.min(100, perimeter + access + surveillance + isolation + complexity);

  const breakdown = {
    'Visibilidade do perímetro': `${perimeter}/30`,
    'Densidade de acessos': `${access}/25`,
    'Infraestrutura de vigilância': `${surveillance}/20`,
    'Índice de isolamento': `${isolation}/15`,
    'Complexidade da estrutura': `${complexity}/10`,
  };

  const indicators = buildIndicators(osmData, coords);

  let label;
  if (total >= 75) label = 'Crítico';
  else if (total >= 55) label = 'Alto';
  else if (total >= 35) label = 'Moderado';
  else label = 'Baixo';

  return { score: total, label, breakdown, indicators };
}

// ── Indicator builder ─────────────────────────────────────────────────────────

function buildIndicators(osmData, coords) {
  const indicators = [];

  if (osmData.barriers.length === 0) {
    indicators.push('Sem barreiras físicas detectadas no OSM');
  } else {
    indicators.push(`${osmData.barriers.length} barreira(s) detectada(s) (muros, cercas, sebes)`);
  }

  if (osmData.gates.length > 0) {
    indicators.push(`${osmData.gates.length} portão(ões)/acesso(s) detectado(s)`);
  } else {
    indicators.push('Sem portões/acessos controlados detectados');
  }

  if (osmData.surveillance.length > 0) {
    indicators.push(`${osmData.surveillance.length} câmera(s) de vigilância detectada(s)`);
  } else {
    indicators.push('Sem câmeras de vigilância detectadas no OSM');
  }

  if (osmData.buildings.length > 0) {
    const area = osmData.buildings.reduce((sum, b) => sum + estimatePolygonArea(b), 0);
    indicators.push(`Área construída estimada: ${Math.round(area)} m²`);
  }

  indicators.push(`Coordenadas: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`);

  return indicators;
}

// ── Utility: polygon area estimation ──────────────────────────────────────────

/**
 * Rough estimate of polygon area using shoelace formula.
 * @param {object} elem - Overpass element with geometry
 * @returns {number} Area in m² (approximate)
 */
function estimatePolygonArea(elem) {
  if (!elem.geometry || elem.geometry.length < 3) return 0;

  // Shoelace formula (simplified, doesn't account for Earth curvature)
  let area = 0;
  const coords = elem.geometry;
  for (let i = 0; i < coords.length - 1; i++) {
    const lat1 = coords[i].lat;
    const lon1 = coords[i].lon;
    const lat2 = coords[i + 1].lat;
    const lon2 = coords[i + 1].lon;
    area += (lon1 * lat2 - lon2 * lat1);
  }
  area = Math.abs(area) / 2;

  // Convert to m² (rough: 1 degree ≈ 111 km at equator)
  const metersPerDegree = 111000;
  return area * metersPerDegree * metersPerDegree;
}
