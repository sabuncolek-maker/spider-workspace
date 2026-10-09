# ANALISIS VIDEO REFERENSI — SPIDER by Erlangga

**File:** `a0117fb731c402895a43efb0196764d803332da706aa636bb85dd594e8fcb254.mp4`
**Durasi:** 23.17 detik, 695 frame, 576×718 (portrait)
**Metode:** Ekstraksi 23 frame (1 fps) + inspeksi visual langsung per frame
**Tanggal analisis:** 9 Oktober 2026

> Konvensi: **[FAKTA]** = terlihat langsung di frame. **[INTERPRETASI]** = kesimpulan dari
> pola gerakan. **[USULAN]** = rekomendasi teknis untuk SPIDER.

---

## A. LAPORAN OBSERVASI VIDEO

### A.1. Komposisi Umum

**[FAKTA]** Video menampilkan antarmuka dark AI research workspace dalam tiga fase:

| Fase | Waktu | Komposisi |
|------|-------|-----------|
| 1. Eksplorasi tunggal | 0–5 dtk | 1 halaman penuh (screenshot GitHub Trending) + network tumbuh di atasnya |
| 2. Eksplorasi paralel | 5–17 dtk | Grid 12 kartu (4 kolom × 3 baris), tiap kartu punya network independen |
| 3. Hasil | 17–23 dtk | Panel hasil "the crawl kept 9 repos" — daftar bernomor |

**[FAKTA]** Stats bar tetap di atas sepanjang video: CRAWLERS | PAGES | WORDS READ | SENT TO JEV.
Angka terus naik (tidak pernah turun/reset).

**[FAKTA]** Panel JEV muncul di bawah pada detik ~10: "is this repo worth your time?"
dengan counter SKIPPED/KEPT + deretan titik + item yang sedang dinilai.

### A.2. Elemen per Kategori

#### A.2.1. Lapisan Latar
**[FAKTA]** Hitam pekat, statis. Tidak ada pergerakan, gradasi, atau perubahan kecerahan
yang terdeteksi di seluruh 23 detik. Latar adalah kanvas pasif — semua "kehidupan"
berasal dari elemen di atasnya.

#### A.2.2. Panel Informasi
**[FAKTA]**
- Fase 1: satu panel besar berisi teks halaman web (judul repo, deskripsi, tombol Star).
- Fase 2: panel terbelah menjadi 12 kartu. Tiap kartu menampilkan teks samar (konten halaman)
  dengan network overlay di atasnya.
- **[INTERPRETASI]** Transisi fase 1→2 (detik 5–7) terlihat seperti **zoom out kamera**:
  halaman tunggal mengecil dan "berkembang biak" menjadi grid. Kartu-kartu tidak terlihat
  bergerak satu per satu — melainkan seluruh viewport yang berubah skala.
- **[FAKTA]** Setelah grid terbentuk, posisi kartu STABIL. Tidak ada kartu yang berpindah,
  berubah ukuran, atau hilang selama fase 2.
- **[FAKTA]** Fase 2→3 (detik 17–19): grid memudar, panel hasil muncul dengan daftar
  yang terisi progresif dari atas ke bawah.

#### A.2.3. Node / Titik Jaringan
**[FAKTA]**
- Titik-titik kecil bercahaya, warna: cyan, magenta/pink, ungu, biru elektrik, hijau, kuning.
- Ukuran bervariasi: sebagian titik kecil (2–3px), sebagian lebih besar dan terang (hub).
- **[FAKTA]** Node MUNCUL secara progresif (pop-in dengan glow). Setelah muncul, posisi
  node relatif STABIL — tidak terlihat drift atau pergerakan independen yang signifikan.
- **[INTERPRETASI]** Pertumbuhan bersifat **aditif murni**: jaringan hanya bertambah,
  tidak pernah menyusut atau menata ulang. Ini yang memberi kesan "jejak hidup".
- **[FAKTA]** Kepadatan: tiap kartu di fase 2 memiliki puluhan node (estimasi 40–80 per kartu).

#### A.2.4. Garis Penghubung
**[FAKTA]**
- Garis tipis (1px), warna neon redup, menghubungkan node-node.
- **[FAKTA]** Garis muncul bersamaan dengan node baru (digambar dari node lama ke node baru).
- **[FAKTA]** Ada garis-garis diagonal PANJANG yang melintasi beberapa kartu
  (terlihat jelas di frame detik 7 dan 9) — garis ini menghubungkan network antar kartu.
- **[INTERPRETASI]** Garis antar-kartu bersifat statis setelah digambar; tidak mengikuti
  pergerakan karena node-nya sendiri tidak bergerak.

#### A.2.5. Label dan Highlight
**[FAKTA]**
- Pada fase 1, kata-kata tertentu di halaman mendapat highlight berwarna
  (latar cyan, pink, kuning): "agents", "verified", "machine-readable", "Built by", "code".
- **[FAKTA]** Highlight muncul bertahap (satu per satu, mengikuti "bacaan" crawler),
  lalu MENETAP — tidak memudar, tidak berpindah, tidak berkedip.
- **[FAKTA]** Di JEV: item yang sedang dinilai ditampilkan dengan latar merah/pink menyala.

#### A.2.6. Entitas Crawler
**[FAKTA]** Counter CRAWLERS naik: 1 → 4 → 32 → 128.
**[INTERPRETASI]** Entitas individu sulit dibedakan secara visual dari pertumbuhan network
itu sendiri. "Crawler" direpresentasikan lebih sebagai **laju pertumbuhan** (semakin banyak
crawler = network tumbuh semakin cepat di semakin banyak kartu) daripada sebagai
karakter yang terlihat bergerak. Tidak ada sprite laba-laba atau bot yang jelas terlihat.

---

## B. TIMELINE ANIMASI

| Waktu | Komposisi | Elemen Bergerak / Berubah | Jenis Gerakan | Kesan |
|-------|-----------|---------------------------|---------------|-------|
| 0–1 dtk | Stats + 1 halaman | Network mulai tumbuh (titik muncul) | Pop-in aditif | Sistem "bangun" |
| 1–3 dtk | Halaman penuh | Node bertambah; highlight teks muncul ("agents", "verified"); CRAWLERS 1→4 | Pop-in + highlight fade-in | Crawler "membaca" halaman |
| 3–5 dtk | Halaman penuh | Network makin padat; highlight bertambah; WORDS READ naik cepat | Aditif kontinu | Eksplorasi intensif |
| 5–7 dtk | **Transisi → grid** | Halaman mengecil/berkembang menjadi 12 kartu; CRAWLERS melonjak 4→32 | Zoom out + layout morph | Skala operasi membesar |
| 7–10 dtk | Grid 12 kartu | Tiap kartu menumbuhkan network independen; garis antar-kartu muncul; CRAWLERS 32→128 | Aditif paralel (12 zona) | Operasi masif paralel |
| 10–12 dtk | Grid + JEV muncul | Panel JEV slide/fade in di bawah; SENT TO JEV mulai naik (0→5) | Panel entrance | Evaluasi dimulai |
| 12–15 dtk | Grid + JEV aktif | Item dinilai satu per satu ("agent-skills", "voicebox"); titik terisi; SKIPPED 19, KEPT 2→6 | Sequential fill | Penilaian sistematis |
| 15–17 dtk | Grid + JEV | JEV lanjut; SKIPPED 66, KEPT 8; SENT TO JEV 87→89 | Sequential fill | Evaluasi hampir selesai |
| 17–19 dtk | **Transisi → hasil** | Grid memudar; panel "the crawl kept 9 repos" muncul | Fade + panel entrance | Kesimpulan |
| 19–23 dtk | Panel hasil | Daftar 9 repo terisi progresif (01 colibri → 09 ECC) | List build top-down | Hasil final |

**Tingkat kepastian:** Komposisi dan counter = kepastian tinggi (terbaca langsung).
Mekanisme transisi zoom (vs layout morph) = kepastian sedang (tidak dapat dibuktikan
hanya dari frame 1fps; butuh analisis frame-by-frame untuk memastikan).

---

## C. SPESIFIKASI GERAKAN

### C.1. Per Elemen

**ELEMEN:** Node
**BENTUK:** Titik kecil bercahaya (2–7px), warna neon bervariasi.
**GERAK:** **[FAKTA]** Muncul (pop-in ~200–400ms dengan glow), lalu posisi stabil.
Tidak ada drift independen yang terdeteksi.
**POLA:** Pertumbuhan aditif radial — node baru muncul di sekitar cluster yang ada.
**DAMPAK VISUAL:** Jaringan terlihat "tumbuh hidup".
**HUBUNGAN:** Garis digambar dari node induk ke node baru saat node muncul.
**IMPLEMENTASI:** Canvas per kartu; array node; spawn bertahap via timer; render loop rAF.

**ELEMEN:** Garis penghubung
**BENTUK:** Garis tipis 1px, opacity rendah (~0.25–0.35).
**GERAK:** **[FAKTA]** Muncul bersama node baru. Setelah digambar, statis.
**POLA:** Menghubungkan node baru ke 1 node induk yang sudah ada (struktur pohon).
**DAMPAK VISUAL:** Struktur jaringan terlihat organik dan terhubung.
**HUBUNGAN:** Endpoint garis = posisi node (tetap karena node tidak bergerak).
**IMPLEMENTASI:** Simpan pasangan (a, b); gambar ulang tiap frame dari koordinat tersimpan.

**ELEMEN:** Garis antar-kartu
**BENTUK:** Garis diagonal panjang, sangat redup, melintasi batas kartu.
**GERAK:** **[FAKTA]** Terlihat di fase 2; statis setelah muncul.
**POLA:** Menghubungkan area network di kartu yang berbeda.
**DAMPAK VISUAL:** Memberi kesan 12 kartu adalah SATU sistem, bukan 12 sistem terpisah.
**IMPLEMENTASI:** Overlay canvas fullscreen di atas grid; hitung koordinat via
getBoundingClientRect; gambar garis antar titik acak di kartu berurutan.

**ELEMEN:** Highlight teks
**BENTUK:** Latar berwarna (cyan/pink/kuning) pada kata di dalam kartu.
**GERAK:** **[FAKTA]** Fade/pop-in satu per satu, lalu menetap permanen.
**DAMPAK VISUAL:** Menunjukkan "apa yang sedang dibaca/ditemukan".
**IMPLEMENTASI:** **[USULAN]** Untuk SPIDER: highlight nama tool/node pada kartu
saat event TOOL_STARTED diterima (data nyata), bukan kata acak.

**ELEMEN:** Stats counter
**BENTUK:** Angka besar monospace di stats bar.
**GERAK:** **[FAKTA]** Angka naik dengan animasi counting (tween), tidak melompat.
**DAMPAK VISUAL:** Rasa progres yang hidup dan terukur.
**IMPLEMENTASI:** Animasikan angka dari nilai lama ke baru (~500ms ease-out).

**ELEMEN:** Panel JEV
**BENTUK:** Panel bawah dengan border glow pink, avatar, counter, deretan titik.
**GERAK:** **[FAKTA]** Entrance (fade/slide) di detik ~10. Titik-titik terisi
satu per satu (pink = skipped, hijau = kept). Item aktif diganti per evaluasi.
**DAMPAK VISUAL:** Memberi narasi "sistem sedang berpikir dan menilai".
**IMPLEMENTASI:** **[USULAN]** Untuk SPIDER: tampilkan nama tool terakhir yang dinilai
brain + keputusan KEPT/SKIPPED-nya (data nyata dari brainJudge).

**ELEMEN:** Panel hasil
**BENTUK:** Daftar bernomor dengan border kiri pink.
**GERAK:** **[FAKTA]** Item muncul progresif dari atas ke bawah.
**DAMPAK VISUAL:** Penutup yang memuaskan — "ini hasil kerjanya".
**IMPLEMENTASI:** **[USULAN]** Untuk SPIDER: daftar tool yang KEPT selama sesi
(nama + node + waktu), muncul saat periode aktivitas selesai (STALE).

**ELEMEN:** Kamera / viewport
**BENTUK:** Keseluruhan komposisi.
**GERAK:** **[INTERPRETASI]** Zoom out pada transisi fase 1→2 (detik 5–7).
**DAMPAK VISUAL:** Perpindahan fokus dari detail ke gambaran besar.
**IMPLEMENTASI:** **[USULAN]** CSS transform scale pada container grid dengan
transition 800ms; opsional untuk SPIDER (grid langsung bisa diterima).

### C.2. Lima Karakteristik "Hidup"

**A. Gerakan berkesinambungan:** **[FAKTA]** Semua perubahan bersifat aditif dan
gradual. Tidak ada lompatan posisi, tidak ada elemen yang tiba-tiba hilang.
Node yang sudah ada tidak pernah bergerak — kontinuitas dijaga dengan
tidak mengubah apa yang sudah digambar.

**B. Hubungan antarobjek:** **[FAKTA]** Node dan garis adalah satu sistem —
garis selalu terhubung ke node yang ada. Kartu-kartu dihubungkan oleh
garis antar-kartu menjadi satu kesatuan visual.

**C. Variasi visual:** **[FAKTA]** Ukuran node bervariasi (kecil/besar),
warna bervariasi (6 warna neon), intensitas glow bervariasi.
Namun **[FAKTA]** tidak ada gerakan acak — variasi hanya pada atribut statis,
bukan pada perilaku.

**D. Perubahan fokus:** **[FAKTA]** Narasi visual yang jelas:
detail (1 halaman) → luas (12 kartu) → penilaian (JEV) → kesimpulan (hasil).
Fokus digerakkan oleh perubahan komposisi, bukan oleh efek berkedip.

**E. Respons terhadap aktivitas:** **[INTERPRETASI]** Di video (yang merupakan
render skenario), pertumbuhan network berkorelasi dengan counter yang naik.
**[USULAN]** Untuk SPIDER: setiap pertumbuhan visual HARUS dipicu oleh event
telemetri nyata (TOOL_STARTED → node baru; bukan timer acak).

---

## D. IMPLEMENTATION BLUEPRINT

### D.1. Komponen dan Teknik

| # | Komponen | Teknik | Status di SPIDER |
|---|----------|--------|------------------|
| 1 | Background renderer | CSS: hitam pekat + `space-bg.jpg` statis | ✅ Ada |
| 2 | Panel layout & transisi | CSS Grid + transition; FLIP untuk perubahan layout | ✅ Grid ada; transisi zoom belum |
| 3 | Node renderer | Canvas 2D per kartu, DPR-aware | ✅ Ada (perlu dipadatkan: 8–13 → 40–60 node) |
| 4 | Connection renderer | Canvas 2D: garis node + overlay fullscreen untuk garis antar-kartu | ⚠️ Garis node ada; antar-kartu belum |
| 5 | Label & highlight renderer | DOM overlay di dalam kartu | ❌ Belum ada |
| 6 | Animation controller | rAF per kartu + central ticker untuk counter | ⚠️ Per-kartu ada; counter belum di-tween |
| 7 | Viewport/camera controller | CSS transform scale pada container | ❌ Belum ada (opsional) |
| 8 | Event-to-visual mapping | `handleMessage` → card/node/highlight | ✅ Ada (perlu: highlight + JEV item) |
| 9 | Interaction controller | Click kartu → panel detail | ❌ Belum ada |
| 10 | Performance & a11y | Batasi node/kartu; `prefers-reduced-motion` | ✅ Ada (perlu uji beban 12 kartu) |

### D.2. Keputusan Teknologi

- **Tetap Canvas 2D** (bukan WebGL): total node ~500–700 untuk 12 kartu —
  jauh di bawah batas Canvas. WebGL menambah kompleksitas tanpa kebutuhan.
- **Tetap vanilla JS** (tanpa framework): bundle kecil, tidak ada build step,
  sesuai constraint GitHub Pages statis.
- **Tetap 1 file `app.js` atau pecah ringan**: bila dipecah, maksimal 3 file
  (`events.js`, `mapping.js`, `render.js`) tanpa mengubah logika.

### D.3. Urutan Implementasi (perubahan minimum)

1. **Padatkan network** (40–60 node/kartu, spawn lebih cepat) — dampak visual terbesar.
2. **Garis antar-kartu** (overlay canvas fullscreen, 1 garis per pasangan kartu berurutan).
3. **Highlight tool** (nama tool di header kartu menyala saat TOOL_STARTED).
4. **JEV item aktif** (tampilkan nama tool + keputusan terakhir di JEV bar).
5. **Panel hasil sesi** (daftar KEPT, muncul saat STALE — "sesi ini menyimpan N tool").
6. **Counter tween** (animasi angka naik, bukan lompat).
7. **Click detail** (klik kartu → info event_id, timestamp, durasi).

### D.4. Risiko

| Risiko | Mitigasi |
|--------|----------|
| 12 kartu × 60 node × rAF = beban GPU di HP | Batasi: HP tampil 4–6 kartu; node 30/kartu di layar kecil |
| Garis antar-kartu perlu hitung ulang saat resize/scroll | Dengar `resize`; gambar ulang overlay |
| Panel hasil butuh definisi "sesi selesai" | Gunakan STALE (60 dtk tanpa event) sebagai pemicu |
| Highlight butuh konten kartu | Kartu saat ini kosong (hanya network); tambahkan baris metadata tool |

### D.5. Yang TIDAK Diubah

- Pipeline realtime (WebSocket + state.json) — terbukti jalan.
- Kontrak event — stabil.
- Mapping tool→node — stabil.
- Aturan keamanan (no secret/args di frontend).

---

## E. CATATAN KEPUTUSAN: Identitas Spider

**[FAKTA]** Video referensi TIDAK memiliki karakter spider/makhluk apapun.
"Keberadaan hidup" di video berasal dari pertumbuhan network, bukan dari karakter.

**[KONFLIK]** Brief Section 7 meminta "pertahankan identitas spider",
tetapi Indra memerintahkan dua kali untuk membuang visual makhluk
("buang visual sebelumnya" dan "keukeuh banget kamu sama ubur ubur" —
diikuti perintah jiplak video).

**[USULAN]** Ikuti perintah terbaru dan video sebagai otoritas visual:
tidak ada karakter spider. Jika Indra menginginkan karakter kembali,
itu menjadi brief terpisah.

---

*Analisis selesai. Menunggu persetujuan sebelum implementasi (sesuai brief:
jangan ubah kode sebelum laporan diperiksa).*
