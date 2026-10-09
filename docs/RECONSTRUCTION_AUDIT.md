# RECONSTRUCTION AUDIT — Network-Centric SPIDER

**Tanggal:** 9 Oktober 2026
**PR:** #27 — "feat: network-centric reconstruction"
**Commit:** merge ke main

## Perbedaan Utama: Lama vs Baru

| Aspek | Lama (card-centric) | Baru (network-centric) |
|-------|---------------------|------------------------|
| Elemen utama | Kartu per tool (header+network kecil+footer) | Satu jaringan sesi persistent |
| Visual weight | 80% chrome kartu, 20% network | 90% network, 10% chrome |
| Network | Per-kartu, 2-3 node, terisolasi | Global, tumbuh akumulatif, terhubung |
| Detail tool | Selalu terlihat (memenuhi layar) | Klik node → panel geser (sekunder) |
| Area kosong | Besar saat sedikit tool | Tidak ada — network mengisi viewport |
| Layout | Force-directed per sesi | Force-directed per sesi |

## Masalah yang Ditemukan & Solusi

1. **Test dedup salah** — Test awal pakai event_id sama untuk START/COMPLETE.
   Realita: bridge selalu generate UUID unik per event. Test diperbaiki.
2. **`linkOverlay` null guard** — Diperketat dari review sebelumnya.
3. **Konsep "kepadatan adaptif"** — Ditolak Indra ("jangan pakai durasi tool").
   Solusi: kepadatan = jumlah tool nyata dalam sesi. Jujur dan otomatis.

## File Diubah

- `index.html`: `#cardGrid` → `#networkCanvas` + `#detailPanel` + `#emptyHint`
- `style.css`: Layout network-centric, panel detail geser
- `app.js`: `SessionNetwork` gantikan sistem kartu (335+/313-)

## Pengujian

| Uji | Hasil |
|-----|-------|
| Sintaks | ✅ PASS |
| Functional (3 node, 2 edge, status, dedup) | ✅ PASS |
| Nol Math.random | ✅ PASS |
| ID resolve | ✅ PASS |
| Browser visual | ⏳ Berjalan |

## Perbandingan dengan Video Referensi

| Elemen video | Implementasi baru |
|--------------|-------------------|
| Network padat mengisi view | ✅ Jaringan sesi mengisi viewport |
| Node tumbuh berkelanjutan | ✅ Node baru per TOOL_STARTED |
| Koneksi antar elemen | ✅ Edge temporal |
| Highlight aktivitas terbaru | ✅ Node aktif ber-glow |
| Tidak ada karakter dominan | ✅ Network adalah hero |
| Stats bar | ✅ Dipertahankan |
| JEV | ✅ Dipertahankan |

## Yang Belum Terverifikasi

- Browser visual test (berjalan)
- QA mobile
- Perilaku dengan 50+ node (performa force-directed)

## Ide Out-of-the-Box

**"Time travel scrubber":** Karena `netNodes` menyimpan timestamp setiap node,
tambahkan slider waktu di bawah. Geser ke belakang → network me-rewind ke keadaan
pada waktu tersebut (node yang belum ada disembunyikan). Ini memberi dimensi
temporal yang tidak ada di video referensi — pengguna bisa "memutar ulang"
aktivitas agent seperti video.
