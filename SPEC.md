# SPIDER — AI Agent Observability Workspace
## Spesifikasi (mengikuti brief arsitektur)

**Nama:** SPIDER
**Arah:** Opsi A — lanjutkan crawler cards + disiplin brief (dokumentasi, testing, keamanan)
**Agent:** Single (Muse)
**Status:** Tahap B (Spesifikasi) → H (Pengujian) → I (Dokumentasi)

---

## 1. Tujuan
Mengamati aktivitas AI agent (Muse) secara visual dan realtime melalui antarmuka web.
Bukan sekadar log teks — aktivitas divisualisasikan sebagai kartu-kartu crawler
dengan network graph yang tumbuh, meniru referensi video yang disetujui pengguna.

## 2. Arsitektur

```
Muse tool calls
  → agent.context_items (database internal)
  → observer (subagent, poll ~3s)
  → action_bridge.py (mapping tool→node, filter SYSTEM)
  → POST /event → Cloudflare Worker (spider-realtime-poc)
  → Durable Object (SpiderRealtimeRoom)
  → WebSocket → browser
  → fallback: state.json (poll 7s via GitHub Pages)
```

### Kontrak event
| Field | Wajib | Keterangan |
|---|---|---|
| `event_type` | Ya | TOOL_STARTED, TOOL_COMPLETED, TOOL_FAILED, TASK_STARTED, TASK_COMPLETED |
| `tool` | Ya | Nama tool (mis. `exec`, `browser.search`) |
| `node` | Tidak | Kategori aktivitas; bila kosong/UNKNOWN, frontend petakan dari tool |
| `event_id` | Ya | Untuk deduplikasi |
| `timestamp` | Ya | ISO 8601 |
| `success` | Tidak | Untuk TOOL_COMPLETED/FAILED |

### Pemetaan tool → node (12 kategori)
SEARCH, COLLECT, PROCESS, ANALYZE, RESULT, COMPLETE,
TASK, VERIFY, CONNECT, ERROR, UNKNOWN + SYSTEM (difilter, tidak divisualkan)

Aktivitas tak dikenal → UNKNOWN (fallback transparan, tidak dipaksakan ke kategori salah).

## 3. Visualisasi

### Stats bar (atas)
TOOLS | NODES | EVENTS | KEPT | SKIPPED — angka realtime.

### Kartu crawler (tengah)
- Setiap TOOL_STARTED (yang lolos filter) = 1 kartu.
- Kartu berisi: nama tool, node (badge warna), timestamp, network graph mini yang tumbuh (±8-13 node, 2 detik), crawler bot (titik putih) yang bergerak antar node.
- Status: CRAWLING → DONE / FAILED.
- Maksimal 6 kartu; yang lama keluar dengan animasi.

### JEV bar (bawah)
"is this tool worth visualizing?" + counter KEPT / SKIPPED.
Brain menilai setiap tool: SYSTEM (`db`, `muse.db`) → SKIPPED, sisanya → KEPT.

## 4. Realtime & fallback

| Kondisi | Status tampil | Visual |
|---|---|---|
| WebSocket terbuka + event < 60s | LIVE | Hijau |
| WebSocket terbuka, event > 60s | STALE | Kuning (data tidak segar) |
| WebSocket gagal | FALLBACK | Polling state.json 7s |
| Keduanya gagal | DISCONNECTED | Merah |

Koneksi transport ≠ aktivitas agent. Badge terpisah untuk masing-masing.

## 5. Keamanan

- Secret bridge (`SPIDER_BRIDGE_SECRET`) hanya di Worker env + file lokal. Tidak di repo, tidak di frontend.
- Frontend tidak menerima/menampilkan: prompt, respons lengkap, argumen tool, kredensial. Hanya metadata (nama tool, node, timestamp, status).
- `state.json` publik via GitHub Pages — hanya berisi metadata yang sama.
- Tidak ada kontrol terhadap agent dari frontend (observasi saja, bukan orkestrasi).

## 6. Keterbatasan (jujur)

- Latensi ~10-16 detik (observer berbasis subagent/LLM, bukan stream langsung).
- Single agent. Multi-agent belum didukung (di luar ruang lingkup).
- Network graph per kartu adalah representasi artistik proses crawling, bukan data aktual isi tool.
- Riwayat visual hanya selama halaman aktif (tidak ada database riwayat).
- `prefers-reduced-motion` didukung (animasi disederhanakan).

## 7. Pengujian

- [x] Sintaks JS (node --check)
- [x] Keseimbangan CSS
- [x] Mapping tool→node (Python + JS konsisten)
- [ ] Visual di desktop Chrome (QA pengguna)
- [ ] Visual di HP Android (QA pengguna)
- [ ] Skenario LIVE → STALE → FALLBACK → DISCONNECTED
- [ ] Kartu maksimal 6 (overflow)
- [ ] Reduced motion

## 8. File

| File | Peran |
|---|---|
| `index.html` | Struktur: stats bar, card grid, JEV bar |
| `style.css` | Tema: kartu, stats, JEV, responsif |
| `app.js` | Pipeline event + rendering kartu + network |
| `assets/space-bg.jpg` | Background nebula |

---
*Dokumen ini mengikuti brief "AI Agent Observability Workspace" Section 11 tahap B.*
*Diperbarui: 9 Oktober 2026.*
