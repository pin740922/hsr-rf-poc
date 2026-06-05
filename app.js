/** RSRP 5 級配色（與圖例一致，不分主題） */
const RSRP_COLORS = {
  excellent: "#2a52e8",
  good: "#1fa01f",
  normal: "#d4d43b",
  weak: "#f6b26b",
  poor: "#e60000",
};
const ALERT_COLOR = "#e60000";

/** RSRP → 5 級等級 */
function rsrpLevel(rsrp) {
  if (rsrp == null || !Number.isFinite(rsrp)) return "normal";
  if (rsrp >= -85) return "excellent";
  if (rsrp >= -95) return "good";
  if (rsrp >= -105) return "normal";
  if (rsrp >= -115) return "weak";
  return "poor";
}

const TILE_LAYERS = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
  },
};

let manifest = null;
let dtData = null;
let mdtData = null;
let map = null;
let routeLayer = null;
let mdtLayer = null;
let weakLayer = null;
let stationLayer = null;
let activeMode = "dt";
let activeRouteId = null;
let activeMdtId = null;
let routeScopeFilter = "segment";
let routeDirectionFilter = "南下";
let currentRouteView = null;
let selectedWeakIndex = null;
let weakZoneMarkers = [];
let canvasRenderer = null;
let baseTileLayer = null;
let hsrBounds = null;
let currentMdtView = null;
let weakThreshold = -105;
let dtColorMetric = "4G";
let mdtCompareView = null;
let mdtComparePairs = null;
let cmpMeta = { primaryOp: "", compareOp: "" };
let cmpShow = { win: true, lose: true };
let lang = "zh";

// ---- i18n ----
const STATION_EN = {
  南港: "Nangang",
  台北: "Taipei",
  板橋: "Banqiao",
  桃園: "Taoyuan",
  新竹: "Hsinchu",
  苗栗: "Miaoli",
  台中: "Taichung",
  彰化: "Changhua",
  雲林: "Yunlin",
  嘉義: "Chiayi",
  台南: "Tainan",
  左營: "Zuoying",
};

const I18N = {
  全部: "All",
  南下: "Southbound",
  北上: "Northbound",
  全線: "Full line",
  分段: "Segment",
  站間: "Segment",
  優良: "Excellent",
  良好: "Good",
  普通: "Fair",
  較弱: "Weak",
  微弱: "Poor",
  "4G 平均 RSRP": "4G Avg RSRP",
  "4G 最差 RSRP": "4G Worst RSRP",
  樣本數: "Samples",
  弱訊比例: "Weak %",
  "5G 平均 RSRP": "5G Avg RSRP",
  "5G 最佳 RSRP": "5G Best RSRP",
  "5G 平均 SINR": "5G Avg SINR",
  "5G 樣本": "5G Samples",
  "MR 樣本": "MR Samples",
  可用率: "Availability",
  "5G 下行吞吐": "5G DL Throughput",
  "5G 最大 RSRP": "5G Max RSRP",
  "5G RSRP": "5G RSRP",
  "5G SINR": "5G SINR",
  資料日期: "Data Date",
  "5G KPI（路測 NR 量測）": "5G KPI (Drive Test NR)",
  "5G KPI（此路測檔無 NR 量測）": "5G KPI (No NR in this drive test)",
  "5G KPI（MDT L26 層）": "5G KPI (MDT L26)",
  站間切分結果: "Segment Result",
  路測查詢結果: "Drive Test Result",
  弱訊區: "Weak Zone",
  平均: "Avg",
  平均RSRP: "Avg RSRP",
  最低: "Min",
  筆樣本: "samples",
  此區間無路測樣本: "No drive test samples in this segment",
  此段無明顯弱訊區: "No significant weak zone in this segment",
  請選擇行車方向以顯示各站間分段: "Select a direction to list station segments",
  請選擇不同的高鐵站_AB: "Please choose two different HSR stations (A and B)",
  找不到MDT資料集: "No matching MDT dataset (this segment may have no MDT coverage)",
  請先選擇路測路線: "Please select a drive test route first",
  請先載入MDT: "Please load MDT first",
  資料說明: "Data Notes",
  建議: "Note",
  MDT結果: "MDT Result",
  本網: "Home",
  競業: "Competitor",
  距起點: "From start",
  來源: "Source",
  "路測 DT": "Drive Test DT",
  載入失敗: "Load failed",
  請先執行build提示: "Please run build_data.py and open via a local server.",
};

function tt(zh) {
  return lang === "en" ? I18N[zh] ?? zh : zh;
}

function C(zh, en) {
  return lang === "en" ? en : zh;
}

function stn(name) {
  return lang === "en" ? STATION_EN[name] ?? name : name;
}

function dir(d) {
  return lang === "en" ? I18N[d] ?? d : d;
}

/** 翻譯路線/區段名稱（含站名、方向、全線、→） */
function trRouteName(name) {
  if (lang !== "en" || !name) return name;
  let out = name;
  Object.keys(STATION_EN).forEach((zh) => {
    out = out.split(zh).join(STATION_EN[zh]);
  });
  out = out
    .replace(/（全線）/g, " (Full line)")
    .replace(/（分段）/g, " (Segment)")
    .replace(/（南下）/g, " (Southbound)")
    .replace(/（北上）/g, " (Northbound)")
    .replace(/南下/g, "Southbound")
    .replace(/北上/g, "Northbound");
  return out;
}

function applyLang() {
  document.documentElement.lang = lang === "en" ? "en" : "zh-TW";
  document.querySelectorAll("[data-en]").forEach((el) => {
    if (el.dataset.zh == null) el.dataset.zh = el.textContent;
    el.textContent = lang === "en" ? el.dataset.en : el.dataset.zh;
  });
  const lt = document.getElementById("langToggle");
  if (lt) lt.textContent = lang === "en" ? "EN / 中文" : "中文 / EN";
}

function getColors() {
  return RSRP_COLORS;
}

/** RSRP 平均值 → 品質標籤（5 級） */
function qualityLabel(v) {
  if (v == null) return "—";
  if (v >= -85) return tt("優良");
  if (v >= -95) return tt("良好");
  if (v >= -105) return tt("普通");
  if (v >= -115) return tt("較弱");
  return tt("微弱");
}

/** 重新依 RSRP 計算各點 level（5 級），使顯示不依賴後端產生的舊 level */
function normalizePointLevels(points) {
  (points || []).forEach((p) => {
    if (p && p.rsrp != null) p.level = rsrpLevel(p.rsrp);
  });
}

const MAX_GAP_M = 1200;
const HOME_4G_LAYERS = ["L7", "L9", "L18", "L21", "L26"];
const MDT_REGION_CHAIN_IDX = { N1: [0, 2], N2: [2, 4], C: [5, 8], S: [9, 11] };

/** 高鐵站由北（南港）至南（左營） */
const HSR_STATION_CHAIN = [
  "南港",
  "台北",
  "板橋",
  "桃園",
  "新竹",
  "苗栗",
  "台中",
  "彰化",
  "雲林",
  "嘉義",
  "台南",
  "左營",
];

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isValidPoint(p) {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= 21.5 &&
    p.lat <= 25.5 &&
    p.lon >= 119.5 &&
    p.lon <= 122.5
  );
}

async function init() {
  const [m, dt, mdt] = await Promise.all([
    fetch("data/manifest.json").then((r) => r.json()),
    fetch("data/dt_routes.json").then((r) => r.json()),
    fetch("data/mdt_data.json").then((r) => r.json()),
  ]);
  manifest = m;
  dtData = dt;
  mdtData = mdt;

  (dtData.routes || []).forEach((r) => normalizePointLevels(r.points));
  (mdtData.datasets || []).forEach((d) => normalizePointLevels(d.points));

  lang = sessionStorage.getItem("hsrLang") === "en" ? "en" : "zh";
  applyLang();

  currentTheme = lang === "en" ? "dark" : "light";
  document.body.dataset.theme = currentTheme;

  initMap();
  updateThemeToggleLabel();
  populateMdtStationSelects();
  populateMdtControls();
  renderRouteList();
  bindEvents();

  const savedMode = sessionStorage.getItem("hsrActiveMode") || "dt";
  const mode = savedMode === "compare" || savedMode === "dtbm" ? "dt" : savedMode;
  applyModeAfterLoad(mode);
  setTimeout(() => {
    map?.invalidateSize();
    if (map && hsrBounds) {
      map.setMinZoom(map.getBoundsZoom(hsrBounds));
      map.setMaxBounds(hsrBounds);
    }
  }, 120);
}

function applyModeAfterLoad(mode) {
  setMode(mode);
  resetMapLayers();
  document.getElementById("resultCard").hidden = true;
  document.getElementById("pointPopup").hidden = true;

  if (mode === "dt") {
    showRoute(dtData.routes.find((r) => r.scope === "full")?.id || dtData.routes[0].id);
  }
}

function resetMapLayers() {
  routeLayer?.clearLayers();
  mdtLayer?.clearLayers();
  weakLayer?.clearLayers();
  currentRouteView = null;
  activeRouteId = null;
  activeMdtId = null;
  selectedWeakIndex = null;
  currentMdtView = null;
}

function computeHsrBounds() {
  const pts = [];
  (dtData?.routes || []).forEach((r) => (r.points || []).forEach((p) => {
    if (isValidPoint(p)) pts.push([p.lat, p.lon]);
  }));
  if (!pts.length) return L.latLngBounds([22.5, 120.2], [25.1, 121.7]);
  return L.latLngBounds(pts);
}

function initMap() {
  currentTheme = document.body.dataset.theme || "light";
  map = L.map("map", {
    zoomControl: true,
    preferCanvas: true,
  }).setView([23.8, 120.5], 8);
  canvasRenderer = L.canvas({ padding: 0.5 });
  setBaseTiles(currentTheme);

  hsrBounds = computeHsrBounds().pad(0.12);
  map.setMaxBounds(hsrBounds);
  map.fitBounds(hsrBounds);
  const minZ = map.getBoundsZoom(hsrBounds);
  map.setMinZoom(minZ);

  routeLayer = L.layerGroup().addTo(map);
  mdtLayer = L.layerGroup().addTo(map);
  weakLayer = L.layerGroup().addTo(map);
  stationLayer = L.layerGroup().addTo(map);
  drawStations();
  updateThemeToggleLabel();
}

function setBaseTiles(theme) {
  const cfg = TILE_LAYERS[theme] || TILE_LAYERS.light;
  if (baseTileLayer) map.removeLayer(baseTileLayer);
  baseTileLayer = L.tileLayer(cfg.url, {
    attribution: cfg.attribution,
    maxZoom: 19,
    subdomains: "abcd",
  }).addTo(map);
}

function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  document.body.dataset.theme = currentTheme;
  setBaseTiles(currentTheme);
  updateThemeToggleLabel();
  if (currentRouteView) showRouteView(currentRouteView);
  else if (activeMdtId && activeMode === "mdt") {
    const ds = currentMdtView || findMdtDataset();
    if (ds) showMdtView(ds, { fit: false });
  }
  setTimeout(() => map.invalidateSize(), 100);
}

function updateThemeToggleLabel() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  if (currentTheme === "dark") btn.textContent = lang === "en" ? "☀ Light" : "☀ 亮色";
  else btn.textContent = lang === "en" ? "🌙 Dark" : "🌙 暗色";
}

function drawStations() {
  stationLayer.clearLayers();
  manifest.stations.forEach((s) => {
    const icon = L.divIcon({
      className: "",
      html: `<div class="station-marker">${s.name}</div>`,
      iconSize: [60, 24],
      iconAnchor: [30, 12],
    });
    L.marker([s.lat, s.lon], { icon }).addTo(stationLayer);
  });
}

function populateMdtStationSelects() {
  const selA = document.getElementById("mdtStationA");
  const selB = document.getElementById("mdtStationB");
  if (!selA || !selB) return;
  selA.innerHTML = "";
  selB.innerHTML = "";
  HSR_STATION_CHAIN.forEach((name) => {
    selA.add(new Option(stn(name), name));
    selB.add(new Option(stn(name), name));
  });
  selA.value = "板橋";
  selB.value = "桃園";
  syncMdtStationSelects();
}

function syncMdtStationSelects(changed) {
  const selA = document.getElementById("mdtStationA");
  const selB = document.getElementById("mdtStationB");
  if (!selA || !selB) return;

  [...selA.options].forEach((opt) => {
    opt.disabled = opt.value === selB.value;
  });
  [...selB.options].forEach((opt) => {
    opt.disabled = opt.value === selA.value;
  });

  if (selA.value === selB.value) {
    const idx = HSR_STATION_CHAIN.indexOf(selA.value);
    if (changed === "A" && idx < HSR_STATION_CHAIN.length - 1) {
      selB.value = HSR_STATION_CHAIN[idx + 1];
    } else if (changed === "B" && idx > 0) {
      selA.value = HSR_STATION_CHAIN[idx - 1];
    } else if (idx < HSR_STATION_CHAIN.length - 1) {
      selB.value = HSR_STATION_CHAIN[idx + 1];
    } else if (idx > 0) {
      selA.value = HSR_STATION_CHAIN[idx - 1];
    }
    syncMdtStationSelects();
  }
}

function getMdtSegmentStations() {
  const a = document.getElementById("mdtStationA")?.value;
  const b = document.getElementById("mdtStationB")?.value;
  if (!a || !b || a === b) return null;
  const iA = HSR_STATION_CHAIN.indexOf(a);
  const iB = HSR_STATION_CHAIN.indexOf(b);
  const start = iA <= iB ? a : b;
  const end = iA <= iB ? b : a;
  return { start, end, label: `${start}→${end}` };
}

function populateMdtControls() {
  const date = document.getElementById("mdtDate");
  date.innerHTML = "";
  manifest.mdt_dates.forEach((d) => {
    date.add(new Option(`${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6, 8)}`, d));
  });
  date.value = manifest.mdt_dates[manifest.mdt_dates.length - 1];
  updateMdtLayerOptions();
}

function updateMdtLayerOptions() {
  const op = document.getElementById("mdtOperator").value;
  const layerSel = document.getElementById("mdtLayer");
  layerSel.innerHTML = "";
  if (op === "本網業者") {
    layerSel.add(new Option("Max RSRP", "maxRSRP"));
    const layers = manifest.mdt_layers || { L21: { label: "4G L21" }, L26: { label: "4G L26" } };
    Object.entries(layers).forEach(([id, info]) => {
      layerSel.add(new Option(info.label || id, id));
    });
    layerSel.value = "maxRSRP";
  } else {
    layerSel.add(new Option("4G Avg RSRP", "ifMDT_avg"));
    layerSel.add(new Option("4G Max RSRP", "ifMDT_max"));
    layerSel.value = "ifMDT_avg";
  }
}

function bindEvents() {
  document.getElementById("mdtLoadBtn").addEventListener("click", loadMdt);
  document.getElementById("mdtOperator").addEventListener("change", updateMdtLayerOptions);
  document.getElementById("mdtStationA").addEventListener("change", () => syncMdtStationSelects("A"));
  document.getElementById("mdtStationB").addEventListener("change", () => syncMdtStationSelects("B"));
  document.getElementById("overlayDt").addEventListener("change", () => {
    if (activeMode !== "mdt" || !currentMdtView) return;
    updateDtOverlay();
  });
  document.getElementById("exportBtn").addEventListener("click", exportDtReport);
  document.getElementById("mdtExportBtn").addEventListener("click", exportMdtReport);

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      sessionStorage.setItem("hsrActiveMode", tab.dataset.mode);
      location.reload();
    });
  });

  document.querySelectorAll("[data-scope]").forEach((tab) => {
    tab.addEventListener("click", () => {
      routeScopeFilter = tab.dataset.scope;
      document.querySelectorAll("[data-scope]").forEach((t) => t.classList.toggle("active", t === tab));
      renderRouteList();
    });
  });

  document.querySelectorAll("[data-metric]").forEach((tab) => {
    tab.addEventListener("click", () => {
      dtColorMetric = tab.dataset.metric;
      document.querySelectorAll("[data-metric]").forEach((t) => t.classList.toggle("active", t === tab));
      if (currentRouteView) showRouteView(currentRouteView);
    });
  });

  document.getElementById("weakThreshold").addEventListener("input", (e) => {
    weakThreshold = parseInt(e.target.value, 10);
    document.getElementById("threshVal").textContent = weakThreshold;
    if (currentRouteView && activeMode === "dt") refreshDtWeak();
    if (activeMode === "dt" && routeScopeFilter === "segment") renderRouteList();
  });

  document.getElementById("routeDirectionFilter").addEventListener("change", (e) => {
    routeDirectionFilter = e.target.value;
    renderRouteList();
  });
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("langToggle").addEventListener("click", () => {
    sessionStorage.setItem("hsrLang", lang === "en" ? "zh" : "en");
    location.reload();
  });
}

function setMode(mode) {
  activeMode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
  document.querySelectorAll(".mode-panel").forEach((p) => {
    p.hidden = p.dataset.modePanel !== mode;
  });
  setTimeout(() => map?.invalidateSize(), 80);
}

function getRoute(id) {
  return dtData.routes.find((r) => r.id === id);
}

function getMdt(id) {
  return mdtData.datasets.find((d) => d.id === id);
}

function lookupInterval(start, end, direction) {
  return manifest.interval_lookup?.[`${start}|${end}|${direction}`] || null;
}

function lookupRouteExact(start, end, direction) {
  const id = manifest.route_lookup?.[`${start}|${end}|${direction}`];
  return id ? getRoute(id) : null;
}

function computeStatsFromPoints(points) {
  if (!points.length) return { mean: 0, minimum: 0, maximum: 0, count: 0, weak_pct: 0 };
  const rsrps = points.map((p) => p.rsrp);
  const weak = rsrps.filter((v) => v <= -105).length;
  return {
    mean: Math.round((rsrps.reduce((a, b) => a + b, 0) / rsrps.length) * 10) / 10,
    minimum: Math.min(...rsrps),
    maximum: Math.max(...rsrps),
    count: rsrps.length,
    weak_pct: Math.round((weak / rsrps.length) * 1000) / 10,
  };
}

function computeWeakZones(points, binKm = 2, threshold = weakThreshold) {
  const withDist = points.filter((p) => p.dist_m != null);
  if (!withDist.length) return [];
  const bins = {};
  withDist.forEach((p) => {
    const km = Math.floor(p.dist_m / 1000 / binKm) * binKm;
    if (!bins[km]) bins[km] = { rsrps: [], lats: [], lons: [] };
    bins[km].rsrps.push(p.rsrp);
    bins[km].lats.push(p.lat);
    bins[km].lons.push(p.lon);
  });
  return Object.entries(bins)
    .map(([km, b]) => ({
      km_start: parseFloat(km),
      km_end: parseFloat(km) + binKm,
      avg_rsrp: Math.round((b.rsrps.reduce((a, c) => a + c, 0) / b.rsrps.length) * 10) / 10,
      min_rsrp: Math.min(...b.rsrps),
      samples: b.rsrps.length,
      lat: b.lats.reduce((a, c) => a + c, 0) / b.lats.length,
      lon: b.lons.reduce((a, c) => a + c, 0) / b.lons.length,
    }))
    .filter((z) => z.avg_rsrp <= threshold)
    .sort((a, b) => a.avg_rsrp - b.avg_rsrp)
    .slice(0, 8);
}

function weakPctFromPoints(points, threshold = weakThreshold) {
  const rsrps = (points || []).map((p) => p.rsrp).filter((v) => v != null);
  if (!rsrps.length) return 0;
  return Math.round((rsrps.filter((v) => v <= threshold).length / rsrps.length) * 1000) / 10;
}

/** 依目前弱訊門檻重算路線的弱訊區段與弱訊比例 */
function applyWeakThreshold(route) {
  if (!route) return;
  const binKm = route.scope === "full" ? 3 : 2;
  route.weak_zones = computeWeakZones(route.points || [], binKm, weakThreshold);
  route.weak_pct = weakPctFromPoints(route.points, weakThreshold);
}

/** 弱訊門檻變動後即時刷新 DT 顯示 */
function refreshDtWeak() {
  const route = currentRouteView;
  if (!route) return;
  applyWeakThreshold(route);
  weakLayer.clearLayers();
  drawWeakZones(route);
  renderWeakList(route);
  renderKpiGrid(route, "dt", document.getElementById("dtKpiGrid"));
}

/** DT 上色用 RSRP：依 4G/5G 切換 */
function metricRsrp(p) {
  return dtColorMetric === "5G" ? p.nr_rsrp : p.rsrp;
}

function getStationByName(name) {
  return manifest.stations.find((s) => s.name === name);
}

function chainageScore(p, entry, exit) {
  const latMid = ((entry.lat + exit.lat) / 2 * Math.PI) / 180;
  const ax = (exit.lon - entry.lon) * Math.cos(latMid);
  const ay = exit.lat - entry.lat;
  const px = (p.lon - entry.lon) * Math.cos(latMid);
  const py = p.lat - entry.lat;
  const len = Math.sqrt(ax * ax + ay * ay);
  return len > 0 ? (px * ax + py * ay) / len : 0;
}

function projectPointOnAxis(p, axisStart, axisEnd) {
  const latMid = ((axisStart.lat + axisEnd.lat) / 2 * Math.PI) / 180;
  const mx = (p.lon - axisStart.lon) * Math.cos(latMid);
  const my = p.lat - axisStart.lat;
  const bx = (axisEnd.lon - axisStart.lon) * Math.cos(latMid);
  const by = axisEnd.lat - axisStart.lat;
  const len2 = bx * bx + by * by;
  let t = len2 > 0 ? (mx * bx + my * by) / len2 : 0;
  const plat = axisStart.lat + t * (axisEnd.lat - axisStart.lat);
  const plon = axisStart.lon + t * (axisEnd.lon - axisStart.lon);
  return {
    t,
    lateral_m: haversineM(p, { lat: plat, lon: plon }),
  };
}

function getHsrAxis() {
  const north = getStationByName(HSR_STATION_CHAIN[0]);
  const south = getStationByName(HSR_STATION_CHAIN[HSR_STATION_CHAIN.length - 1]);
  return { north, south };
}

function assignLocalDistM(points) {
  let dist = 0;
  return points.map((p, i) => {
    if (i > 0) dist += haversineM(points[i - 1], p);
    return { ...p, dist_m: Math.round(dist) };
  });
}

/** 依起迄站地理走廊切分路測點（不依 CSV 累積 dist_m，避免站間軌跡斷裂） */
function slicePointsBetweenStations(points, startName, endName) {
  const startSt = getStationByName(startName);
  const endSt = getStationByName(endName);
  const { north, south } = getHsrAxis();
  if (!startSt || !endSt || !north || !south || !points?.length) return [];

  const scoreStart = chainageScore(startSt, north, south);
  const scoreEnd = chainageScore(endSt, north, south);
  const minScore = Math.min(scoreStart, scoreEnd);
  const maxScore = Math.max(scoreStart, scoreEnd);
  const margin = Math.max((maxScore - minScore) * 0.05, 0.002);
  const maxLateral = 6000;

  const sliced = points
    .filter((p) => {
      if (!isValidPoint(p)) return false;
      const seg = projectPointOnAxis(p, startSt, endSt);
      if (seg.lateral_m > maxLateral || seg.t < -0.08 || seg.t > 1.08) return false;
      const score = chainageScore(p, north, south);
      return score >= minScore - margin && score <= maxScore + margin;
    })
    .sort((a, b) => chainageScore(a, north, south) - chainageScore(b, north, south));

  return assignLocalDistM(sliced);
}

function buildSlicedRoute(parent, interval, start, end) {
  const points = slicePointsBetweenStations(parent.points, start, end);
  const stats = computeStatsFromPoints(points);
  return {
    ...parent,
    id: `slice-${interval.start_station}-${interval.end_station}-${interval.direction}`,
    name: `${interval.label}（${interval.direction}）`,
    start_station: start,
    end_station: end,
    direction: interval.direction,
    scope: "interval",
    parent_id: parent.id,
    parent_name: parent.name,
    stats,
    weak_pct: stats.weak_pct,
    points,
    weak_zones: computeWeakZones(points),
  };
}

function resolveRouteQuery(start, end, direction) {
  const exact = lookupRouteExact(start, end, direction);
  if (exact) return { route: exact, interval: null };

  const interval = lookupInterval(start, end, direction);
  if (!interval) return null;

  const parent = getRoute(interval.parent_id);
  if (!parent) return null;

  return { route: buildSlicedRoute(parent, interval, start, end), interval };
}

function lookupRoute(start, end, direction) {
  return resolveRouteQuery(start, end, direction)?.route || null;
}

function parseMdtSegmentValue() {
  return getMdtSegmentStations() || { start: "", end: "" };
}

/** 依 MDT 站間區段切分對應路測 DT（不依 activeRouteId） */
function resolveDtRouteForMdtSegment() {
  const seg = getMdtSegmentStations();
  if (!seg) return null;
  const { start, end } = seg;
  const resolved =
    resolveRouteQuery(start, end, "南下") ||
    resolveRouteQuery(start, end, "北上") ||
    resolveRouteQuery(end, start, "南下") ||
    resolveRouteQuery(end, start, "北上");
  return resolved?.route || null;
}

function updateDtOverlay() {
  routeLayer.clearLayers();
  if (!document.getElementById("overlayDt").checked) return;
  const route = resolveDtRouteForMdtSegment();
  if (!route?.points?.length) return;
  drawPoints(routeLayer, route.points, route, false, { fit: false });
}

function getMdtRegionsForSegment(start, end) {
  const i0 = HSR_STATION_CHAIN.indexOf(start);
  const i1 = HSR_STATION_CHAIN.indexOf(end);
  if (i0 < 0 || i1 < 0) return [];
  const lo = Math.min(i0, i1);
  const hi = Math.max(i0, i1);
  const regionIdx = manifest?.mdt_region_chain_idx || MDT_REGION_CHAIN_IDX;
  return Object.entries(regionIdx)
    .filter(([, span]) => lo <= span[1] && hi >= span[0])
    .map(([id]) => id);
}

function formatMdtDateLabel(date) {
  return `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;
}

function pointLevelFromRsrp(rsrp) {
  return rsrpLevel(rsrp);
}

function buildTwmMaxRsrpDataset(regions, start, end, date) {
  const byLoc = new Map();
  regions.forEach((region) => {
    HOME_4G_LAYERS.forEach((layer) => {
      const ds = mdtData.datasets.find(
        (d) => d.operator === "本網業者" && d.segment_id === region && d.date === date && d.layer === layer
      );
      ds?.points?.forEach((p) => {
        // 本網 Max RSRP：取各頻段來源 K 欄 MAXRSRP，再跨 5 頻段取最大
        const v = p.max_rsrp != null ? p.max_rsrp : p.rsrp;
        const key = `${p.lat.toFixed(5)}|${p.lon.toFixed(5)}`;
        const cur = byLoc.get(key);
        if (!cur || v > cur.rsrp) {
          byLoc.set(key, { lat: p.lat, lon: p.lon, rsrp: v, level: pointLevelFromRsrp(v) });
        }
      });
    });
  });
  const points = slicePointsBetweenStations([...byLoc.values()], start, end);
  if (!points.length) return null;
  const stats = computeStatsFromPoints(points);
  return {
    id: `mdt-view-home-maxRSRP-${start}-${end}-${date}`,
    segment_name: `${start}→${end}`,
    operator: "本網業者",
    layer: "maxRSRP",
    tech: "4G",
    date,
    date_label: formatMdtDateLabel(date),
    stats,
    weak_pct: stats.weak_pct,
    kpi: { rsrp_4g: stats },
    points,
  };
}

function buildMdtViewDataset(start, end, op, layer, date) {
  const regions = getMdtRegionsForSegment(start, end);
  if (!regions.length) return null;

  if (op === "本網業者" && layer === "maxRSRP") {
    return buildTwmMaxRsrpDataset(regions, start, end, date);
  }

  // 競業（競業A/競業B）：以 ifMDT 資料集，依屬性 avg/max 取值
  if (op !== "本網業者") {
    const attr = layer === "ifMDT_max" ? "max" : "avg";
    let allPoints = [];
    regions.forEach((region) => {
      const ds = mdtData.datasets.find(
        (d) => d.operator === op && d.segment_id === region && d.date === date && d.layer === "ifMDT"
      );
      if (ds?.points) allPoints.push(...ds.points);
    });
    if (!allPoints.length) return null;
    let points = slicePointsBetweenStations(allPoints, start, end);
    if (!points.length) return null;
    points = points.map((p) => {
      const val = attr === "max" ? p.max_rsrp ?? p.rsrp : p.rsrp;
      return { ...p, rsrp: val, level: rsrpLevel(val) };
    });
    const stats = computeStatsFromPoints(points);
    return {
      id: `mdt-view-${op}-${layer}-${start}-${end}-${date}`,
      segment_name: `${start}→${end}`,
      operator: op,
      layer,
      attr_label: attr === "max" ? "4G Max RSRP" : "4G Avg RSRP",
      tech: "4G",
      date,
      date_label: formatMdtDateLabel(date),
      stats,
      weak_pct: stats.weak_pct,
      kpi: { rsrp_4g: stats },
      points,
    };
  }

  let allPoints = [];
  regions.forEach((region) => {
    const ds = mdtData.datasets.find(
      (d) =>
        d.operator === op &&
        d.segment_id === region &&
        d.date === date &&
        d.layer === layer
    );
    if (ds?.points) allPoints.push(...ds.points);
  });
  if (!allPoints.length) return null;

  const points = slicePointsBetweenStations(allPoints, start, end);
  if (!points.length) return null;

  const stats = computeStatsFromPoints(points);
  const layerInfo = manifest.mdt_layers?.[layer];
  return {
    id: `mdt-view-${op}-${layer}-${start}-${end}-${date}`,
    segment_name: `${start}→${end}`,
    operator: op,
    layer,
    tech: layerInfo?.tech || "4G",
    date,
    date_label: formatMdtDateLabel(date),
    stats,
    weak_pct: stats.weak_pct,
    kpi: { rsrp_4g: stats },
    points,
  };
}

function findMdtDataset() {
  const op = document.getElementById("mdtOperator").value;
  const layer = document.getElementById("mdtLayer").value;
  const date = document.getElementById("mdtDate").value;
  const seg = getMdtSegmentStations();
  if (!seg) return null;
  const { start, end } = seg;
  return buildMdtViewDataset(start, end, op, layer, date);
}

function loadMdt() {
  if (!getMdtSegmentStations()) {
    alert(tt("請選擇不同的高鐵站_AB"));
    return;
  }
  let ds = findMdtDataset();
  if (!ds) {
    alert(tt("找不到MDT資料集"));
    return;
  }

  const cmpOp = document.getElementById("mdtCompareOp").value;
  if (cmpOp && cmpOp !== ds.operator) {
    // 比較模式：兩業者一律用 Max RSRP 比較
    cmpShow = { win: true, lose: true };
    const primaryMax = buildMaxRsrpDataset(ds.operator);
    if (primaryMax) ds = primaryMax;
    mdtCompareView = buildMaxRsrpDataset(cmpOp);
    cmpMeta = { primaryOp: ds.operator, compareOp: cmpOp };
  } else {
    mdtCompareView = null;
  }

  showMdtView(ds);
  renderMdtResult(ds);
  document.getElementById("resultCard").hidden = false;
  placeMdtResult(true);
}

/** 取得某業者於目前站間/日期的 Max RSRP 視圖 */
function buildMaxRsrpDataset(op) {
  const seg = getMdtSegmentStations();
  if (!seg) return null;
  const date = document.getElementById("mdtDate").value;
  const layer = op === "本網業者" ? "maxRSRP" : "ifMDT_max";
  return buildMdtViewDataset(seg.start, seg.end, op, layer, date);
}

function levelClass(mean) {
  if (mean == null) return "";
  return rsrpLevel(mean);
}

function metricHtml(label, value, unit, cls) {
  return `<div class="metric"><div class="label">${label}</div><div class="value ${cls || ""}">${value}${unit ? " " + unit : ""}</div></div>`;
}

function renderKpiGrid(routeOrDs, type, gridEl) {
  const grid = gridEl || document.getElementById("kpiGrid");
  let html = "";

  if (type === "dt") {
    const mean = routeOrDs.stats?.mean;
    html += metricHtml(tt("4G 平均 RSRP"), mean?.toFixed(1), "dBm", levelClass(mean));
    html += metricHtml(tt("4G 最差 RSRP"), routeOrDs.stats?.minimum?.toFixed(1), "dBm", "poor");
    html += metricHtml(tt("樣本數"), Math.round(routeOrDs.stats?.count || 0).toLocaleString(), "", "");
    html += metricHtml(tt("弱訊比例"), routeOrDs.weak_pct, "%", routeOrDs.weak_pct > 5 ? "poor" : "normal");

    const nr = routeOrDs.kpi?.nr_rsrp;
    const nrSinr = routeOrDs.kpi?.nr_sinr;
    if (nr && nr.mean != null) {
      html += `<div class="kpi-section">${tt("5G KPI（路測 NR 量測）")}</div>`;
      html += metricHtml(tt("5G 平均 RSRP"), nr.mean?.toFixed(1), "dBm", levelClass(nr.mean));
      html += metricHtml(tt("5G 最佳 RSRP"), nr.maximum?.toFixed(1), "dBm", "excellent");
      const s = nrSinr?.mean;
      html += metricHtml(tt("5G 平均 SINR"), s?.toFixed(1) ?? "—", s != null ? "dB" : "", s > 10 ? "excellent" : s > 6 ? "good" : s != null ? "poor" : "");
      html += metricHtml(tt("5G 樣本"), Math.round(nr.count || 0).toLocaleString(), "", "");
    } else {
      html += `<div class="kpi-section">${tt("5G KPI（此路測檔無 NR 量測）")}</div>`;
      html += metricHtml(tt("5G RSRP"), "—", "", "muted");
      html += metricHtml(tt("5G SINR"), "—", "", "");
    }
  } else {
    const kpi = routeOrDs.kpi || {};
    const rsrpKey = routeOrDs.tech === "5G" ? "nr_rsrp" : "rsrp_4g";
    const rsrp = kpi[rsrpKey] || routeOrDs.stats || {};
    html += metricHtml(`${routeOrDs.tech} ${tt("平均")} RSRP`, rsrp.mean?.toFixed(1), "dBm", levelClass(rsrp.mean));
    html += metricHtml(tt("弱訊比例"), routeOrDs.weak_pct, "%", routeOrDs.weak_pct > 5 ? "weak" : "fair");
    html += metricHtml(tt("MR 樣本"), Math.round(rsrp.count || 0).toLocaleString(), "", "");
    html += metricHtml(tt("可用率"), kpi.nr_availability_pct ?? "—", kpi.nr_availability_pct != null ? "%" : "", "");

    if (routeOrDs.tech === "5G") {
      html += `<div class="kpi-section">${tt("5G KPI（MDT L26 層）")}</div>`;
      const sinr = kpi.nr_sinr?.mean;
      const tput = kpi.nr_tput_dl_kbps?.mean;
      html += metricHtml(tt("5G SINR"), sinr?.toFixed(1) ?? "—", sinr != null ? "dB" : "", sinr > 10 ? "good" : sinr > 6 ? "fair" : sinr != null ? "weak" : "");
      html += metricHtml(tt("5G 下行吞吐"), tput != null ? Math.round(tput).toLocaleString() : "—", tput != null ? "kbps" : "", "");
      html += metricHtml(tt("5G 最大 RSRP"), kpi.nr_rsrp?.maximum?.toFixed(1) ?? "—", "dBm", "good");
      html += metricHtml(tt("資料日期"), routeOrDs.date_label, "", "");
    }
  }
  grid.innerHTML = html;
}

function getZonePoints(route, zone) {
  const pts = (route.points || []).filter((p) => p.dist_m != null);
  if (!pts.length || zone.km_start == null) {
    return zone.lat != null ? [{ lat: zone.lat, lon: zone.lon }] : [];
  }

  const from = Math.min(zone.km_start, zone.km_end);
  const to = Math.max(zone.km_start, zone.km_end);

  let inRange = pts.filter((p) => p.dist_m >= from && p.dist_m <= to);
  if (inRange.length >= 2) return inRange;

  inRange = pts.filter((p) => p.dist_m >= from * 1000 && p.dist_m <= to * 1000);
  if (inRange.length >= 2) return inRange;

  if (zone.lat != null && zone.lon != null) {
    inRange = pts.filter((p) => Math.abs(p.lat - zone.lat) + Math.abs(p.lon - zone.lon) < 0.08);
    if (inRange.length) return inRange;
    return [{ lat: zone.lat, lon: zone.lon }];
  }
  return inRange;
}

function focusWeakZone(zone, route, index) {
  selectedWeakIndex = index;
  const targetPoints = getZonePoints(route, zone);
  if (!targetPoints.length) return;

  const bounds = L.latLngBounds(targetPoints.map((p) => [p.lat, p.lon]));
  map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15 });

  document.querySelectorAll(".weak-item").forEach((el, i) => {
    el.classList.toggle("active", i === index);
  });

  weakZoneMarkers.forEach((m, i) => {
    m.setStyle({
      radius: i === index ? 12 : 8,
      fillOpacity: i === index ? 0.85 : 0.5,
      weight: i === index ? 3 : 2,
    });
    if (i === index) m.openPopup();
  });

  const el = document.getElementById("pointPopup");
  el.hidden = false;
  el.innerHTML = `
    <strong>${tt("弱訊區")} · km ${zone.km_start}–${zone.km_end}</strong><br>
    ${tt("平均")} RSRP: <b style="color:${ALERT_COLOR}">${zone.avg_rsrp} dBm</b><br>
    ${tt("最低")}: ${zone.min_rsrp} dBm · ${zone.samples} ${tt("筆樣本")}
  `;
}

function renderWeakList(route) {
  const weakEl = document.getElementById("weakList");
  selectedWeakIndex = null;

  if (!route.points?.length) {
    weakEl.innerHTML = `<p class='hint'>${tt("此區間無路測樣本")}</p>`;
    return;
  }
  if (!route.weak_zones?.length) {
    weakEl.innerHTML = `<p class='hint weak-hint-click'>${tt("此段無明顯弱訊區")}</p>`;
    return;
  }

  weakEl.innerHTML = "";
  route.weak_zones.forEach((z, i) => {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "weak-item";
    div.textContent = `km ${z.km_start}–${z.km_end} · ${tt("平均")} ${z.avg_rsrp} dBm`;
    div.addEventListener("click", () => focusWeakZone(z, currentRouteView || route, i));
    weakEl.appendChild(div);
  });
}

function drawWeakZones(route) {
  weakZoneMarkers = [];
  route.weak_zones?.forEach((z, i) => {
    if (!isValidPoint(z)) return;
    const marker = L.circleMarker([z.lat, z.lon], {
      radius: 8,
      color: ALERT_COLOR,
      fillColor: ALERT_COLOR,
      fillOpacity: 0.55,
      weight: 2,
      renderer: canvasRenderer,
    })
      .bindPopup(`<b>${tt("弱訊區")}</b><br>km ${z.km_start}–${z.km_end}<br>${tt("平均")} ${z.avg_rsrp} dBm`)
      .on("click", () => focusWeakZone(z, route, i));
    marker.addTo(weakLayer);
    weakZoneMarkers.push(marker);
  });
}
function renderDtResult(route, start, end, interval) {
  document.getElementById("dtResultTitle").textContent = interval ? tt("站間切分結果") : tt("路測查詢結果");
  renderKpiGrid(route, "dt", document.getElementById("dtKpiGrid"));
  renderWeakList(route);

  const mean = route.stats.mean;
  const quality = qualityLabel(mean);
  if (lang === "en") {
    const sliceNote = interval ? ` (sliced from “${trRouteName(interval.parent_name)}”)` : "";
    document.getElementById("csScript").innerHTML = `
      <strong>${tt("建議")}:</strong>
      Per HSR drive test (${route.test_date})${sliceNote}, the ${stn(start)}–${stn(end)} segment 4G signal is overall ${quality} (avg RSRP ${mean.toFixed(1)} dBm, ${route.stats.count} samples).
      See the MDT Integration tab for 5G. Reference value from drive test, not real-time.
    `;
    return;
  }
  const sliceNote = interval ? `（由「${interval.parent_name}」路測檔切分）` : "";
  document.getElementById("csScript").innerHTML = `
    <strong>建議：</strong>
    依高鐵路測（${route.test_date}）${sliceNote}，${start}至${end}段 4G 訊號整體${quality}（平均 RSRP ${mean.toFixed(1)} dBm，${route.stats.count} 筆樣本）。
    5G 指標請參考 MDT 整合頁。此為路測參考值，非即時狀態。
  `;
}

function mdtLayerLabel(ds) {
  if (ds.attr_label) return ds.attr_label;
  if (ds.layer === "maxRSRP") return "Max RSRP";
  return manifest.mdt_layers?.[ds.layer]?.label || ds.layer;
}

function renderMdtResult(ds) {
  const layerLabel = mdtLayerLabel(ds);
  const segName = trRouteName(ds.segment_name);
  document.getElementById("resultTitle").textContent = `${tt("MDT結果")} · ${ds.operator} ${layerLabel}`;
  renderKpiGrid(ds, "mdt");
  const info = document.getElementById("mdtInfo");
  info.hidden = false;

  let cmpHtml = "";
  const cmp = mdtCompareView;
  if (cmp && mdtComparePairs) {
    const n = mdtComparePairs.length;
    const win = mdtComparePairs.filter((p) => p.delta >= 0).length;
    const avgDelta = n ? Math.round((mdtComparePairs.reduce((s, p) => s + p.delta, 0) / n) * 10) / 10 : null;
    const winPct = n ? Math.round((win / n) * 1000) / 10 : 0;
    if (lang === "en") {
      const lead = avgDelta == null ? "" : avgDelta > 0 ? `${cmpMeta.primaryOp} leads by ${avgDelta} dBm on average` : avgDelta < 0 ? `${cmpMeta.primaryOp} trails by ${Math.abs(avgDelta)} dBm on average` : "both are on par";
      cmpHtml = `
      <div class="cs-script cmp-script">
        <strong>Cross-operator (Max RSRP, ${n} intersecting cells):</strong>
        <span class="cmp-op">${cmpMeta.primaryOp}</span> vs <span class="cmp-op">${cmpMeta.compareOp}</span>.
        ${lead}${lead ? "; " : ""}${cmpMeta.primaryOp} wins ${win} cells (${winPct}%).
        Use the top-right legend to toggle “win (blue)” or “lose (red)”.
      </div>`;
    } else {
      const lead = avgDelta == null ? "" : avgDelta > 0 ? `${cmpMeta.primaryOp} 平均領先 ${avgDelta} dBm` : avgDelta < 0 ? `${cmpMeta.primaryOp} 平均落後 ${Math.abs(avgDelta)} dBm` : "兩者平均持平";
      cmpHtml = `
      <div class="cs-script cmp-script">
        <strong>異業者比較（Max RSRP，交集 ${n} 處）：</strong>
        <span class="cmp-op">${cmpMeta.primaryOp}</span> vs <span class="cmp-op">${cmpMeta.compareOp}</span>。
        ${lead}${lead ? "；" : ""}${cmpMeta.primaryOp} 贏 ${win} 處（${winPct}%）。
        地圖右上角可單獨勾選顯示「贏（藍）」或「輸（紅）」。
      </div>`;
    }
  }

  if (lang === "en") {
    info.innerHTML = `
      <h3>${tt("資料說明")}</h3>
      <p class="hint">${segName} · ${layerLabel} · ${ds.date_label}<br>MDT aggregates client-side measurements, complementary to drive test.</p>
      <div class="cs-script">
        <strong>${tt("建議")}:</strong>
        Per MDT analysis (${ds.date_label}), ${segName} ${ds.tech} avg RSRP ${ds.stats?.mean?.toFixed(1) ?? "—"} dBm.
        ${ds.tech === "5G" && ds.kpi?.nr_tput_dl_kbps?.mean ? `5G avg DL ~ ${Math.round(ds.kpi.nr_tput_dl_kbps.mean)} kbps.` : ""}
        MDT reflects real user distribution and cross-checks with drive test.
      </div>
      ${cmpHtml}
    `;
    return;
  }

  info.innerHTML = `
    <h3>資料說明</h3>
    <p class="hint">${ds.segment_name} · ${layerLabel} · ${ds.date_label}<br>MDT 為用戶端量測聚合，與路測互補。</p>
    <div class="cs-script">
      <strong>建議：</strong>
      依 MDT 分析（${ds.date_label}），${ds.segment_name}${ds.tech} 平均 RSRP ${ds.stats?.mean?.toFixed(1) ?? "—"} dBm。
      ${ds.tech === "5G" && ds.kpi?.nr_tput_dl_kbps?.mean ? `5G 平均下行約 ${Math.round(ds.kpi.nr_tput_dl_kbps.mean)} kbps。` : ""}
      MDT 反映實際用戶分布，可與路測交叉比對。
    </div>
    ${cmpHtml}
  `;
}

const MDT_CELL_DEG = 0.001; // 約 110m 網格，用於本網/競業同位置交集
const CMP_WIN_COLOR = "#2a52e8"; // 藍：主業者（本網業者）贏
const CMP_LOSE_COLOR = "#e60000"; // 紅：主業者（本網業者）輸

function binPointsByCell(points) {
  const cells = new Map();
  (points || []).filter(isValidPoint).forEach((p) => {
    if (p.rsrp == null) return;
    const key = `${Math.round(p.lat / MDT_CELL_DEG)}|${Math.round(p.lon / MDT_CELL_DEG)}`;
    let c = cells.get(key);
    if (!c) {
      c = { lat: 0, lon: 0, sum: 0, n: 0 };
      cells.set(key, c);
    }
    c.lat += p.lat;
    c.lon += p.lon;
    c.sum += p.rsrp;
    c.n += 1;
  });
  return cells;
}

/** 計算本網/競業交集（同網格皆有值），差值＝主業者−競業 */
function computeMdtComparison(primary, compare) {
  const A = binPointsByCell(primary.points);
  const B = binPointsByCell(compare.points);
  const pairs = [];
  A.forEach((a, key) => {
    const b = B.get(key);
    if (!b) return;
    const aM = a.sum / a.n;
    const bM = b.sum / b.n;
    pairs.push({
      lat: a.lat / a.n,
      lon: a.lon / a.n,
      a: Math.round(aM * 10) / 10,
      b: Math.round(bM * 10) / 10,
      delta: Math.round((aM - bM) * 10) / 10,
    });
  });
  return pairs;
}

/** 僅畫交集 Binning 點：主業者贏=藍、輸=紅；支援單獨勾選顯示 */
function renderMdtComparePoints(fit) {
  mdtLayer.clearLayers();
  const pairs = mdtComparePairs || [];
  const shown = [];
  pairs.forEach((pt) => {
    const win = pt.delta >= 0;
    if (win && !cmpShow.win) return;
    if (!win && !cmpShow.lose) return;
    shown.push(pt);
    const col = win ? CMP_WIN_COLOR : CMP_LOSE_COLOR;
    L.circleMarker([pt.lat, pt.lon], {
      radius: 5,
      color: col,
      fillColor: col,
      fillOpacity: 0.85,
      weight: 1,
      renderer: canvasRenderer,
    })
      .bindTooltip(
        `${cmpMeta.primaryOp} Max RSRP: ${pt.a} dBm<br>${cmpMeta.compareOp} Max RSRP: ${pt.b} dBm<br>${lang === "en" ? "Diff" : "差"}（${cmpMeta.primaryOp}−${cmpMeta.compareOp}）: ${pt.delta > 0 ? "+" : ""}${pt.delta} dBm`,
        { direction: "top", offset: [0, -4], sticky: true }
      )
      .addTo(mdtLayer);
  });
  if (fit && shown.length) {
    map.fitBounds(L.latLngBounds(shown.map((p) => [p.lat, p.lon])), { padding: [48, 48], maxZoom: 13 });
  }
}

function drawMdtComparison(primary, compare, options = {}) {
  mdtComparePairs = computeMdtComparison(primary, compare);
  renderMdtComparePoints(options.fit !== false);
  renderCmpLegend();
  return mdtComparePairs;
}

/** 地圖右上角比較 Legend（含統計與單選顯示） */
function renderCmpLegend() {
  const box = document.getElementById("cmpLegend");
  if (!box) return;
  if (!mdtComparePairs || !mdtComparePairs.length) {
    box.hidden = true;
    return;
  }
  const total = mdtComparePairs.length;
  const win = mdtComparePairs.filter((p) => p.delta >= 0).length;
  const lose = total - win;
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const pOp = cmpMeta.primaryOp;
  const cOp = cmpMeta.compareOp;
  box.hidden = false;
  const title = lang === "en" ? `Comparison (Max RSRP) · ${total} cells` : `比較（Max RSRP）· 交集 ${total} 處`;
  const winLabel = lang === "en" ? `${pOp} beats ${cOp}` : `${pOp} 贏 ${cOp}`;
  const loseLabel = lang === "en" ? `${pOp} loses to ${cOp}` : `${pOp} 輸 ${cOp}`;
  box.innerHTML = `
    <div class="cmp-legend-title">${title}</div>
    <label class="cmp-legend-row">
      <input type="checkbox" id="cmpWinChk" ${cmpShow.win ? "checked" : ""}>
      <span class="dot" style="background:${CMP_WIN_COLOR}"></span>
      ${winLabel}：<strong>${win}</strong>（${pct(win)}%）
    </label>
    <label class="cmp-legend-row">
      <input type="checkbox" id="cmpLoseChk" ${cmpShow.lose ? "checked" : ""}>
      <span class="dot" style="background:${CMP_LOSE_COLOR}"></span>
      ${loseLabel}：<strong>${lose}</strong>（${pct(lose)}%）
    </label>`;
  document.getElementById("cmpWinChk").addEventListener("change", (e) => {
    cmpShow.win = e.target.checked;
    renderMdtComparePoints(false);
  });
  document.getElementById("cmpLoseChk").addEventListener("change", (e) => {
    cmpShow.lose = e.target.checked;
    renderMdtComparePoints(false);
  });
}

/** 依是否比較，將 MDT 結果卡放到地圖下方或左欄 */
function placeMdtResult(toDock) {
  const card = document.getElementById("resultCard");
  const dock = document.getElementById("mdtDock");
  if (toDock) {
    dock.appendChild(card);
    card.classList.add("card-docked");
    dock.hidden = false;
  } else {
    document.querySelector(".panel").appendChild(card);
    card.classList.remove("card-docked");
    dock.hidden = true;
  }
  setTimeout(() => map?.invalidateSize(), 80);
}

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "\uFEFF" + rows.map((r) => (r || []).map(esc).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDtReport() {
  const route = currentRouteView;
  if (!route) {
    alert(tt("請先選擇路測路線"));
    return;
  }
  const rows = [
    [C("路測 DT 報告", "Drive Test DT Report")],
    [C("路線", "Route"), trRouteName(route.name)],
    [C("方向", "Direction"), dir(route.direction || "")],
    [C("上色依據", "Color by"), dtColorMetric],
    [C("弱訊門檻(dBm)", "Weak threshold (dBm)"), weakThreshold],
    [C("4G 平均 RSRP(dBm)", "4G Avg RSRP (dBm)"), route.stats?.mean ?? ""],
    [C("4G 最差 RSRP(dBm)", "4G Worst RSRP (dBm)"), route.stats?.minimum ?? ""],
    [C("4G 樣本數", "4G Samples"), route.stats?.count ?? ""],
    [C("弱訊比例(%)", "Weak % (%)"), route.weak_pct ?? ""],
  ];
  const nr = route.kpi?.nr_rsrp;
  if (nr) {
    rows.push([C("5G 平均 RSRP(dBm)", "5G Avg RSRP (dBm)"), nr.mean ?? ""]);
    rows.push([C("5G 最佳 RSRP(dBm)", "5G Best RSRP (dBm)"), nr.maximum ?? ""]);
  }
  if (route.kpi?.nr_sinr) rows.push([C("5G 平均 SINR(dB)", "5G Avg SINR (dB)"), route.kpi.nr_sinr.mean ?? ""]);
  rows.push([]);
  rows.push([C("弱訊區段(km起)", "Weak zone (km from)"), C("km迄", "km to"), C("平均 RSRP", "Avg RSRP"), C("最低 RSRP", "Min RSRP"), C("樣本數", "Samples")]);
  (route.weak_zones || []).forEach((z) => rows.push([z.km_start, z.km_end, z.avg_rsrp, z.min_rsrp, z.samples]));
  downloadCsv(`DT_${route.name}.csv`, rows);
}

function exportMdtReport() {
  const ds = currentMdtView;
  if (!ds) {
    alert(tt("請先載入MDT"));
    return;
  }
  const rows = [
    [C("MDT 報告", "MDT Report")],
    [C("區段", "Segment"), trRouteName(ds.segment_name)],
    [C("業者", "Operator"), ds.operator],
    [C("層別", "Layer"), ds.layer],
    [C("技術", "Tech"), ds.tech],
    [C("資料日期", "Data Date"), ds.date_label],
    [`${ds.tech} ${C("平均 RSRP(dBm)", "Avg RSRP (dBm)")}`, ds.stats?.mean ?? ""],
    [C("弱訊比例(%)", "Weak % (%)"), ds.weak_pct ?? ""],
    [C("樣本數", "Samples"), ds.stats?.count ?? ""],
  ];
  if (mdtCompareView) {
    const c = mdtCompareView;
    rows.push([]);
    rows.push([C("異業者比較（交集）", "Cross-operator (intersection)"), `${ds.operator} ${mdtLayerLabel(ds)} vs ${c.operator} ${mdtLayerLabel(c)}`]);
    if (mdtComparePairs && mdtComparePairs.length) {
      const n = mdtComparePairs.length;
      const avgDelta = Math.round((mdtComparePairs.reduce((s, p) => s + p.delta, 0) / n) * 10) / 10;
      const betterPct = Math.round((mdtComparePairs.filter((p) => p.delta > 0).length / n) * 1000) / 10;
      rows.push([C("交集網格數", "Intersection cells"), n]);
      rows.push([C("平均差(本網-競業, dBm)", "Avg diff (home-competitor, dBm)"), avgDelta]);
      rows.push([C("本網較佳比例(%)", "Home better % (%)"), betterPct]);
      rows.push([]);
      rows.push([C("緯度", "Lat"), C("經度", "Lon"), `${ds.operator}(dBm)`, `${c.operator}(dBm)`, C("差(本網-競業)", "Diff (home-competitor)")]);
      mdtComparePairs.forEach((p) =>
        rows.push([p.lat.toFixed(5), p.lon.toFixed(5), p.a, p.b, p.delta])
      );
    }
  }
  downloadCsv(`MDT_${ds.segment_name}_${ds.operator}.csv`, rows);
}

function getStationSegmentItems() {
  const directions = routeDirectionFilter === "all" ? ["南下", "北上"] : [routeDirectionFilter];
  const items = [];

  directions.forEach((direction) => {
    for (let i = 0; i < HSR_STATION_CHAIN.length - 1; i++) {
      const start = direction === "南下" ? HSR_STATION_CHAIN[i] : HSR_STATION_CHAIN[i + 1];
      const end = direction === "南下" ? HSR_STATION_CHAIN[i + 1] : HSR_STATION_CHAIN[i];
      const resolved = resolveRouteQuery(start, end, direction);
      if (!resolved?.route) continue;
      items.push({
        id: resolved.route.id,
        name: `${start}→${end}`,
        direction,
        route: resolved.route,
        interval: resolved.interval,
        start_station: start,
        end_station: end,
        stats: resolved.route.stats,
        weak_pct: weakPctFromPoints(resolved.route.points, weakThreshold),
        has_weak_zone: computeWeakZones(resolved.route.points, 2, weakThreshold).length > 0,
        chain_index: i,
      });
    }
  });
  return items;
}

function renderRouteList() {
  const el = document.getElementById("routeList");
  el.innerHTML = "";

  if (routeScopeFilter === "segment") {
    const items = getStationSegmentItems();
    if (!items.length) {
      el.innerHTML = `<p class='hint'>${tt("請選擇行車方向以顯示各站間分段")}</p>`;
      return;
    }
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const hasWeak = item.has_weak_zone;
      btn.className = "route-btn" + (hasWeak ? " has-weak" : "");
      btn.innerHTML = `<div>${trRouteName(item.name)}（${dir(item.direction)}）<span class="route-tag segment">${tt("站間")}</span></div>
        <div class="meta">4G RSRP ${item.stats?.mean?.toFixed(1) ?? "—"} dBm · ${tt("弱訊比例")} ${item.weak_pct ?? "—"}%</div>`;
      btn.addEventListener("click", () => {
        showRouteView(item.route);
        renderDtResult(item.route, item.start_station, item.end_station, item.interval);
      });
      el.appendChild(btn);
    });
    return;
  }

  dtData.routes
    .filter((r) => r.scope === "full")
    .filter((r) => routeDirectionFilter === "all" || r.direction === routeDirectionFilter)
    .forEach((r) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "route-btn";
      btn.dataset.id = r.id;
      btn.innerHTML = `<div>${trRouteName(r.name)}（${dir(r.direction)}）<span class="route-tag full">${tt("全線")}</span></div>
        <div class="meta">4G RSRP ${r.stats?.mean?.toFixed(1)} dBm · ${tt("弱訊比例")} ${r.weak_pct}%</div>`;
      btn.addEventListener("click", () => {
        showRoute(r.id);
        renderDtResult(r, r.start_station, r.end_station, null);
      });
      el.appendChild(btn);
    });
}

function drawMdtBins(layer, points, route, options = {}) {
  const colors = getColors();
  const valid = points.filter(isValidPoint);
  if (!valid.length) return [];

  valid.forEach((p) => {
    L.circleMarker([p.lat, p.lon], {
      radius: 5,
      color: colors[p.level],
      fillColor: colors[p.level],
      fillOpacity: 0.75,
      weight: 1,
      renderer: canvasRenderer,
    })
      .bindTooltip(buildPointTooltip(p), { direction: "top", offset: [0, -4], sticky: true })
      .on("click", () => showPointInfo(p, route, true))
      .addTo(layer);
  });

  if (options.fit !== false) {
    map.fitBounds(L.latLngBounds(valid.map((pt) => [pt.lat, pt.lon])), { padding: [48, 48], maxZoom: 13 });
  }
  return valid.map((pt) => [pt.lat, pt.lon]);
}

function drawColoredRoute(layer, points, route, isMdt, options = {}) {
  const colors = getColors();
  const renderer = options.renderer || canvasRenderer;
  const targetMap = options.map || map;
  const metric = options.metric || dtColorMetric;
  const valOf = (p) => (metric === "5G" ? p.nr_rsrp : p.rsrp);
  const lvlOf = (p) => rsrpLevel(valOf(p));
  let valid = points.filter((p) => isValidPoint(p) && valOf(p) != null);
  if (valid.length < 2) return [];

  if (route?.scope === "interval") {
    const { north, south } = getHsrAxis();
    if (north && south) {
      valid = [...valid].sort((a, b) => chainageScore(a, north, south) - chainageScore(b, north, south));
    }
  }

  let segLatLngs = [[valid[0].lat, valid[0].lon]];
  let segLevel = lvlOf(valid[0]);

  const flushSegment = () => {
    if (segLatLngs.length < 2) return;
    L.polyline(segLatLngs, {
      color: colors[segLevel],
      weight: isMdt ? 4 : 5,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round",
      renderer: renderer,
      smoothFactor: 1.2,
    }).addTo(layer);
  };

  const startNewSegment = (p) => {
    segLatLngs = [[p.lat, p.lon]];
    segLevel = lvlOf(p);
  };

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1];
    const p = valid[i];
    const gap = haversineM(prev, p);

    if (gap > MAX_GAP_M) {
      flushSegment();
      startNewSegment(p);
      continue;
    }

    if (lvlOf(p) !== segLevel) {
      segLatLngs.push([p.lat, p.lon]);
      flushSegment();
      startNewSegment(p);
    } else {
      segLatLngs.push([p.lat, p.lon]);
    }
  }
  flushSegment();

  const step = valid.length > 800 ? 16 : valid.length > 400 ? 10 : 6;
  let lastMarker = null;
  valid.forEach((p, i) => {
    if (i % step !== 0 && i !== valid.length - 1) return;
    if (lastMarker && haversineM(lastMarker, p) < 800) return;
    lastMarker = p;
    const lvl = lvlOf(p);
    L.circleMarker([p.lat, p.lon], {
      radius: 3,
      color: colors[lvl],
      fillColor: colors[lvl],
      fillOpacity: 0.35,
      weight: 0,
      renderer: renderer,
    })
      .bindTooltip(buildPointTooltip(p), { direction: "top", offset: [0, -4], sticky: true })
      .on("click", () => showPointInfo(p, route, isMdt))
      .addTo(layer);
  });

  const latlngs = valid.map((p) => [p.lat, p.lon]);
  if (options.fit !== false) {
    targetMap.fitBounds(L.latLngBounds(latlngs), { padding: [48, 48], maxZoom: 13 });
  }
  return latlngs;
}

function buildPointTooltip(p) {
  let tip = `4G RSRP ${p.rsrp} dBm`;
  if (p.sinr != null) tip += `<br>4G SINR ${p.sinr} dB`;
  if (p.nr_rsrp != null) tip += `<br>5G RSRP ${p.nr_rsrp} dBm`;
  if (p.nr_sinr != null) tip += `<br>5G SINR ${p.nr_sinr} dB`;
  if (p.tput_dl != null) tip += `<br>DL ${p.tput_dl} kbps`;
  return tip;
}

function drawPoints(layer, points, route, isMdt, options = {}) {
  if (isMdt) return drawMdtBins(layer, points, route, options);
  return drawColoredRoute(layer, points, route, false, options);
}

function showRouteView(route) {
  currentRouteView = route;
  activeRouteId = route.parent_id || route.id;
  document.getElementById("pointPopup").hidden = true;
  const legend = document.querySelector(".map-legend");
  if (legend) legend.style.display = "";
  const cmpBox = document.getElementById("cmpLegend");
  if (cmpBox) cmpBox.hidden = true;

  document.querySelectorAll(".route-btn").forEach((btn) => {
    const id = btn.dataset.id;
    btn.classList.toggle("active", !!id && (id === route.id || id === route.parent_id));
  });

  applyWeakThreshold(route);

  routeLayer.clearLayers();
  weakLayer.clearLayers();
  if (activeMode !== "mdt" || !document.getElementById("overlayDt").checked) {
    mdtLayer.clearLayers();
  }

  drawPoints(routeLayer, route.points, route, false);
  drawWeakZones(route);
}

function showRoute(id) {
  const route = getRoute(id);
  if (!route) return;
  showRouteView(route);
}

function showMdtView(ds, options = {}) {
  activeMdtId = ds.id;
  currentMdtView = ds;
  currentRouteView = null;
  document.getElementById("pointPopup").hidden = true;

  mdtLayer.clearLayers();
  routeLayer.clearLayers();
  weakLayer.clearLayers();

  const legend = document.querySelector(".map-legend");
  const cmpBox = document.getElementById("cmpLegend");
  if (mdtCompareView) {
    if (legend) legend.style.display = "none";
    mdtComparePairs = drawMdtComparison(ds, mdtCompareView, { fit: options.fit !== false });
  } else {
    if (legend) legend.style.display = "";
    if (cmpBox) cmpBox.hidden = true;
    mdtComparePairs = null;
    drawPoints(mdtLayer, ds.points, ds, true, { fit: options.fit !== false });
  }
  updateDtOverlay();
}

function showMdt(id) {
  const ds = getMdt(id);
  if (!ds) return;
  showMdtView(ds);
}

function showPointInfo(p, route, isMdt) {
  const el = document.getElementById("pointPopup");
  el.hidden = false;
  el.innerHTML = `
    <strong>${trRouteName(route.name || route.segment_name || route.id)}</strong><br>
    RSRP: <b style="color:${getColors()[p.level]}">${p.rsrp} dBm</b><br>
    ${p.sinr != null ? `SINR: ${p.sinr} dB<br>` : ""}
    ${p.tput_dl != null ? `DL: ${p.tput_dl} kbps<br>` : ""}
    ${p.dist_m != null ? `${tt("距起點")}: ${(p.dist_m / 1000).toFixed(1)} km<br>` : ""}
    ${tt("來源")}: ${isMdt ? "MDT" : tt("路測 DT")}
  `;
}

init().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px;color:red">${tt("載入失敗")}: ${err.message}\n${tt("請先執行build提示")}</pre>`;
});
