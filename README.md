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

## Persyaratan Sistem

- Node.js v14 atau lebih tinggi
- NPM v6 atau lebih tinggi
- PM2 (untuk production)
- Git

## Instalasi di VPS

1. Install Node.js dan NPM:
```bash
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. Install PM2:
```bash
sudo npm install -g pm2
```

3. Clone repository:
```bash
git clone https://github.com/ArjunaSandhy/bot_transaksi_telegram_v3.git
cd bot_transaksi_telegram_v3
```

4. Setup environment:
```bash
cp env.example .env
cp credentials.json.example credentials.json
```

5. Edit konfigurasi:
- Edit file `.env` dengan konfigurasi yang sesuai
- Update `credentials.json` dengan kredensial Google API
- Sesuaikan konfigurasi di `config/index.js`

6. Install dependencies:
```bash
npm install --production
```

7. Jalankan bot:
```bash
pm2 start ecosystem.config.js
```

8. Setup auto-start saat reboot:
```bash
pm2 startup
pm2 save
```

## Maintenance

### Update Bot

Untuk mengupdate bot ke versi terbaru:
```bash
./deploy.sh
```

### Monitoring

- Cek status bot:
```bash
pm2 status
```

- Lihat logs:
```bash
pm2 logs bot-transaksi-telegram
```

- Monitor resource usage:
```bash
pm2 monit
```

### Troubleshooting

1. Jika bot tidak berjalan:
```bash
pm2 logs bot-transaksi-telegram --lines 100
```

2. Restart bot:
```bash
pm2 restart bot-transaksi-telegram
```

3. Jika ada masalah dengan dependencies:
```bash
rm -rf node_modules
npm install --production
pm2 restart bot-transaksi-telegram
```

## Keamanan

1. Pastikan file `.env` dan `credentials.json` memiliki permission yang tepat:
```bash
chmod 600 .env credentials.json
```

2. Gunakan firewall:
```bash
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

3. Update sistem secara berkala:
```bash
sudo apt update
sudo apt upgrade
``` 