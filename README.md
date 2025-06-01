# Bot Transaksi Telegram

Bot Telegram untuk mengelola transaksi penjualan, pembelian, dan iklan dengan integrasi Google Sheets dan Google Drive.

## Fitur

- Pencatatan transaksi penjualan
- Pencatatan transaksi pembelian
- Pencatatan transaksi iklan
- Pelunasan invoice
- Pelunasan massal
- Notifikasi invoice belum lunas
- Integrasi dengan Google Sheets
- Penyimpanan lampiran di Google Drive

## Perintah yang Tersedia

- `/penjualan` - Mencatat transaksi penjualan
- `/pembelian` - Mencatat transaksi pembelian
- `/iklan` - Mencatat transaksi iklan
- `/pelunasan` - Melunasi invoice
- `/pelunasanmassal` - Melunasi beberapa invoice sekaligus
- `/invoiceiklan` - Melampirkan invoice iklan
- `/belumlunas` - Melihat daftar invoice yang belum lunas
- `/linksheet` - Mendapatkan link Google Spreadsheet
- `/linkdrive` - Mendapatkan link folder Google Drive
- `/help` - Menampilkan bantuan

## Konfigurasi

Bot ini memerlukan beberapa konfigurasi:

1. Token Bot Telegram
2. Kredensial Google API
3. ID Spreadsheet
4. ID Folder Google Drive
5. Konfigurasi grup dan akses kontrol

## Instalasi

1. Clone repository ini
2. Install dependencies dengan `npm install`
3. Salin `.env.example` ke `.env` dan sesuaikan konfigurasi
4. Jalankan bot dengan `node main.js`

## Lisensi

MIT License 