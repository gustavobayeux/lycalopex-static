# Research: APIs for Urban Exploring Susceptibility Scoring

## Satellite Imagery & Building Detection

### NASA GIBS (Global Imagery Browse Services)
- **URL**: https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api
- **Access**: Free, no authentication required
- **Capabilities**:
  - WMTS (Web Map Tile Service) for satellite imagery tiles
  - WMS (Web Map Service) for non-tiled requests
  - 1000+ satellite imagery products
  - Daily updates, near real-time (3-5 hours after observation)
  - Multiple projections (EPSG:4326, EPSG:3857, polar stereographic)
- **Use Case**: Retrieve satellite imagery tiles for a given lat/lon to analyze building footprints, perimeter visibility
- **Integration**: Tile URLs can be embedded directly in Leaflet or similar map libraries

### Overpass API (OpenStreetMap)
- **URL**: https://overpass-api.de/ or https://overpass.kumi.systems/
- **Access**: Free, public, no authentication
- **Query Language**: Overpass QL (declarative query language)
- **Capabilities**:
  - Query building footprints: `way["building"]` or `relation["building"]`
  - Query barriers/fences: `way["barrier"="fence"]` or `way["barrier"="wall"]`
  - Query gates/access points: `node["barrier"="gate"]`
  - Query surveillance: `node["man_made"="surveillance"]`
  - Geometric operations: area calculations, perimeter length, point-in-polygon
  - Returns GeoJSON with coordinates
- **Rate Limits**: ~1 request per second per IP (public instance)
- **Use Case**: Detect building perimeter, fence presence, gate locations, surveillance infrastructure

### Example Overpass Queries

```
// Buildings within 1km radius of a point (lat, lon)
[bbox:lat-0.009,lon-0.009,lat+0.009,lon+0.009];
(
  way["building"];
  relation["building"];
);
out geom;

// Fences and walls around a building
[bbox:lat-0.009,lon-0.009,lat+0.009,lon+0.009];
(
  way["barrier"="fence"];
  way["barrier"="wall"];
  way["barrier"="hedge"];
);
out geom;

// Gates and access points
[bbox:lat-0.009,lon-0.009,lat+0.009,lon+0.009];
(
  node["barrier"="gate"];
  node["barrier"="lift_gate"];
  node["barrier"="bollard"];
);
out geom;

// Surveillance cameras
[bbox:lat-0.009,lon-0.009,lat+0.009,lon+0.009];
node["man_made"="surveillance"];
out geom;
```

## Urban Exploring Susceptibility Scoring Criteria

Based on satellite imagery and OSM data, the score should estimate:

### 1. **Perimeter Visibility** (0-30 pts)
- Presence of fences/walls (OSM barrier tags) → reduces visibility → lowers score
- Building isolation (distance to nearest road) → increases visibility → raises score
- Vegetation density (satellite imagery analysis) → obscures view → lowers score

### 2. **Access Point Density** (0-25 pts)
- Number of gates/barriers (OSM barrier=gate) → more gates = more access points = higher score
- Proximity to public roads (OSM highway tags) → closer = easier access = higher score
- Perimeter length vs. building footprint area → longer perimeter = more potential entry points = higher score

### 3. **Surveillance Infrastructure** (0-20 pts)
- Presence of CCTV cameras (OSM man_made=surveillance) → reduces susceptibility → lowers score
- Lighting infrastructure (OSM highway=street_lamp) → reduces susceptibility → lowers score
- Security barriers (OSM barrier=bollard, barrier=block) → reduces susceptibility → lowers score

### 4. **Isolation Index** (0-15 pts)
- Distance to nearest populated area (OSM place tags) → farther = more isolated = higher score
- Road network density (OSM highway density) → sparse = more isolated = higher score
- Satellite imagery: vegetation coverage, water bodies → natural barriers = lower score

### 5. **Building Complexity** (0-10 pts)
- Building footprint area → larger = more complex = higher score
- Number of building entrances (OSM entrance tags) → more entrances = more access = higher score
- Building height (OSM height tag) → taller = more visible = lower score

## Implementation Strategy

1. **Geocode address** → lat/lon (Nominatim or Google Geocoding)
2. **Query Overpass API** for building, fence, gate, surveillance data within 500m radius
3. **Fetch satellite tile** from NASA GIBS for visual analysis (optional, for UI preview)
4. **Calculate scores** based on OSM data:
   - Perimeter visibility: presence of barriers, vegetation
   - Access points: gate count, road proximity
   - Surveillance: camera count, lighting
   - Isolation: distance to populated areas, road density
   - Building complexity: footprint area, entrance count
5. **Aggregate** into final "Urban Exploring Susceptibility Score" (0-100)
   - Higher score = more susceptible to unauthorized access
   - Lower score = well-protected, monitored, isolated

## API Calls Required

For each company location:

```javascript
// 1. Geocode address
GET https://nominatim.openstreetmap.org/search?q={address}&format=json

// 2. Query buildings and barriers
POST https://overpass-api.de/api/interpreter
[bbox:lat-0.009,lon-0.009,lat+0.009,lon+0.009];
(way["building"]; way["barrier"]; node["barrier"="gate"]; node["man_made"="surveillance"];);
out geom;

// 3. Optional: Fetch satellite tile
GET https://map1.vis.earthdata.nasa.gov/wmts-webmerc/MODIS_Terra_CorrectedReflectance_TrueColor/default//{date}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg
```

## Notes

- **No authentication required** for all APIs
- **Rate limits**: Overpass ~1 req/sec, Nominatim ~1 req/sec
- **Graceful degradation**: If OSM data is sparse, use satellite imagery analysis or default scores
- **Privacy**: All data is public; no personal data is exposed
- **Accuracy**: OSM data quality varies by region; rural areas may have incomplete data
