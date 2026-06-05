"""Build HSR RF PoC datasets: DT segments/full line, MDT integration, historical compare."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

import pandas as pd

BASE = Path(r"c:\Users\tsuwang\Desktop\About CHT-MDT\Sample data_For_Dashboard")
MDT_BASE = Path(__file__).resolve().parent.parent / "TWM_DT_MDT_HSR_25m" / "MDT"
DT_BASE = Path(__file__).resolve().parent.parent / "TWM_DT_MDT_HSR_25m" / "DT"
OUT = Path(__file__).resolve().parent / "data"

STATIONS = [
    {"id": "nangang", "name": "南港", "lat": 25.05306, "lon": 121.60672, "order_north": 1},
    {"id": "taipei", "name": "台北", "lat": 25.04792, "lon": 121.51708, "order_north": 2},
    {"id": "banqiao", "name": "板橋", "lat": 25.01442, "lon": 121.46463, "order_north": 3},
    {"id": "taoyuan", "name": "桃園", "lat": 25.01309, "lon": 121.21503, "order_north": 4},
    {"id": "hsinchu", "name": "新竹", "lat": 24.80806, "lon": 120.96472, "order_north": 5},
    {"id": "miaoli", "name": "苗栗", "lat": 24.60528, "lon": 120.82528, "order_north": 6},
    {"id": "taichung", "name": "台中", "lat": 24.11222, "lon": 120.61528, "order_north": 7},
    {"id": "changhua", "name": "彰化", "lat": 23.87417, "lon": 120.57444, "order_north": 8},
    {"id": "yunlin", "name": "雲林", "lat": 23.73611, "lon": 120.41639, "order_north": 9},
    {"id": "chiayi", "name": "嘉義", "lat": 23.45972, "lon": 120.32306, "order_north": 10},
    {"id": "tainan", "name": "台南", "lat": 22.92528, "lon": 120.28611, "order_north": 11},
    {"id": "zuoying", "name": "左營", "lat": 22.68722, "lon": 120.30778, "order_north": 12},
]

SEGMENT_ROUTES = [
    {"id": "banqiao-hsinchu-s", "name": "板橋→新竹", "direction": "南下", "file": "DT_Log_板橋到新竹(南下).xlsx", "start_station": "板橋", "end_station": "新竹", "test_date": "2026-03-18", "scope": "segment"},
    {"id": "hsinchu-taichung-s", "name": "新竹→台中", "direction": "南下", "file": "DT_Log_新竹到台中(南下).xlsx", "start_station": "新竹", "end_station": "台中", "test_date": "2026-03-18", "scope": "segment"},
    {"id": "taichung-chiayi-s", "name": "台中→嘉義", "direction": "南下", "file": "DT_Log_台中到嘉義(南下).xlsx", "start_station": "台中", "end_station": "嘉義", "test_date": "2026-03-18", "scope": "segment"},
    {"id": "chiayi-zuoying-s", "name": "嘉義→左營", "direction": "南下", "file": "DT_Log_嘉義到左營(南下).xlsx", "start_station": "嘉義", "end_station": "左營", "test_date": "2026-03-18", "scope": "segment"},
    {"id": "zuoying-taichung-n", "name": "左營→台中", "direction": "北上", "file": "DT_Log_左營至台中(北上).xlsx", "start_station": "左營", "end_station": "台中", "test_date": "2026-03-18", "scope": "segment"},
    {"id": "taichung-banqiao-n", "name": "台中→板橋", "direction": "北上", "file": "DT_Log_台中到板橋(北上).xlsx", "start_station": "台中", "end_station": "板橋", "test_date": "2026-03-18", "scope": "segment"},
]

FULL_ROUTES = [
    {"id": "full-banqiao-zuoying-s", "name": "板橋→左營（全線）", "direction": "南下", "file": "HSR_DT_10m_板橋-左營(南下).csv", "start_station": "板橋", "end_station": "左營", "test_date": "2026-03-18", "scope": "full"},
    {"id": "full-zuoying-banqiao-n", "name": "左營→板橋（全線）", "direction": "北上", "file": "HSR_DT_10m_左營-板橋(北上).csv", "start_station": "左營", "end_station": "板橋", "test_date": "2026-03-18", "scope": "full"},
]

# 新版 DT：CHT 全線路測（南下/北上 各一檔，含 4G LTE + 5G NR）
CHT_DT_ROUTES = [
    {"id": "full-nangang-zuoying-s", "name": "南港→左營（全線）", "direction": "南下", "file": "CHT-DT_南下.csv", "start_station": "南港", "end_station": "左營", "test_date": "2026-03-18", "scope": "full"},
    {"id": "full-zuoying-nangang-n", "name": "左營→南港（全線）", "direction": "北上", "file": "CHT-DT_北上.csv", "start_station": "左營", "end_station": "南港", "test_date": "2026-03-18", "scope": "full"},
]

MDT_SEGMENTS = [
    {"id": "N1", "name": "北段", "desc": "南港–板橋", "folder": "N1"},
    {"id": "N2", "name": "北中段", "desc": "台北–新竹", "folder": "N2"},
    {"id": "C", "name": "中段", "desc": "苗栗–雲林", "folder": "C"},
    {"id": "S", "name": "南段", "desc": "嘉義–左營", "folder": "S"},
]

MDT_LAYERS = {
    "L7": {"tech": "4G", "label": "4G L7"},
    "L9": {"tech": "4G", "label": "4G L9"},
    "L18": {"tech": "4G", "label": "4G L18"},
    "L21": {"tech": "4G", "label": "4G L21"},
    "L26": {"tech": "4G", "label": "4G L26"},
}

MDT_IF_OPERATORS = ["CHT", "FET"]

MDT_DATES = ["20260112", "20260316"]

HSR_GEO_CHAIN = ["南港", "台北", "板橋", "桃園", "新竹", "苗栗", "台中", "彰化", "雲林", "嘉義", "台南", "左營"]

KML_PATH = Path(__file__).resolve().parent.parent / "HSR_Polygon" / "高鐵.kml"
CORRIDOR_BIN_KM = 2

MDT_REGION_SPAN = {
    "N1": ("南港", "板橋"),
    "N2": ("板橋", "新竹"),
    "C": ("苗栗", "雲林"),
    "S": ("嘉義", "左營"),
}

# HSR_GEO_CHAIN index span per Region folder (from CSV geographic coverage)
MDT_REGION_CHAIN_IDX = {
    "N1": [0, 2],
    "N2": [2, 4],
    "C": [5, 8],
    "S": [9, 11],
}

STATION_BY_NAME = {s["name"]: s for s in STATIONS}


def station_order(name: str) -> int:
    return STATION_BY_NAME[name]["order_north"]


def route_covers(start: str, end: str, direction: str, route: dict) -> bool:
    so, eo = station_order(start), station_order(end)
    rs, re = station_order(route["start_station"]), station_order(route["end_station"])
    if route["direction"] != direction:
        return False
    if direction == "南下":
        if so >= eo:
            return False
        return rs <= so and eo <= re
    if so <= eo:
        return False
    return re <= eo and so <= rs


def find_parent_route(routes: list[dict], start: str, end: str, direction: str) -> dict | None:
    candidates = [r for r in routes if route_covers(start, end, direction, r)]
    if not candidates:
        return None
    candidates.sort(
        key=lambda r: (
            0 if r["scope"] == "segment" else 1,
            abs(station_order(end) - station_order(start)),
        )
    )
    return candidates[0]


def compute_station_anchors(points: list[dict], max_dist_m: float = 15000) -> dict[str, float]:
    anchors: dict[str, float] = {}
    for st in STATIONS:
        best_dist = float("inf")
        best_anchor = None
        for p in points:
            if p.get("dist_m") is None:
                continue
            d = haversine_m(st["lat"], st["lon"], p["lat"], p["lon"])
            if d < best_dist:
                best_dist = d
                best_anchor = float(p["dist_m"])
        if best_anchor is not None and best_dist <= max_dist_m:
            anchors[st["name"]] = round(best_anchor, 0)
    return anchors


def fill_anchors_by_interpolation(route: dict, anchors: dict[str, float]) -> dict[str, float]:
    """Fill missing station anchors by linear interpolation along route order."""
    rs = station_order(route["start_station"])
    re = station_order(route["end_station"])
    lo, hi = min(rs, re), max(rs, re)
    if route["direction"] == "南下":
        route_orders = [s for s in STATIONS if lo <= s["order_north"] <= hi]
    else:
        route_orders = [s for s in STATIONS if lo <= s["order_north"] <= hi]

    known = [(station_order(s["name"]), anchors[s["name"]]) for s in route_orders if s["name"] in anchors]
    if len(known) < 2:
        return anchors

    known.sort(key=lambda x: x[0])
    filled = dict(anchors)
    for st in route_orders:
        name = st["name"]
        if name in filled:
            continue
        o = st["order_north"]
        left = right = None
        for i, (ko, kd) in enumerate(known):
            if ko <= o:
                left = (ko, kd)
            if ko >= o and right is None:
                right = (ko, kd)
                break
        if left and right and left[0] != right[0]:
            ratio = (o - left[0]) / (right[0] - left[0])
            filled[name] = round(left[1] + (right[1] - left[1]) * ratio, 0)
        elif left and not right:
            filled[name] = left[1]
        elif right and not left:
            filled[name] = right[1]
    return filled


def nearest_anchor(points: list[dict], lat: float, lon: float) -> float | None:
    best_dist = float("inf")
    best_anchor = None
    for p in points:
        if p.get("dist_m") is None:
            continue
        d = haversine_m(lat, lon, p["lat"], p["lon"])
        if d < best_dist:
            best_dist = d
            best_anchor = float(p["dist_m"])
    return round(best_anchor, 0) if best_anchor is not None else None


def chainage_score_point(lat: float, lon: float, entry: dict, exit_st: dict) -> float:
    lat_mid = math.radians((entry["lat"] + exit_st["lat"]) / 2)
    ax = (exit_st["lon"] - entry["lon"]) * math.cos(lat_mid)
    ay = exit_st["lat"] - entry["lat"]
    px = (lon - entry["lon"]) * math.cos(lat_mid)
    py = lat - entry["lat"]
    length = math.sqrt(ax * ax + ay * ay)
    return (px * ax + py * ay) / length if length else 0.0


def geographic_station_anchors(route: dict) -> dict[str, float]:
    """Monotonic chainage from 南港→左營 axis; avoids CSV row-order dist_m drift."""
    north = STATION_BY_NAME["南港"]
    south = STATION_BY_NAME["左營"]
    anchors: dict[str, float] = {}
    for st in STATIONS:
        best_dist = float("inf")
        best_score = None
        for p in route["points"]:
            d = haversine_m(st["lat"], st["lon"], p["lat"], p["lon"])
            if d < best_dist:
                best_dist = d
                best_score = chainage_score_point(p["lat"], p["lon"], north, south)
        if best_score is not None and best_dist <= 15000:
            anchors[st["name"]] = round(best_score * 1000, 0)
    return anchors


def attach_station_anchors(route: dict) -> dict[str, float]:
    return geographic_station_anchors(route)


def build_interval_lookup(routes: list[dict]) -> dict[str, dict]:
    lookup: dict[str, dict] = {}
    for direction in ("南下", "北上"):
        for start_st in STATIONS:
            for end_st in STATIONS:
                if start_st["name"] == end_st["name"]:
                    continue
                start, end = start_st["name"], end_st["name"]
                if direction == "南下" and station_order(start) >= station_order(end):
                    continue
                if direction == "北上" and station_order(start) <= station_order(end):
                    continue
                parent = find_parent_route(routes, start, end, direction)
                if not parent:
                    continue
                anchors = parent.get("station_anchors") or {}
                if start not in anchors or end not in anchors:
                    continue
                d0, d1 = anchors[start], anchors[end]
                key = f"{start}|{end}|{direction}"
                lookup[key] = {
                    "parent_id": parent["id"],
                    "parent_name": parent["name"],
                    "dist_from": min(d0, d1),
                    "dist_to": max(d0, d1),
                    "start_station": start,
                    "end_station": end,
                    "direction": direction,
                    "label": f"{start}→{end}",
                    "scope": "interval",
                }
    return lookup


def validate_interval_lookup(lookup: dict[str, dict]) -> tuple[int, list[str]]:
    missing = []
    total = 0
    for direction in ("南下", "北上"):
        for start_st in STATIONS:
            for end_st in STATIONS:
                if start_st["name"] == end_st["name"]:
                    continue
                start, end = start_st["name"], end_st["name"]
                if direction == "南下" and station_order(start) >= station_order(end):
                    continue
                if direction == "北上" and station_order(start) <= station_order(end):
                    continue
                total += 1
                key = f"{start}|{end}|{direction}"
                if key not in lookup:
                    missing.append(key)
    return total, missing


ROUTE_LOOKUP = {
    ("南港", "左營", "南下"): "full-nangang-zuoying-s",
    ("左營", "南港", "北上"): "full-zuoying-nangang-n",
}


def rsrp_level(v: float) -> str:
    """RSRP 5 級：優良/良好/普通/較弱/微弱。"""
    if v >= -85:
        return "excellent"
    if v >= -95:
        return "good"
    if v >= -105:
        return "normal"
    if v >= -115:
        return "weak"
    return "poor"


def sinr_level(v: float) -> str:
    if v > 10:
        return "good"
    if v > 6:
        return "fair"
    return "weak"


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def compute_cumulative_distance(df: pd.DataFrame) -> pd.Series:
    lats = df["Latitude"].values
    lons = df["Longitude"].values
    dist = [0.0]
    for i in range(1, len(df)):
        step = haversine_m(lats[i - 1], lons[i - 1], lats[i], lons[i])
        dist.append(dist[-1] + step if step < 1500 else dist[-1])
    return pd.Series(dist, index=df.index)


def points_from_df(df: pd.DataFrame, rsrp_col: str, step: int = 4, dist_series: pd.Series | None = None) -> list[dict]:
    cols = {c.lower(): c for c in df.columns}
    lat_c = cols.get("latitude") or cols.get("lat")
    lon_c = cols.get("longitude") or cols.get("lon")
    s = df.dropna(subset=[lat_c, lon_c, rsrp_col]).copy()
    if dist_series is not None:
        s["dist_m"] = dist_series.loc[s.index]
        s = s.sort_values("dist_m")
    s = s.iloc[::step]
    points = []
    for _, row in s.iterrows():
        rsrp = float(row[rsrp_col])
        pt = {
            "lat": round(float(row[lat_c]), 5),
            "lon": round(float(row[lon_c]), 5),
            "rsrp": round(rsrp, 1),
            "level": rsrp_level(rsrp),
        }
        if "dist_m" in s.columns and pd.notna(row.get("dist_m")):
            pt["dist_m"] = round(float(row["dist_m"]), 0)
        points.append(pt)
    return points


def weak_zones_from_dist(df: pd.DataFrame, rsrp_col: str, dist_series: pd.Series, bin_km: float = 2.0) -> list[dict]:
    lat_c = "Latitude" if "Latitude" in df.columns else "LATITUDE"
    lon_c = "Longitude" if "Longitude" in df.columns else "LONGITUDE"
    s = df.dropna(subset=[rsrp_col]).copy()
    s["dist_m"] = dist_series.loc[s.index]
    s["km"] = (s["dist_m"] / 1000 / bin_km).astype(int) * bin_km
    grouped = s.groupby("km").agg(
        avg_rsrp=(rsrp_col, "mean"),
        min_rsrp=(rsrp_col, "min"),
        count=(rsrp_col, "count"),
        lat=(lat_c, "mean"),
        lon=(lon_c, "mean"),
    )
    weak = grouped[grouped["avg_rsrp"] <= -105].reset_index().sort_values("avg_rsrp")
    return [
        {
            "km_start": float(row["km"]),
            "km_end": float(row["km"] + bin_km),
            "avg_rsrp": round(float(row["avg_rsrp"]), 1),
            "min_rsrp": round(float(row["min_rsrp"]), 1),
            "samples": int(row["count"]),
            "lat": round(float(row["lat"]), 5),
            "lon": round(float(row["lon"]), 5),
        }
        for _, row in weak.head(8).iterrows()
    ]


def stats_from_series(values: pd.Series) -> dict:
    v = values.dropna()
    if v.empty:
        return {}
    return {
        "mean": round(float(v.mean()), 2),
        "minimum": round(float(v.min()), 2),
        "maximum": round(float(v.max()), 2),
        "count": int(len(v)),
        "weak_pct": round(float((v <= -105).sum() / len(v) * 100), 1),
    }


def process_excel_route(meta: dict) -> dict:
    path = BASE / meta["file"]
    stat_df = pd.read_excel(path, sheet_name="Statistic Formatted Data")
    hist_df = pd.read_excel(path, sheet_name="Histogram Formatted Data")
    series_df = pd.read_excel(path, sheet_name="Series Formatted Data")

    stats = {}
    for _, row in stat_df.iterrows():
        stats[str(row["Statistic"]).lower().replace(" ", "_")] = round(float(row["LTE_UE_RSRP"]), 2)

    valid = series_df.dropna(subset=["LTE_UE_RSRP"])
    weak_pct = round((valid["LTE_UE_RSRP"] <= -105).sum() / len(valid) * 100, 1) if len(valid) else 0.0
    dist = compute_cumulative_distance(series_df.dropna(subset=["Latitude", "Longitude"]))
    points = points_from_df(series_df, "LTE_UE_RSRP", step=4, dist_series=dist.reindex(series_df.index))
    zones = weak_zones_from_dist(series_df, "LTE_UE_RSRP", dist.reindex(series_df.index))

    return {
        **meta,
        "source": "DT",
        "tech": "4G",
        "kpi": {
            "rsrp_4g": stats,
            "nr_rsrp": None,
            "nr_sinr": None,
            "nr_tput_dl_kbps": None,
            "nr_availability_pct": None,
        },
        "stats": stats,
        "weak_pct": weak_pct,
        "histogram": [{"range": str(r["Range"]), "count": int(r["LTE_UE_RSRP"])} for _, r in hist_df.iterrows()],
        "points": points,
        "weak_zones": zones,
        "station_anchors": attach_station_anchors({"points": points, **meta}),
    }


def process_csv_full_route(meta: dict) -> dict:
    path = BASE / meta["file"]
    df = pd.read_csv(path)
    dist = compute_cumulative_distance(df)
    stats = stats_from_series(df["LTE_UE_RSRP"])
    points = points_from_df(df, "LTE_UE_RSRP", step=6, dist_series=dist)
    zones = weak_zones_from_dist(df, "LTE_UE_RSRP", dist, bin_km=3.0)

    return {
        **meta,
        "source": "DT",
        "tech": "4G",
        "kpi": {"rsrp_4g": stats, "nr_rsrp": None, "nr_sinr": None, "nr_tput_dl_kbps": None, "nr_availability_pct": None},
        "stats": stats,
        "weak_pct": stats.get("weak_pct", 0),
        "histogram": [],
        "points": points,
        "weak_zones": zones,
        "station_anchors": attach_station_anchors({"points": points, **meta}),
    }


def simple_stats(series: pd.Series) -> dict | None:
    v = series.dropna()
    if v.empty:
        return None
    return {
        "mean": round(float(v.mean()), 2),
        "minimum": round(float(v.min()), 2),
        "maximum": round(float(v.max()), 2),
        "count": int(len(v)),
    }


def points_from_cht_df(df: pd.DataFrame, step: int, dist_series: pd.Series) -> list[dict]:
    """CHT 全線路測點：以 4G LTE RSRP 上色，附帶 5G NR 量測。"""
    s = df.dropna(subset=["Latitude", "Longitude", "LTE_UE_RSRP"]).copy()
    s["dist_m"] = dist_series.loc[s.index]
    s = s.sort_values("dist_m").iloc[::step]
    points = []
    for _, row in s.iterrows():
        rsrp = float(row["LTE_UE_RSRP"])
        pt = {
            "lat": round(float(row["Latitude"]), 5),
            "lon": round(float(row["Longitude"]), 5),
            "rsrp": round(rsrp, 1),
            "level": rsrp_level(rsrp),
            "dist_m": round(float(row["dist_m"]), 0),
        }
        if pd.notna(row.get("LTE_UE_SINR")):
            pt["sinr"] = round(float(row["LTE_UE_SINR"]), 1)
        if pd.notna(row.get("NR_UE_RSRP_0")):
            pt["nr_rsrp"] = round(float(row["NR_UE_RSRP_0"]), 1)
        if pd.notna(row.get("NR_UE_SINR_0")):
            pt["nr_sinr"] = round(float(row["NR_UE_SINR_0"]), 1)
        points.append(pt)
    return points


def process_cht_dt_full(meta: dict) -> dict:
    """讀取 CHT 全線路測 CSV（4G LTE + 5G NR）。"""
    path = DT_BASE / meta["file"]
    df = pd.read_csv(path)
    clean = df.dropna(subset=["Latitude", "Longitude"]).copy()
    dist = compute_cumulative_distance(clean)
    stats = stats_from_series(clean["LTE_UE_RSRP"])
    nr_rsrp = stats_from_series(clean["NR_UE_RSRP_0"]) if "NR_UE_RSRP_0" in clean else None
    nr_sinr = simple_stats(clean["NR_UE_SINR_0"]) if "NR_UE_SINR_0" in clean else None
    step = 3 if len(clean) > 6000 else 2
    points = points_from_cht_df(clean, step=step, dist_series=dist)
    zones = weak_zones_from_dist(clean, "LTE_UE_RSRP", dist, bin_km=3.0)

    return {
        **meta,
        "source": "DT",
        "operator": "CHT",
        "tech": "4G",
        "kpi": {
            "rsrp_4g": stats,
            "nr_rsrp": nr_rsrp,
            "nr_sinr": nr_sinr,
            "nr_tput_dl_kbps": None,
            "nr_availability_pct": None,
        },
        "stats": stats,
        "weak_pct": stats.get("weak_pct", 0),
        "histogram": [],
        "points": points,
        "weak_zones": zones,
        "station_anchors": attach_station_anchors({"points": points, **meta}),
    }


def mdt_stats(df: pd.DataFrame, tech: str) -> dict:
    rsrp = df["AVGRSRP"] if "AVGRSRP" in df.columns else df.get("NBR1RSRP")
    out = {
        "rsrp_4g" if tech == "4G" else "nr_rsrp": stats_from_series(rsrp),
    }
    if tech == "5G" and "AVGPUSCHSINR" in df.columns:
        sinr = df["AVGPUSCHSINR"].dropna()
        out["nr_sinr"] = {
            "mean": round(float(sinr.mean()), 2) if len(sinr) else None,
            "minimum": round(float(sinr.min()), 2) if len(sinr) else None,
            "count": int(len(sinr)),
        }
    if "MACTPUTKBPS_DL" in df.columns:
        tput = df["MACTPUTKBPS_DL"].dropna()
        out["nr_tput_dl_kbps"] = {
            "mean": round(float(tput.mean()), 0) if len(tput) else None,
            "maximum": round(float(tput.max()), 0) if len(tput) else None,
            "count": int(len(tput)),
        }
    valid = rsrp.dropna()
    out["nr_availability_pct"] = round(len(valid) / max(len(df), 1) * 100, 1)
    return out


def process_twm_mdt(segment_id: str, folder: Path, date: str, layer: str, tech: str) -> dict | None:
    pattern = f"HSR_{segment_id}_{date}_TWMmdtFreq25m_{layer}.csv"
    matches = list(folder.glob(pattern))
    if not matches:
        return None
    df = pd.read_csv(matches[0])
    kpi = mdt_stats(df, tech)
    rsrp_stats = kpi.get("nr_rsrp" if tech == "5G" else "rsrp_4g") or {}
    points = []
    step = 12 if len(df) > 10000 else 8
    for _, row in df.iloc[::step].iterrows():
        rsrp = float(row["AVGRSRP"])
        max_rsrp = float(row["MAXRSRP"]) if pd.notna(row.get("MAXRSRP")) else None
        sinr = float(row["AVGPUSCHSINR"]) if pd.notna(row.get("AVGPUSCHSINR")) else None
        tput = float(row["MACTPUTKBPS_DL"]) if pd.notna(row.get("MACTPUTKBPS_DL")) else None
        points.append(
            {
                "lat": round(float(row["LATITUDE"]), 5),
                "lon": round(float(row["LONGITUDE"]), 5),
                "rsrp": round(rsrp, 1),
                "max_rsrp": round(max_rsrp, 1) if max_rsrp is not None else None,
                "level": rsrp_level(rsrp),
                "sinr": round(sinr, 1) if sinr is not None else None,
                "tput_dl": round(tput, 0) if tput is not None else None,
            }
        )
    return {
        "id": f"mdt-twm-{segment_id}-{layer}-{date}",
        "segment_id": segment_id,
        "operator": "TWM",
        "layer": layer,
        "tech": tech,
        "date": date,
        "date_label": f"{date[:4]}/{date[4:6]}/{date[6:8]}",
        "source": "MDT",
        "source_file": matches[0].name,
        "kpi": kpi,
        "stats": rsrp_stats,
        "weak_pct": rsrp_stats.get("weak_pct", 0),
        "points": points,
        "point_count": len(points),
    }


def process_ifmdt_mdt(segment_id: str, folder: Path, date: str, operator: str) -> dict | None:
    pattern = f"HSR_{segment_id}_{date}_ifMDT25m_{operator}.csv"
    matches = list(folder.glob(pattern))
    if not matches:
        return None
    df = pd.read_csv(matches[0])
    agg = df.groupby(["LONGITUDE", "LATITUDE"], as_index=False).agg(
        NBR1RSRP=("NBR1RSRP", "mean"),
        MAXNBR1RSRP=("MAXNBR1RSRP", "max"),
        NBR1RSRQ=("NBR1RSRQ", "mean"),
        MRCOUNT=("MRCOUNT", "sum"),
    )
    kpi = {
        "rsrp_4g": stats_from_series(agg["NBR1RSRP"]),
        "rsrp_4g_max": stats_from_series(agg["MAXNBR1RSRP"]),
    }
    # 較密取樣，利於本網/競業交集比對
    step = 6 if len(agg) > 12000 else 4 if len(agg) > 6000 else 2
    points = []
    for _, row in agg.iloc[::step].iterrows():
        rsrp = float(row["NBR1RSRP"])
        max_rsrp = float(row["MAXNBR1RSRP"])
        points.append(
            {
                "lat": round(float(row["LATITUDE"]), 5),
                "lon": round(float(row["LONGITUDE"]), 5),
                "rsrp": round(rsrp, 1),
                "max_rsrp": round(max_rsrp, 1),
                "level": rsrp_level(rsrp),
            }
        )
    op_key = operator.lower()
    return {
        "id": f"mdt-{op_key}-{segment_id}-{date}",
        "segment_id": segment_id,
        "operator": operator,
        "layer": "ifMDT",
        "tech": "4G",
        "date": date,
        "date_label": f"{date[:4]}/{date[4:6]}/{date[6:8]}",
        "source": "MDT",
        "source_file": matches[0].name,
        "kpi": kpi,
        "stats": kpi["rsrp_4g"],
        "weak_pct": kpi["rsrp_4g"].get("weak_pct", 0),
        "points": points,
        "point_count": len(points),
    }


def build_mdt_station_segments() -> list[dict]:
    """Adjacent station pairs along 南港→左營 (no direction split)."""
    segments: list[dict] = []
    for i in range(len(HSR_GEO_CHAIN) - 1):
        start = HSR_GEO_CHAIN[i]
        end = HSR_GEO_CHAIN[i + 1]
        segments.append(
            {
                "id": f"{start}|{end}",
                "start_station": start,
                "end_station": end,
                "label": f"{start}→{end}",
            }
        )
    return segments


def _interp_coord(a: dict, b: dict, t: float) -> dict:
    return {"lat": a["lat"] + t * (b["lat"] - a["lat"]), "lon": a["lon"] + t * (b["lon"] - a["lon"])}


def _parse_kml_ring(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"<coordinates>([^<]+)</coordinates>", text)
    if not match:
        raise ValueError(f"KML 無 coordinates：{path}")
    ring: list[dict] = []
    for pair in match.group(1).strip().split():
        lon, lat = pair.split(",")[:2]
        ring.append({"lat": float(lat), "lon": float(lon)})
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    return ring


def _bearing_deg(a: dict, b: dict) -> float:
    d_lon = math.radians(b["lon"] - a["lon"])
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _destination_point(lat: float, lon: float, bearing: float, dist_m: float) -> dict:
    r = 6371000
    brng = math.radians(bearing)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    lat2 = math.asin(
        math.sin(lat1) * math.cos(dist_m / r) + math.cos(lat1) * math.sin(dist_m / r) * math.cos(brng)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(dist_m / r) * math.cos(lat1),
        math.cos(dist_m / r) - math.sin(lat1) * math.sin(lat2),
    )
    return {"lat": math.degrees(lat2), "lon": math.degrees(lon2)}


def _build_centerline_track(ring: list[dict], dist_m_fn, axis_m: float, step_m: int = 120) -> list[dict]:
    """Centerline sampled from KML ring nearest each chainage step."""
    track: list[dict] = []
    last_key = None
    for d in range(0, int(axis_m) + 1, step_m):
        best_p = None
        best_delta = float("inf")
        for p in ring:
            delta = abs(dist_m_fn(p) - d)
            if delta < best_delta:
                best_delta = delta
                best_p = p
        if not best_p:
            continue
        key = f"{best_p['lat']:.5f}|{best_p['lon']:.5f}"
        if key == last_key:
            continue
        last_key = key
        track.append({"lat": best_p["lat"], "lon": best_p["lon"], "dist_m": float(d)})
    if track and track[-1]["dist_m"] < axis_m - step_m * 0.5:
        end_p = min(ring, key=lambda p: abs(dist_m_fn(p) - axis_m))
        track.append({"lat": end_p["lat"], "lon": end_p["lon"], "dist_m": axis_m})
    return track


def _build_buffer_polygon(track_slice: list[dict], buffer_m: float = 350) -> list[list[float]] | None:
    if not track_slice:
        return None
    if len(track_slice) == 1:
        p = track_slice[0]
        ring = [
            _destination_point(p["lat"], p["lon"], deg, buffer_m)
            for deg in (0, 90, 180, 270)
        ]
        return [[round(c["lat"], 6), round(c["lon"], 6)] for c in ring]

    left: list[dict] = []
    right: list[dict] = []
    for i in range(len(track_slice)):
        prev = track_slice[i - 1] if i > 0 else track_slice[i]
        nxt = track_slice[i + 1] if i < len(track_slice) - 1 else track_slice[i]
        brg = _bearing_deg(prev, nxt)
        p = track_slice[i]
        left.append(_destination_point(p["lat"], p["lon"], brg - 90, buffer_m))
        right.append(_destination_point(p["lat"], p["lon"], brg + 90, buffer_m))
    ring_coords = left + right[::-1]
    if len(ring_coords) < 3:
        return None
    return [[round(c["lat"], 6), round(c["lon"], 6)] for c in ring_coords]


def build_hsr_corridor_bins(kml_path: Path = KML_PATH, bin_km: int = CORRIDOR_BIN_KM) -> dict:
    """2 km corridor bins from KML centerline + lateral buffer (closed polygons)."""
    north = STATION_BY_NAME["南港"]
    south = STATION_BY_NAME["左營"]
    axis_m = haversine_m(north["lat"], north["lon"], south["lat"], south["lon"])
    s0 = chainage_score_point(north["lat"], north["lon"], north, south)
    s1 = chainage_score_point(south["lat"], south["lon"], north, south)

    def dist_m(p: dict) -> float:
        score = chainage_score_point(p["lat"], p["lon"], north, south)
        t = (score - s0) / (s1 - s0) if s1 != s0 else 0.0
        return max(0.0, min(axis_m, t * axis_m))

    ring = _parse_kml_ring(kml_path)
    track = _build_centerline_track(ring, dist_m, axis_m)

    station_km: dict[str, float] = {}
    for name in HSR_GEO_CHAIN:
        st = STATION_BY_NAME[name]
        station_km[name] = round(dist_m(st) / 1000, 2)

    region_km: dict[str, dict] = {}
    for rid, (start_name, end_name) in MDT_REGION_SPAN.items():
        region_km[rid] = {
            "km_start": min(station_km[start_name], station_km[end_name]),
            "km_end": max(station_km[start_name], station_km[end_name]),
            "start_station": start_name,
            "end_station": end_name,
        }

    bins: list[dict] = []
    for km in range(0, int(axis_m / 1000) + 1, bin_km):
        d0 = km * 1000
        d1 = (km + bin_km) * 1000
        slice_pts = [p for p in track if p["dist_m"] >= d0 and p["dist_m"] < d1]
        if len(slice_pts) < 2:
            mid = (d0 + d1) / 2
            nearest = min(track, key=lambda p: abs(p["dist_m"] - mid))
            slice_pts = [nearest]
        poly = _build_buffer_polygon(slice_pts)
        if not poly or len(poly) < 3:
            continue
        bins.append({"km_start": km, "km_end": km + bin_km, "polygon": poly})

    return {
        "source_kml": str(kml_path),
        "bin_km": bin_km,
        "buffer_m": 350,
        "axis_length_m": round(axis_m),
        "axis_length_km": round(axis_m / 1000, 1),
        "north": {"lat": north["lat"], "lon": north["lon"]},
        "south": {"lat": south["lat"], "lon": south["lon"]},
        "station_km": station_km,
        "region_km": region_km,
        "bins": bins,
    }


def build_comparisons(mdt_sets: list[dict]) -> list[dict]:
    groups: dict[tuple, list[dict]] = {}
    for ds in mdt_sets:
        key = (ds["segment_id"], ds["operator"], ds.get("layer", ""), ds["tech"])
        groups.setdefault(key, []).append(ds)

    comparisons = []
    for (seg, op, layer, tech), items in groups.items():
        if len(items) < 2:
            continue
        items = sorted(items, key=lambda x: x["date"])
        old, new = items[0], items[-1]
        old_r = old["stats"].get("mean")
        new_r = new["stats"].get("mean")
        delta_r = round(new_r - old_r, 2) if old_r is not None and new_r is not None else None
        comp = {
            "segment_id": seg,
            "operator": op,
            "layer": layer,
            "tech": tech,
            "dates": [old["date"], new["date"]],
            "date_labels": [old["date_label"], new["date_label"]],
            "metrics": {
                old["date"]: {
                    "avg_rsrp": old["stats"].get("mean"),
                    "weak_pct": old.get("weak_pct"),
                    "avg_sinr": (old["kpi"].get("nr_sinr") or {}).get("mean"),
                    "avg_tput_dl": (old["kpi"].get("nr_tput_dl_kbps") or {}).get("mean"),
                },
                new["date"]: {
                    "avg_rsrp": new["stats"].get("mean"),
                    "weak_pct": new.get("weak_pct"),
                    "avg_sinr": (new["kpi"].get("nr_sinr") or {}).get("mean"),
                    "avg_tput_dl": (new["kpi"].get("nr_tput_dl_kbps") or {}).get("mean"),
                },
            },
            "delta": {
                "avg_rsrp": delta_r,
                "weak_pct": round(new.get("weak_pct", 0) - old.get("weak_pct", 0), 1),
            },
            "trend": "improved" if delta_r and delta_r > 0 else "declined" if delta_r and delta_r < 0 else "stable",
        }
        comparisons.append(comp)
    return comparisons


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    dt_routes = [process_cht_dt_full(m) for m in CHT_DT_ROUTES]
    interval_lookup = build_interval_lookup(dt_routes)
    total_pairs, missing = validate_interval_lookup(interval_lookup)

    mdt_sets: list[dict] = []
    for seg in MDT_SEGMENTS:
        folder = MDT_BASE / seg["folder"]
        for date in MDT_DATES:
            for operator in MDT_IF_OPERATORS:
                ds = process_ifmdt_mdt(seg["id"], folder, date, operator)
                if ds:
                    ds["segment_name"] = seg["name"]
                    mdt_sets.append(ds)
            for layer, info in MDT_LAYERS.items():
                twm = process_twm_mdt(seg["id"], folder, date, layer, info["tech"])
                if twm:
                    twm["segment_name"] = seg["name"]
                    mdt_sets.append(twm)

    comparisons = build_comparisons(mdt_sets)
    corridor = build_hsr_corridor_bins()
    mdt_station_segments = build_mdt_station_segments()

    manifest = {
        "version": 3,
        "generated_from": str(DT_BASE),
        "mdt_source": str(MDT_BASE),
        "mdt_operators": ["TWM"] + MDT_IF_OPERATORS,
        "stations": STATIONS,
        "route_lookup": {f"{a}|{b}|{c}": rid for (a, b, c), rid in ROUTE_LOOKUP.items()},
        "interval_lookup": interval_lookup,
        "mdt_segments": MDT_SEGMENTS,
        "mdt_station_segments": mdt_station_segments,
        "mdt_region_span": {k: {"start": v[0], "end": v[1]} for k, v in MDT_REGION_SPAN.items()},
        "mdt_region_chain_idx": MDT_REGION_CHAIN_IDX,
        "mdt_layers": MDT_LAYERS,
        "mdt_dates": MDT_DATES,
        "hsr_corridor_source": str(KML_PATH),
        "dt_routes": [{"id": r["id"], "name": r["name"], "direction": r["direction"], "scope": r["scope"], "test_date": r["test_date"], "stats": r["stats"], "weak_pct": r["weak_pct"]} for r in dt_routes],
        "mdt_datasets": [{"id": d["id"], "segment_id": d["segment_id"], "segment_name": d.get("segment_name"), "operator": d["operator"], "layer": d.get("layer"), "tech": d["tech"], "date": d["date"], "date_label": d["date_label"], "stats": d["stats"], "weak_pct": d["weak_pct"], "kpi": d["kpi"]} for d in mdt_sets],
    }

    with open(OUT / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    dt_payload = {"routes": dt_routes}
    with open(OUT / "dt_routes.json", "w", encoding="utf-8") as f:
        json.dump(dt_payload, f, ensure_ascii=False)

    with open(OUT / "mdt_data.json", "w", encoding="utf-8") as f:
        json.dump({"datasets": mdt_sets}, f, ensure_ascii=False)

    with open(OUT / "compare.json", "w", encoding="utf-8") as f:
        json.dump({"comparisons": comparisons, "note": "MDT 歷次比較（2026/01/12 vs 2026/03/16）"}, f, ensure_ascii=False, indent=2)

    with open(OUT / "hsr_corridor.json", "w", encoding="utf-8") as f:
        json.dump(corridor, f, ensure_ascii=False)

    # backward compat
    with open(OUT / "routes.json", "w", encoding="utf-8") as f:
        json.dump(
            {
                "generated_from": str(BASE),
                "stations": STATIONS,
                "route_lookup": manifest["route_lookup"],
                "routes": dt_routes,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"manifest.json  ({(OUT / 'manifest.json').stat().st_size // 1024} KB)")
    print(f"dt_routes.json ({(OUT / 'dt_routes.json').stat().st_size // 1024} KB, {len(dt_routes)} routes)")
    print(f"mdt_data.json  ({(OUT / 'mdt_data.json').stat().st_size // 1024} KB, {len(mdt_sets)} datasets)")
    print(f"compare.json   ({len(comparisons)} comparisons)")
    print(f"hsr_corridor.json ({len(corridor['bins'])} bins, {corridor['axis_length_km']} km)")
    print(f"interval_lookup: {len(interval_lookup)}/{total_pairs} station pairs OK")
    if missing:
        print(f"  WARNING missing {len(missing)} pairs: {missing[:5]}...")


if __name__ == "__main__":
    main()
