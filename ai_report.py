# -*- coding: utf-8 -*-
"""高鐵 RF 站間優化報告 + 競業分析 — AI 生成器 (PoC)。

讀取本專案 data/ 下既有的資料（與前端網頁同一份）：
    data/manifest.json    站點、區段、日期
    data/dt_routes.json   路測 DT 路線（含 stats / kpi / points）
    data/mdt_data.json    MDT 資料集（本網 / 競業，含 max_rsrp）

產出一份可交付的 Markdown 報告：
    1. 路測 DT 全線健診（平均/最差 RSRP、弱訊比例、5G KPI、弱訊熱點區段）
    2. MDT 異業者競爭分析（本網 vs 競業 的 Max RSRP，交集勝率與平均差）
    3. 優化建議與優先序

特色：
    - 零金鑰也能跑：未設定 LLM 金鑰時，用內建範本產生規則式報告。
    - 有金鑰時：把計算好的「事實 (facts)」餵給 LLM，產生主管可讀的敘事與建議。

用法：
    python ai_report.py                      # 產生全部（DT + MDT）報告
    python ai_report.py --date 20260112      # 指定 MDT 比較日期
    python ai_report.py --out my_report.md   # 指定輸出檔名

環境變數（與系統 B 相同，可共用）：
    AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_TIMEOUT
"""

import argparse
import datetime as dt
import json
import os
import sys

try:  # Windows 主控台預設 cp1252，改為 UTF-8 以正常輸出中文
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

try:
    import requests
except ImportError:  # requests 為選用（僅 LLM 模式需要）
    requests = None

try:  # 自 .env 載入金鑰等設定
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
except Exception:  # noqa: BLE001
    pass

_BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_BASE, "data")
REPORT_DIR = os.path.join(_BASE, "reports")

WEAK_THRESHOLD = -105          # 弱訊門檻 (dBm)
HOME_OP = "本網業者"
HOME_4G_LAYERS = ["L7", "L9", "L18", "L21", "L26"]
MDT_CELL_DEG = 0.001           # 約 110m 網格，用於本網/競業同位置交集

AI_API_KEY = os.environ.get("AI_API_KEY", "") or os.environ.get("OPENAI_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
AI_MODEL = os.environ.get("AI_MODEL", "gpt-4o-mini")
AI_TIMEOUT = float(os.environ.get("AI_TIMEOUT", "30"))


# ----------------------------------------------------------------------------
# 載入資料
# ----------------------------------------------------------------------------
def load_json(name):
    with open(os.path.join(DATA_DIR, name), "r", encoding="utf-8") as f:
        return json.load(f)


def quality_label(mean):
    if mean is None:
        return "—"
    if mean >= -85:
        return "優良"
    if mean >= -95:
        return "良好"
    if mean >= -105:
        return "普通"
    if mean >= -115:
        return "較弱"
    return "微弱"


# ----------------------------------------------------------------------------
# 計算：弱訊熱點區段（移植自前端 computeWeakZones）
# ----------------------------------------------------------------------------
def compute_weak_zones(points, bin_km=2, threshold=WEAK_THRESHOLD, top=8):
    bins = {}
    for p in points:
        d = p.get("dist_m")
        rsrp = p.get("rsrp")
        if d is None or rsrp is None:
            continue
        km = int(d // 1000 // bin_km) * bin_km
        b = bins.setdefault(km, {"rsrps": [], "lats": [], "lons": []})
        b["rsrps"].append(rsrp)
        b["lats"].append(p["lat"])
        b["lons"].append(p["lon"])
    zones = []
    for km, b in bins.items():
        n = len(b["rsrps"])
        if not n:
            continue
        avg = round(sum(b["rsrps"]) / n, 1)
        if avg <= threshold:
            zones.append({
                "km_start": km, "km_end": km + bin_km,
                "avg_rsrp": avg, "min_rsrp": round(min(b["rsrps"]), 1), "samples": n,
            })
    zones.sort(key=lambda z: z["avg_rsrp"])
    return zones[:top]


# ----------------------------------------------------------------------------
# 計算：本網/競業 Max RSRP 交集比較（移植自前端 binPointsByCell + comparison）
# ----------------------------------------------------------------------------
def bin_cells_max(points):
    """以 ~110m 網格聚合，取每格 max_rsrp 的最大值。"""
    cells = {}
    for p in points:
        v = p.get("max_rsrp")
        if v is None:
            v = p.get("rsrp")
        if v is None:
            continue
        key = (round(p["lat"] / MDT_CELL_DEG), round(p["lon"] / MDT_CELL_DEG))
        cur = cells.get(key)
        if cur is None or v > cur:
            cells[key] = v
    return cells


def home_max_cells(datasets, segment_id, date):
    """本網業者：跨 5 個頻段層取每格 Max RSRP 最大值。"""
    cells = {}
    for d in datasets:
        if (d.get("operator") == HOME_OP and d.get("segment_id") == segment_id
                and d.get("date") == date and d.get("layer") in HOME_4G_LAYERS):
            for k, v in bin_cells_max(d.get("points", [])).items():
                if k not in cells or v > cells[k]:
                    cells[k] = v
    return cells


def competitor_max_cells(datasets, op, segment_id, date):
    for d in datasets:
        if (d.get("operator") == op and d.get("segment_id") == segment_id
                and d.get("date") == date and d.get("layer") == "ifMDT"):
            return bin_cells_max(d.get("points", []))
    return {}


def compare_cells(home, comp):
    """回傳交集統計：交集格數、平均差(本網-競業)、本網勝率%。"""
    inter = [(home[k], comp[k]) for k in home.keys() & comp.keys()]
    n = len(inter)
    if not n:
        return None
    deltas = [round(a - b, 1) for a, b in inter]
    win = sum(1 for d in deltas if d >= 0)
    return {
        "cells": n,
        "avg_delta": round(sum(deltas) / n, 1),
        "win_pct": round(win / n * 1000) / 10,
        "home_avg": round(sum(a for a, _ in inter) / n, 1),
        "comp_avg": round(sum(b for _, b in inter) / n, 1),
    }


# ----------------------------------------------------------------------------
# 蒐集事實 (facts)
# ----------------------------------------------------------------------------
def gather_facts(manifest, dt_data, mdt_data, mdt_date=None):
    dates = manifest.get("mdt_dates", [])
    mdt_date = mdt_date or (dates[-1] if dates else None)
    operators = manifest.get("mdt_operators", [HOME_OP])
    competitors = [op for op in operators if op != HOME_OP]
    segment_ids = sorted({d.get("segment_id") for d in mdt_data.get("datasets", [])
                          if d.get("segment_id")})

    # --- DT 全線健診 ---
    dt_routes = []
    for r in dt_data.get("routes", []):
        if r.get("scope") != "full":
            continue
        stats = r.get("stats") or {}
        bin_km = 3 if r.get("scope") == "full" else 2
        weak_zones = compute_weak_zones(r.get("points", []), bin_km=bin_km)
        kpi = r.get("kpi") or {}
        nr = kpi.get("nr_rsrp") or {}
        dt_routes.append({
            "name": r.get("name"),
            "operator": r.get("operator"),
            "direction": r.get("direction"),
            "test_date": r.get("test_date"),
            "avg_rsrp": stats.get("mean"),
            "min_rsrp": stats.get("minimum"),
            "samples": stats.get("count"),
            "weak_pct": r.get("weak_pct"),
            "quality": quality_label(stats.get("mean")),
            "nr_rsrp_mean": nr.get("mean"),
            "nr_sinr_mean": (kpi.get("nr_sinr") or {}).get("mean"),
            "weak_zones": weak_zones,
        })

    # --- MDT 競業比較 ---
    comparisons = []
    for seg in segment_ids:
        home = home_max_cells(mdt_data["datasets"], seg, mdt_date)
        if not home:
            continue
        for op in competitors:
            comp = competitor_max_cells(mdt_data["datasets"], op, seg, mdt_date)
            res = compare_cells(home, comp)
            if res:
                res.update({"segment_id": seg, "competitor": op})
                comparisons.append(res)

    return {
        "generated_at": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "mdt_date": mdt_date,
        "home_operator": HOME_OP,
        "competitors": competitors,
        "weak_threshold": WEAK_THRESHOLD,
        "dt_routes": dt_routes,
        "mdt_comparisons": comparisons,
    }


# ----------------------------------------------------------------------------
# 規則式報告（無金鑰 fallback）
# ----------------------------------------------------------------------------
def render_markdown_rule(facts):
    L = []
    L.append("# 高鐵 RF 站間優化報告（自動產生）")
    L.append("")
    L.append(f"- 產生時間：{facts['generated_at']}")
    L.append(f"- 本網業者：{facts['home_operator']}　·　競業：{', '.join(facts['competitors']) or '—'}")
    L.append(f"- MDT 比較日期：{facts['mdt_date']}　·　弱訊門檻：{facts['weak_threshold']} dBm")
    L.append("")

    # 1. DT 全線健診
    L.append("## 1. 路測 DT 全線健診")
    L.append("")
    L.append("| 路線 | 業者 | 方向 | 路測日期 | 4G 平均 RSRP | 最差 RSRP | 弱訊比例 | 評級 | 5G 平均 RSRP |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for r in facts["dt_routes"]:
        L.append("| {name} | {op} | {dir} | {date} | {avg} | {mn} | {wp}% | {q} | {nr} |".format(
            name=r["name"], op=r["operator"], dir=r["direction"], date=r["test_date"],
            avg=_fmt(r["avg_rsrp"]), mn=_fmt(r["min_rsrp"]), wp=_fmt(r["weak_pct"]),
            q=r["quality"], nr=_fmt(r["nr_rsrp_mean"])))
    L.append("")

    # 弱訊熱點
    L.append("### 弱訊熱點區段（依平均 RSRP 由差至佳）")
    L.append("")
    any_weak = False
    for r in facts["dt_routes"]:
        if not r["weak_zones"]:
            continue
        any_weak = True
        L.append(f"**{r['name']}（{r['direction']}）**")
        for z in r["weak_zones"]:
            L.append(f"- km {z['km_start']}–{z['km_end']}：平均 {z['avg_rsrp']} dBm、"
                     f"最低 {z['min_rsrp']} dBm（{z['samples']} 筆樣本）")
        L.append("")
    if not any_weak:
        L.append("- 各全線路測於目前門檻下無明顯弱訊熱點。")
        L.append("")

    # 2. MDT 競業分析
    L.append("## 2. MDT 異業者競爭分析（Max RSRP）")
    L.append("")
    if facts["mdt_comparisons"]:
        L.append("| 區段 | 競業 | 交集格數 | 本網平均 | 競業平均 | 平均差(本網−競業) | 本網勝率 |")
        L.append("|---|---|---|---|---|---|---|")
        for c in facts["mdt_comparisons"]:
            lead = "領先" if c["avg_delta"] > 0 else ("落後" if c["avg_delta"] < 0 else "持平")
            L.append("| {seg} | {op} | {n} | {ha} | {ca} | {d} dBm（{lead}） | {w}% |".format(
                seg=c["segment_id"], op=c["competitor"], n=c["cells"],
                ha=c["home_avg"], ca=c["comp_avg"], d=("+" if c["avg_delta"] > 0 else "") + str(c["avg_delta"]),
                lead=lead, w=c["win_pct"]))
        L.append("")
    else:
        L.append("- 此日期無可比較的本網/競業交集資料。")
        L.append("")

    # 3. 建議
    L.append("## 3. 優化建議與優先序")
    L.append("")
    L.extend(_rule_recommendations(facts))
    L.append("")
    L.append("> 註：本報告由 data/ 既有量測資料自動彙整，為路測/MDT 參考值，非即時狀態。")
    return "\n".join(L)


def _rule_recommendations(facts):
    recs = []
    # 依弱訊熱點數排序路線
    ranked = sorted(facts["dt_routes"], key=lambda r: -(len(r["weak_zones"])))
    worst = [r for r in ranked if r["weak_zones"]][:3]
    for i, r in enumerate(worst, 1):
        z = r["weak_zones"][0]
        recs.append(f"{i}. **{r['name']}**：共 {len(r['weak_zones'])} 個弱訊熱點，"
                    f"最弱位於 km {z['km_start']}–{z['km_end']}（平均 {z['avg_rsrp']} dBm）。"
                    f"建議優先勘查該區段是否覆蓋不足，評估補點 / 調整天線下傾或方位角。")
    # 競業落後區段
    behind = [c for c in facts["mdt_comparisons"] if c["avg_delta"] < 0]
    behind.sort(key=lambda c: c["avg_delta"])
    for c in behind[:3]:
        recs.append(f"- **{c['segment_id']} vs {c['competitor']}**：本網平均落後 "
                    f"{abs(c['avg_delta'])} dBm、勝率僅 {c['win_pct']}%，建議列為競爭力改善重點區段。")
    if not recs:
        recs.append("- 目前各路線與競業比較表現良好，建議維持並持續監測。")
    return recs


def _fmt(v):
    return "—" if v is None else v


# ----------------------------------------------------------------------------
# LLM 報告（有金鑰時）：把 facts 餵給模型，產生主管可讀的敘事
# ----------------------------------------------------------------------------
def render_markdown_llm(facts):
    if not (AI_API_KEY and requests):
        return None
    sys = ("你是一位資深無線網路 (RAN) 優化顧問。根據提供的高鐵路測(DT)與 MDT 競業比較『事實 JSON』，"
           "撰寫一份給電信營運主管的繁體中文優化報告（Markdown）。"
           "需包含：(1) 重點摘要 (3-5 點)；(2) 路測 DT 健診重點與弱訊熱點解讀；"
           "(3) 與競業的競爭力分析（哪些區段領先/落後）；(4) 帶優先序的具體優化建議"
           "（區分覆蓋不足/干擾/容量，並指出建議動作如補點、調整天線、加站）。"
           "用詞專業精簡，數據請引用 JSON 內的數值，不要捏造數據。")
    user = "事實 JSON：\n```json\n" + json.dumps(facts, ensure_ascii=False) + "\n```\n請輸出完整 Markdown 報告。"
    try:
        resp = requests.post(
            f"{AI_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {AI_API_KEY}", "Content-Type": "application/json"},
            json={"model": AI_MODEL, "temperature": 0.4,
                  "messages": [{"role": "system", "content": sys},
                               {"role": "user", "content": user}]},
            timeout=AI_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:  # noqa: BLE001
        print(f"[ai_report] LLM 失敗，改用規則式範本：{e}")
        return None


# ----------------------------------------------------------------------------
# 主程式
# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="高鐵 RF 站間優化報告 AI 生成器")
    ap.add_argument("--date", help="MDT 比較日期 (YYYYMMDD)，預設為最新")
    ap.add_argument("--out", help="輸出 Markdown 檔名")
    ap.add_argument("--json", action="store_true", help="同時輸出 facts JSON")
    args = ap.parse_args()

    manifest = load_json("manifest.json")
    dt_data = load_json("dt_routes.json")
    mdt_data = load_json("mdt_data.json")

    facts = gather_facts(manifest, dt_data, mdt_data, args.date)

    mode = "ai" if (AI_API_KEY and requests) else "rule"
    md = render_markdown_llm(facts) if mode == "ai" else None
    if md is None:
        mode = "rule"
        md = render_markdown_rule(facts)

    os.makedirs(REPORT_DIR, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d_%H%M")
    out = args.out or os.path.join(REPORT_DIR, f"HSR_RF_Report_{facts['mdt_date']}_{stamp}.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[完成] 模式={mode}　報告已輸出：{out}")

    if args.json:
        jpath = os.path.splitext(out)[0] + "_facts.json"
        with open(jpath, "w", encoding="utf-8") as f:
            json.dump(facts, f, ensure_ascii=False, indent=2)
        print(f"[完成] facts JSON：{jpath}")


if __name__ == "__main__":
    main()
