# KOREKSI AUDIT VIDEO DAN RENCANA VISUAL SPIDER

**Tanggal:** 9 Oktober 2026
**Metode:** Ekstraksi 116 frame (5 fps) + analisis perbedaan piksel kuantitatif
**Status:** AUDIT SAJA — tidak ada kode yang diubah, tidak ada commit/push/merge/deploy

> Konvensi: **[FAKTA]** = terukur/terlihat langsung. **[INTERPRETASI]** = kesimpulan
> dengan tingkat kepastian dinyatakan. **[USULAN]** = rekomendasi teknis.
> **[KETIDAKPASTIAN]** = tidak dapat dipastikan dari video.

---

## A. TEMUAN VISUAL BERDASARKAN TIMELINE

### A.1. Data Kuantitatif Pergerakan

Perubahan piksel per 0.2 detik (ambang >25/255):

| Fase | Waktu | Rata-rata perubahan | Konsentrasi |
|------|-------|---------------------|-------------|
| 1. Halaman tunggal | 0–5 dtk | 7.2% | Tersebar rendah |
| Transisi | 5–7 dtk | 21.0% | **Seluruh viewport** (atas 3.9%, tengah 22.3%, bawah 26.1%) |
| 2a. Grid awal | 7–10 dtk | 16.6% | Area kartu 16.6%, stats 0.7% |
| 2b. Grid + JEV | 10–17 dtk | 12.6% | Area kartu 17.1%, JEV 4.5% |
| 3. Hasil | 17–23 dtk | **0.38%** | Hampir nol di semua area |

### A.2. Timeline per Fase

**FASE 1 — Eksplorasi Tunggal (0–5 dtk)**
- **[FAKTA]** Komposisi: stats bar + 1 halaman penuh (GitHub Trending).
- **[FAKTA]** Network tumbuh di atas halaman. Highlight teks muncul bertahap
  ("agents", "verified", "machine-readable", "Built by") — muncul satu per satu, menetap.
- **[FAKTA]** Counter: CRAWLERS 1→4, WORDS READ naik cepat.
- **[INTERPRETASI — kepastian sedang]** Pertumbuhan terlihat gradual dan kontinu,
  bukan melompat. Laju perubahan 7.2%/0.2 dtk menunjukkan aktivitas visual yang
  stabil dan berkelanjutan.

**TRANSISI (5–7 dtk)**
- **[FAKTA]** Perubahan 21% yang KONSISTEN selama 10 frame berturut-turut
  (19–22% per frame, tidak ada lompatan).
- **[FAKTA]** Perubahan terjadi di SELURUH viewport secara bersamaan.
- **[INTERPRETASI — kepastian sedang-tinggi]** Pola ini konsisten dengan transformasi
  kontinu (zoom out kamera atau morph layout), BUKAN potongan adegan (cut).
  **[KETIDAKPASTIAN]:** Tidak dapat dibedakan apakah ini pergerakan kamera virtual
  atau animasi transformasi elemen — keduanya menghasilkan pola piksel yang sama.

**FASE 2 — Eksplorasi Paralel (7–17 dtk)**
- **[FAKTA]** Komposisi: grid 12 kartu (4×3), tiap kartu memiliki network independen.
- **[FAKTA]** Perubahan terkonsentrasi di area kartu (16–17%/0.2 dtk).
  Stats bar hampir statis (0.7–2.1%) — hanya angka yang berubah.
- **[FAKTA]** Garis diagonal panjang melintasi beberapa kartu (terlihat di frame
  detik 7 dan 9) — menghubungkan network antar kartu.
- **[FAKTA]** JEV muncul di detik ~10 (panel bawah dengan border glow pink).
  Item dinilai satu per satu; titik-titik terisi progresif.

**FASE 3 — Hasil (17–23 dtk)**
- **[FAKTA]** Perubahan hanya 0.38% — praktis STATIS.
- **[FAKTA]** Panel "the crawl kept 9 repos" dengan daftar bernomor 01–09.
- **[INTERPRETASI — kepastian tinggi]** Fase ini adalah gambar diam.
  Satu-satunya yang bergerak adalah counter WORDS READ yang masih naik sedikit.
  "Kesan hidup" di fase ini berasal dari KONTEN (daftar hasil), bukan dari gerakan.

### A.3. Koreksi terhadap Analisis Sebelumnya

**Koreksi 1: Klaim "node tidak bergerak setelah muncul"**
- Analisis sebelumnya (1 fps) tidak cukup presisi untuk klaim ini.
- **[FAKTA — baru]** Uji interval: perubahan dari frame acuan tumbuh 13% (0.2 dtk)
  → 22% (1 dtk) → 35% (2 dtk) → **plateau di ~37%** (4–6 dtk).
- **[INTERPRETASI — kepastian sedang-tinggi]** Pola plateau konsisten dengan
  pertumbuhan aditif + persistensi (node yang sudah ada tidak berubah posisi
  secara signifikan). Jika node bergerak/berpindah terus, perubahan akan naik
  linear tanpa plateau.
- **[KETIDAKPASTIAN]:** Drift halus (<2px) atau perubahan intensitas glow tidak
  dapat dideteksi pada resolusi dan frame rate ini. Klaim "tidak bergerak sama
  sekali" T
IDAK dapat dibuktikan — yang terbukti adalah "tidak ada reposisi skala besar".

**Koreksi 2: Sumber "kesan hidup"**
- Analisis sebelumnya menyederhanakan menjadi "pertumbuhan aditif".
- **[FAKTA — baru]** Yang sebenarnya terjadi: **16–17% piksel di area kartu berubah
  setiap 0.2 detik, secara terdistribusi di 12 zona paralel**.
- Kesan hidup = BANYAK perubahan KECIL yang terjadi BERSAMAAN di BANYAK tempat,
  bukan satu gerakan besar. Ini seperti kerumunan — tiap individu bergerak sedikit,
  tapi keseluruhannya terasa hidup.
- **[FAKTA]** Fase 3 membuktikan: tanpa perubahan piksel pun (0.38%),
  tampilan tetap terasa "selesai dan memuaskan" karena ada NARASI
  (eksplorasi → penilaian → hasil).

---

## B. PERBEDAAN VIDEO vs SCREENSHOT IMPLEMENTASI

Screenshot: `browser_screenshots/05/05841833101fc9bba919bb89808c6e394b9e7953fa488a5240c860afd4314280.png`

| Aspek | Video referensi | Implementasi saat ini | Gap |
|-------|-----------------|----------------------|-----|
| **Pemanfaatan viewport** | 12 kartu mengisi ~95% layar | 1 kartu kecil di kiri atas; ~80% layar kosong | **Kritis** |
| **Kepadatan network** | 40–80 node per kartu | ~10 node per kartu | **Besar** |
| **Jumlah panel** | 12 (paralel) | 1 (maks 6, tapi realita: 1) | **Besar** |
| **Hubungan antarpanel** | Garis diagonal antar kartu | Tidak ada | Belum ada |
| **Pertumbuhan** | 16–17% area berubah/0.2 dtk | Spawn 1 node per 0.22 dtk (~8 node total) | **Sangat lambat** |
| **Highlight** | Kata-kata di halaman menyala | Tidak ada konten untuk di-highlight | Belum ada |
| **Fokus/narasi** | Eksplorasi → JEV → Hasil | Hanya eksplorasi (kartu muncul-hilang) | Tidak ada fase hasil |
| **Hierarki informasi** | Stats → kartu → JEV → hasil akhir | Stats → kartu → JEV (counter saja) | JEV tidak menampilkan item |
| **Latar** | Hitam pekat statis | Nebula + bintang (bergerak halus) | Berbeda dari video |

**Akar masalah:** Implementasi saat ini membuat 1 kartu per TOOL_STARTED dengan
network kecil. Video menunjukkan BANYAK kartu yang masing-masing MENUMBUHKAN
network PADAT secara paralel. Perbedaannya bukan sekadar "ukuran" — melainkan
**strategi pengisian layar**.

**[KETIDAKPASTIAN]:** Video adalah render skenario (bukan rekaman realtime).
Laju pertumbuhan dan jumlah kartu di video mungkin tidak merepresentasikan
data realtime yang sebenarnya. Untuk SPIDER, kepadatan harus disesuaikan
dengan laju event nyata, bukan meniru angka video secara buta.

---

## C. SPESIFIKASI GERAKAN DAN PERTUMBUHAN JARINGAN

### C.1. Mekanisme yang Teramati di Video

**Pertumbuhan node:**
- **[FAKTA]** Node muncul bertahap (pop-in dengan glow), tidak sekaligus.
- **[FAKTA]** Laju: dari ~0 ke ~37% area tertutup dalam ~4–6 detik per zona.
- **[INTERPRETASI]** Node baru muncul di DEKAT node yang sudah ada
  (pertumbuhan radial/cluster), bukan di posisi acak merata.

**Pertumbuhan garis:**
- **[FAKTA]** Garis muncul mengikuti node baru (1 garis per node baru,
  menghubungkan ke node induk).
- **[FAKTA]** Struktur yang terbentuk menyerupai pohon/percabangan,
  bukan mesh penuh.

**Highlight:**
- **[FAKTA]** Muncul satu per satu (berurutan, bukan sekaligus).
- **[FAKTA]** Setelah muncul, MENETAP — tidak memudar, tidak berpindah.

**Paralelisme:**
- **[FAKTA]** 12 jaringan tumbuh BERSAMAAN namun INDEPENDEN
  (tidak sinkron satu sama lain).

**Kamera/komposisi:**
- **[FAKTA]** Satu transisi besar (5–7 dtk): seluruh viewport berubah.
- **[FAKTA]** Setelah itu, komposisi STABIL selama 10 detik.
- **[FAKTA]** Transisi kedua (17–19 dtk): grid → panel hasil.

### C.2. Spesifikasi untuk SPIDER

**Prinsip pemisahan (sesuai brief):**

| Lapisan | Pemicu | Contoh di SPIDER |
|---------|--------|------------------|
| **Event nyata** | Telemetri WebSocket | Kartu baru, counter naik, status DONE/FAILED, item JEV |
| **Animasi responsif** | Dipicu event nyata | Node muncul saat TOOL_STARTED; highlight saat node aktif |
| **Animasi ambient** | Berjalan terus (ringan) | Glow berdenyut halus; TIDAK boleh menambah node/garis |

**Mekanisme pertumbuhan yang diusulkan:**
1. Setiap TOOL_STARTED → 1 kartu (seperti sekarang).
2. Kartu menumbuhkan network: node muncul 1 per ~100ms hingga 30–50 node.
   **[USULAN]** Posisi node: cluster di sekitar node induk (radial), bukan acak merata.
3. Setiap node baru → 1 garis ke node induk terdekat.
4. **[USULAN]** Node berhenti bertambah saat TOOL_COMPLETED (kartu "selesai tumbuh").
   Ini mengikat pertumbuhan pada DURASI tool nyata — bukan timer tetap.
5. Garis antar-kartu: hubungkan kartu ke-N dengan kartu ke-(N+1) via overlay canvas.

**Yang TIDAK boleh dilakukan:**
- Menambah node/garis tanpa event yang mendasarinya.
- Menggerakkan node secara acak untuk "terlihat hidup".
- Menampilkan aktivitas (CRAWLING) padahal tidak ada event masuk.

---

## D. DUA ALTERNATIF IDENTITAS SPIDER

**Konteks:** Video tidak menampilkan karakter spider. Brief Section 7 meminta
pertahankan identitas spider. Perintah sebelumnya meminta buang makhluk.
Keputusan ada di tangan Indra — saya tidak memutuskan.

### ALTERNATIF A: Spider Dipertahankan sebagai Identitas Visual

**Desain:**
- Spider kecil (bukan dominan) di area header — misalnya di samping judul
  "SPIDER by Erlangga" atau sebagai indikator status agent.
- Spider dapat berdenyut/bergerak HALUS saat event masuk (terikat data nyata),
  diam saat tidak ada event.
- Workspace utama (kartu + network) mengikuti gaya video 100%.

**Konsekuensi visual:**
- (+) Identitas proyek jelas dan berkepribadian.
- (+) Spider menjadi "wajah" agent yang diamati — personal.
- (−) Risiko mengganggu kemurnian estetika video jika penempatan/sizing salah.
- (−) Perlu desain hati-hati agar tidak terlihat seperti tempelan.

**Konsekuensi teknis:**
- Perlu mengembalikan komponen spider dari git history (kode masih ada di
  branch lama) atau membuat versi minimal baru (SVG statis + animasi CSS).
- Estimasi: 1 file SVG + ~50 baris CSS/JS. Tidak menyentuh pipeline data.
- Risiko regresi: RENDAH (komponen terisolasi di header).

### ALTERNATIF B: Spider Tidak di Area Utama (Branding Saja)

**Desain:**
- Area utama 100% gaya video (kartu + network + stats + JEV).
- Identitas SPIDER dipertahankan melalui: judul "SPIDER by Erlangga" di header,
  favicon laba-laba, nama di title bar, dan dokumentasi.
- Tidak ada karakter spider yang terlihat di workspace.

**Konsekuensi visual:**
- (+) Kemiripan maksimal dengan video referensi.
- (+) Layout lebih bersih, fokus penuh pada data.
- (−) "SPIDER" menjadi sekadar nama tanpa representasi visual.
- (−) Kehilangan elemen pembeda/personalitas proyek.

**Konsekuensi teknis:**
- Perubahan minimal: hanya teks header + favicon.
- Estimasi: ~10 baris (HTML title + header text + favicon link).
- Risiko regresi: SANGAT RENDAH.

---

## E. RENCANA IMPLEMENTASI MINIMUM

### E.1. Komponen yang Dipertahankan (jangan diubah)

| Komponen | Alasan |
|----------|--------|
| Pipeline WebSocket + state.json fallback | Terverifikasi LIVE di browser |
| Event dedup, SYSTEM filter, UNKNOWN fallback | Logika keamanan data |
| STALE handling (60 dtk) | Sesuai brief Section 5 |
| Kontrak event | Stabil, tidak ada keluhan |
| Mapping tool→node (12 kategori) | Stabil |
| Stats bar (TOOLS/NODES/EVENTS/KEPT/SKIPPED) | Sesuai video |
| JEV bar (posisi bawah) | Sesuai video |

### E.2. Komponen yang Diperbaiki

| Komponen | Masalah | Perbaikan |
|----------|---------|-----------|
| Network per kartu | Terlalu jarang (~10 node) | 30–50 node, spawn 1/100ms, cluster radial |
| Distribusi kartu | 1 kartu kecil, layar kosong | Grid mengisi viewport (2–3 kolom responsif) |
| Crawler bot | Gerak acak (dekoratif) | **Hapus** atau ikat pada node yang baru muncul |
| Latar | Nebula bergerak (tidak ada di video) | Hitam pekat statis (sesuai video) |

### E.3. Komponen Baru yang Diperlukan

| Komponen | Fungsi | Prioritas |
|----------|--------|-----------|
| Garis antar-kartu | Overlay canvas: hubungkan kartu berurutan | Sedang |
| Highlight tool | Nama tool menyala saat TOOL_STARTED | Sedang |
| JEV item aktif | Tampilkan nama tool + keputusan terakhir | Tinggi |
| Panel hasil sesi | Daftar KEPT saat STALE (fase "hasil" video) | Tinggi |
| Counter tween | Animasi angka naik (bukan lompat) | Rendah |

### E.4. Layout dan Viewport

- **[USULAN]** Grid responsif: desktop 3 kolom, tablet 2 kolom, HP 1 kolom.
- **[USULAN]** Kartu mengisi ruang yang tersedia (tidak ada area kosong besar).
- **[USULAN]** Maksimal kartu yang terlihat: 6 (desktop), 4 (HP) — sisanya keluar.
- **[USULAN]** Latar: hitam pekat (#000 atau #060809), hapus/turunkan opacity nebula.

### E.5. Dampak Performa dan Responsivitas

| Perubahan | Dampak | Mitigasi |
|-----------|--------|----------|
| 6 kartu × 50 node × rAF | Beban GPU naik ~5× | Batasi node di HP (30); pause rAF kartu yang tidak terlihat |
| Overlay canvas fullscreen | 1 layer tambahan | Hanya gambar ulang saat kartu bertambah/berkurang |
| Counter tween | Negligible | — |
| Panel hasil | Negligible (DOM statis) | — |

### E.6. Risiko Regresi

| Risiko | Tingkat | Mitigasi |
|--------|---------|----------|
| Menghapus crawler bot merusak sesuatu | RENDAH | Bot tidak terhubung ke logika data |
| Mengubah latar memengaruhi readability | RENDAH | Uji kontras setelah perubahan |
| Menambah node memperlambat HP lama | SEDANG | Deteksi layar kecil → kurangi node |
| Panel hasil memicu pada waktu yang salah | SEDANG | Gunakan STALE (sudah ada) sebagai pemicu; uji skenario |

---

## F. KEPUTUSAN YANG DIPERLUKAN DARI INDRA

**1. Identitas Spider — pilih A atau B** (lihat Section D di atas).
   Saya tidak akan menyentuh identitas visual sampai ada pilihan eksplisit.

**2. Setujui rencana implementasi E.1–E.6?**
   Jika ya, saya kerjakan bertahap dengan laporan per tahap.
   Jika ada yang ingin diubah/dihapus dari daftar, beri tahu.

**3. Latar: hitam pekat (sesuai video) atau pertahankan nebula?**
   Video menggunakan hitam pekat statis. Nebula saat ini berbeda dari video
   tetapi memberi karakter. Keputusan di tangan Indra.

---

*Tidak ada kode yang diubah dalam audit ini. Working tree bersih (hanya file*
*dokumentasi ini yang belum di-commit). Menunggu keputusan sebelum bertindak.*
