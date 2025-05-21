# Bot Transaksi Telegram

Bot Telegram untuk mencatat dan melacak transaksi penjualan, pembelian, dan iklan serta mengelola status pelunasan.

## Fitur

- Pencatatan transaksi penjualan dengan lampiran file/gambar
- Pencatatan transaksi pembelian dengan lampiran file/gambar
- Pencatatan transaksi iklan dengan nomor virtual account
- Pelunasan transaksi dengan bukti transfer
- Pelunasan massal untuk beberapa transaksi sekaligus
- Notifikasi invoice yang belum lunas
- Pencatatan lampiran invoice iklan

## Perintah yang Tersedia

### Transaksi

- `/penjualan` - Mencatat transaksi penjualan
- `/pembelian` - Mencatat transaksi pembelian
- `/iklan` - Mencatat transaksi iklan

### Pelunasan

- `/pelunasan` - Melunasi transaksi tunggal
- `/pelunasanmassal` - Melunasi beberapa transaksi sekaligus
- `/invoiceiklan` - Melampirkan invoice iklan

### Utilitas

- `/belumlunas` - Menampilkan daftar invoice yang belum lunas
- `/linksheet` - Mendapatkan link Google Spreadsheet
- `/linkdrive` - Mendapatkan link folder Google Drive

## Instalasi

1. Clone repositori ini
2. Jalankan `npm install` untuk menginstal dependensi
3. Buat file `.env` dengan isi:
   ```
   BOT_TOKEN=token_bot_telegram_anda
   SPREADSHEET_ID=id_spreadsheet_google_anda
   DRIVE_FOLDER_ID=id_folder_google_drive_anda
   NOTIFICATION_ENABLED=true
   NOTIFICATION_CHAT_ID=id_chat_untuk_notifikasi
   NOTIFICATION_TIME=08:00
   ACCESS_CONTROL_ENABLED=true
   ALLOWED_GROUPS=id_grup_1,id_grup_2
   ALLOWED_USERS=id_user_1,id_user_2
   ```
4. Siapkan kredensial Google API (credentials.json)
5. Jalankan bot dengan `node main.js`

## Konfigurasi

Bot ini menggunakan Google Sheets API dan Google Drive API. Pastikan Anda telah mengaktifkan kedua API tersebut di [Google Cloud Console](https://console.cloud.google.com/) dan mengunduh file kredensial (`credentials.json`).

## Lisensi

MIT 