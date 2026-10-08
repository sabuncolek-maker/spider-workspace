# SPIDER Workspace v0.1

Visual telemetry untuk aktivitas agent Muse. Membaca `state.json`
dari SPIDER Bridge — **tidak ada data simulasi, tidak ada gerakan random**.

## Menjalankan lokal

```bash
cd ~/workspace/spider-workspace
ln -sf ../spider/state.json state.json   # sekali saja
python3 -m http.server 8077
# buka http://127.0.0.1:8077
```

> `fetch()` tidak bisa membaca file via `file://` di sebagian browser,
> jadi harus diserve lewat HTTP lokal. Polling frontend tidak mengubah state.

Untuk testing dengan fixture: `http://127.0.0.1:8077/?src=fixture-stale.json`

## Cara frontend membaca state.json

- Polling `GET state.json` tiap 7 detik (`cache: no-store`).
- `updated_at` vs jam browser → umur snapshot; > 3 menit → `STALE SNAPSHOT`.
- Spider hanya berpindah jika state berubah; jika tidak, tetap di posisi terakhir.

## Mapping state → node

| state | node |
|---|---|
| task.status `done` | COMPLETE |
| task.status `failed` / failed_nodes terisi | ERROR |
| agent `idle` / tanpa task aktif | IDLE (hub tengah) |
| `execution.current_tool === "db"` | **tahan posisi** (denyut SYSTEM, bukan kerja) |
| `workflow.active_node` valid | node tersebut |
| tidak dapat ditentukan | UNKNOWN (tidak ditebak) |

`completed_nodes` → node berstatus done (cincin hijau redup).
Node aktif → cincin emas + glow tipis. Node error → cincin merah.

## Observer effect

Tool `db` adalah tool yang dipakai Bridge/publisher untuk membaca
`muse.db` — juga kadang dipakai agent untuk verifikasi. Karena sumbernya
tidak dapat dibedakan secara aman:

- semua aktivitas `tool: db` diberi badge **SYSTEM** di feed,
- spider **tidak berpindah** hanya karena snapshot berisi `db`,
- posisi ditahan di node kerja terakhir yang valid.

Informasi tidak hilang (tetap tampil di feed), hanya gerakan spider
yang ditahan — sesuai prinsip "jangan menebak".

## Stale snapshot

`STALE_MS = 180000` (3 menit). Jika `Date.now() - updated_at` melebihi itu,
badge berubah menjadi `STALE SNAPSHOT` (merah). Spider tetap di posisi
terakhir — tidak direset, tidak ditebak.

## Yang belum dapat dimonitor

- `task.progress` (null dari bridge — tidak ada di DB)
- `tool_status` real (kolom `success` sering null di DB)
- reasoning internal model (sengaja tidak diekspos)
- durasi/ETA task

## File

- `index.html` — struktur workspace
- `style.css` — tema dark neutral, glow terkendali
- `app.js` — logika state-driven (tanpa dependency)
- `state.json` — symlink ke `../spider/state.json` (data nyata)

## GitHub Pages (snapshot polling, bukan real-time)

Arsitektur: `muse.db → Bridge → state.json → git commit/push → GitHub Pages → fetch + polling`.

- Frontend 100% statis: relative path (`style.css`, `app.js`, `state.json`), tanpa backend/localhost.
- Snapshot **tidak** otomatis berubah hanya karena Pages aktif. Setiap update butuh: Muse refresh `raw.json` → `publish_state.py` → commit/push.
- Perintah publish (dari root repo, setelah `gh auth login` + remote terpasang):

```bash
./push_snapshot.sh
```

- Test visual di URL publik: `https://<user>.github.io/<repo>/?src=fixture-stale.json`
