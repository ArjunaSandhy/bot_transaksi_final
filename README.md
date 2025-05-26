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

## Deployment dengan Docker

### Persiapan

1. Clone repository
```bash
git clone URL_REPOSITORY_ANDA
cd bot_transaksi_telegram
```

2. Setup environment variables
```bash
cp env.example .env
# Edit file .env sesuai kebutuhan
```

3. Siapkan credentials Google
```bash
# Buat folder credentials
mkdir -p credentials
# Copy file credentials.json ke folder credentials
```

### Menjalankan dengan Docker

1. Build dan jalankan container
```bash
# Build image
docker-compose build

# Jalankan container
docker-compose up -d
```

2. Cek status dan logs
```bash
# Cek status container
docker-compose ps

# Lihat logs
docker-compose logs -f bot
```

3. Menghentikan bot
```bash
docker-compose down
```

### Perintah Docker Lainnya

```bash
# Restart bot
docker-compose restart bot

# Update kode dan rebuild
git pull
docker-compose down
docker-compose build
docker-compose up -d

# Lihat penggunaan resource
docker stats
```

## Deployment Manual (Tanpa Docker)

1. Install dependencies
```bash
npm install
```

2. Setup environment variables
```bash
cp env.example .env
# Edit file .env sesuai kebutuhan
```

3. Jalankan bot
```bash
node main.js
```

## Konfigurasi

Bot ini mendukung konfigurasi multiple grup dengan parameter berikut untuk setiap grup:

- GROUP_ID: ID grup Telegram
- GROUP_NAME: Nama grup
- GROUP_SHEET: ID Google Spreadsheet
- GROUP_DRIVE: ID folder Google Drive
- GROUP_NOTIFICATION_TOPIC_ID: ID topic untuk notifikasi

## Pemeliharaan

### Backup

Disarankan untuk melakukan backup secara berkala:
```bash
# Backup manual
tar -czf backup_bot_$(date +%Y%m%d).tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    .
```

### Update

```bash
# Update kode
git pull

# Update dependencies
npm install

# Restart bot
# Jika menggunakan Docker:
docker-compose restart bot
# Jika manual:
pm2 restart bot # atau cara restart lainnya
```

## Troubleshooting

### Masalah Umum

1. Bot tidak merespons
   - Cek status bot dan logs
   - Pastikan token bot valid
   - Periksa koneksi internet

2. Error Google API
   - Pastikan credentials.json valid
   - Periksa scope API yang diizinkan
   - Refresh token jika expired

### Logs

- Docker: `docker-compose logs -f bot`
- Manual: Cek file di folder `logs/`

## Kontribusi

Silakan buat issue atau pull request untuk kontribusi.

## Lisensi

MIT License 