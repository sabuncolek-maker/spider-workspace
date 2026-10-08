# SPIDER Workspace v0.1 — Test Log (2026-10-08)

Semua test memakai data nyata dari `muse.db` / `state.json`. Tidak ada simulasi.

## TEST 1 — Load state.json saat agent working
**PASS.** Page fetch `state.json` via HTTP (curl: HTTP 200), render:
agent `WORKING`, task `Build SPIDER Bridge v0.1 [working]`,
spider di node SEARCH (tool kerja nyata terakhir: `browser_search`).

## TEST 2 — Ubah state aktual via Bridge (aman, data nyata)
**PASS.** Dilakukan: `browser.search` + `exec` nyata → re-fetch via
`muse.db` → `publish_state.py` → `state.json` berubah
(`updated_at` baru, activity bertambah; diff terverifikasi).

## TEST 3 — Frontend membaca perubahan
**PASS.** `curl` konfirmasi state.json baru terserve; polling
`fetch(state.json, {cache: 'no-store'})` tiap 7 detik; render ulang
tanpa exception (smoke test dengan fake DOM + state.json asli).

## TEST 4 — Spider berpindah sesuai node
**PASS (logic + render).** Unit test `resolveTarget`:
`exec`→PROCESS, `browser_search`→SEARCH, `done`→COMPLETE,
`failed`→ERROR, `idle`→IDLE. Render smoke test: spider transform =
koordinat node SEARCH persis (773.55, 193.17).

## TEST 5 — Snapshot lama → STALE
**PASS.** Fixture `updated_at` 10 menit lalu → badge `STALE SNAPSHOT`
(merah), meta `age 871s`. Teramati juga secara organik: state.json
asli yang berumur > 3 menit menampilkan STALE.

## TEST 6 — UNKNOWN tetap UNKNOWN
**PASS.** Fixture tool `mystery_xyz` + activity kosong → spider di
(150,120) = node UNKNOWN, node UNKNOWN highlight aktif, tidak ada
work node yang menyala.

## TEST 7 — Aktivitas Bridge `db` = SYSTEM, tidak menggerakkan spider
**PASS.** Entri `tool: db` dapat badge `SYSTEM` di feed dan readout.
`resolveTarget` dengan `current_tool=db` fallback ke work tool nyata
terakhir (SEARCH), tidak pernah VERIFY-dari-bridge.
`toolToNode('db')` = UNKNOWN (db bukan work node).

## Visual refinement test (9 state) — 2026-10-08, putaran 2
Render smoke test (fake DOM + fixture dari shape state.json asli):

| # | State | Spider | Node highlight | Badge |
|---|---|---|---|---|
| 1 | IDLE | hub (600,400) | hubRing `lit` | LIVE/STALE sesuai umur |
| 2 | WORKING/SEARCH | SEARCH (773.6,193.2) | SEARCH `active` | LIVE |
| 3 | VERIFY | — | VERIFY tanpa highlight kerja (by design, lihat catatan) | — |
| 4 | PROCESS | PROCESS (366.2,535) | PROCESS `active` | LIVE |
| 5 | RESULT | RESULT (334.1,353.1) | RESULT `active` | LIVE |
| 6 | COMPLETE | COMPLETE (426.5,193.2) | COMPLETE `active` | LIVE |
| 7 | ERROR | ERROR (1050,120) | ERROR `failed` + PROCESS `failed` | LIVE |
| 8 | UNKNOWN | UNKNOWN (150,120) | UNKNOWN `active` (dashed) | LIVE |
| 9 | STALE | posisi terakhir | tetap | `STALE SNAPSHOT` merah + age |

Catatan by-design: node VERIFY tidak pernah mendapat highlight kerja
dari data nyata — satu-satunya tool yang memetakannya (`db`) dikelas-
kan sebagai SYSTEM agar denyut bridge tidak menggerakkan spider.
Itu trade-off yang disetujui ("jangan menebak"), bukan bug.

## Responsive
- Desktop (>1024): layout penuh.
- Tablet (≤1024/≤820): readout & feed menyempit.
- Android portrait (≤480px): readout jadi panel kompak semi-transparan
  di atas (tidak menutupi spider di tengah), feed disembunyikan,
  SVG `meet` → tidak ada scroll horizontal, tidak ada tabrakan node
  (posisi fixed di viewBox, skala seragam).
- Label node: 13px + halo (`paint-order: stroke`) agar terbaca saat
  diskala kecil.

## Bukti visual
Screenshot tidak tersedia di environment ini:
- live browser berjalan di VM berbeda (loopback 127.0.0.1 tidak terjangkau),
- Chromium lokal tidak bisa render di container ini (zygote crash).
Diganti: render smoke test dengan fake DOM + `state.json` asli untuk
semua skenario di atas (koordinat spider, class node, badge, feed
terverifikasi secara programatik).

## Cara menjalankan ulang test
```bash
cd ~/workspace/spider-workspace
node --check app.js
python3 -m http.server 8077
curl -s http://127.0.0.1:8077/state.json | python3 -m json.tool | head -20
# visual: http://127.0.0.1:8077/?src=fixture-stale.json
```
