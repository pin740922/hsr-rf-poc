# 高鐵 RF 站間優化報告 — AI 生成器 (`ai_report.py`)

讀取本專案 `data/` 既有資料（與網頁同一份），自動產生一份可交付的
**站間 RF 優化報告 + 競業分析** Markdown。

## 報告內容

1. **路測 DT 全線健診**：各全線平均/最差 RSRP、弱訊比例、5G KPI、弱訊熱點區段。
2. **MDT 異業者競爭分析**：本網 vs 競業的 Max RSRP，依 ~110m 網格交集計算
   平均差與勝率（移植自前端 `binPointsByCell` 比較邏輯）。
3. **優化建議與優先序**：依弱訊熱點數與競業落後幅度排序，給出可執行建議。

## 用法

```powershell
cd hsr-rf-poc
python ai_report.py                 # 產生最新日期的報告 -> reports/
python ai_report.py --date 20260112 # 指定 MDT 比較日期
python ai_report.py --json          # 同時輸出 facts JSON（給其他工具或前端用）
python ai_report.py --out my.md     # 指定輸出檔名
```

## 兩種模式

- **規則式（預設、零金鑰）**：未設定 `AI_API_KEY` 時，用內建範本產生報告，馬上能看效果。
- **LLM（選用）**：設定金鑰後，把計算好的「事實 JSON」餵給模型，產生主管可讀的敘事與深度建議。

```powershell
$env:AI_API_KEY="sk-..."
$env:AI_MODEL="gpt-4o-mini"
python ai_report.py
```

設定可參考 `.env.example`（支援 OpenAI / Azure / Gemini 相容端點 / 本地 Ollama）。

## 與網頁整合的下一步（選用）

本系統為純前端（GitHub Pages，無後端）。若要在網頁上直接按鈕生成 AI 報告，
可把 `gather_facts()` 的邏輯改寫為前端 JS（資料已在瀏覽器中），再將 facts 傳給
一個小型 AI 代理端點（例如沿用系統 B 的 Flask 後端）以保護金鑰。
目前的 `ai_report.py` 已可獨立產出報告，適合工程/營運團隊離線批次使用。
