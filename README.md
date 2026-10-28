# ⚔️ HoYo Character Guide & Build Database

Repository ini secara otomatis mengumpulkan, memindai, dan memperbarui panduan build karakter terkini untuk game-game HoYoverse:
- 🗡️ **Genshin Impact**
- 🚂 **Honkai: Star Rail**
- 🎬 **Zenless Zone Zero**

---

## ⚡ Fitur Utama

- **Pembaruan Otomatis (GitHub Actions)**:
  - Berjalan otomatis **setiap 3 hari** via cron workflow [`.github/workflows/auto_build_updater.yml`](.github/workflows/auto_build_updater.yml).
  - Bisa dipicu manual kapan saja lewat tombol **Run workflow** (`workflow_dispatch`).
- **Data Lengkap**:
  - **Best Weapon / Light Cone / W-Engine** (Best-in-Slot & Opsi Alternatif / F2P).
  - **Best Artifacts / Relics / Drive Discs** (Set rekomendasi & alternatif).
  - **Stat Priorities** (Main Stats & Substats).
  - **Thumbnail Resmi** dari artwork/icon karakter.
- **Output JSON Bersih**:
  - Semua build tersimpan di [`data/builds.json`](data/builds.json) dan siap diakses langsung oleh bot Discord atau API eksternal via GitHub Raw.

---

## 🚀 Menjalankan Lokal

```bash
# Jalankan crawler manual
node build_crawler.js
```
