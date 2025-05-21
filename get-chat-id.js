/**
 * Script untuk mendapatkan ID chat Telegram (grup, channel, atau user)
 * 
 * 1. Ganti BOT_TOKEN dengan token bot Telegram Anda
 * 2. Tambahkan bot ke grup atau channel, atau chat dengan bot secara pribadi
 * 3. Kirim pesan ke bot (di grup, channel, atau private chat)
 * 4. Jalankan script ini: node get-chat-id.js
 * 5. ID chat akan ditampilkan pada output
 * 
 * ID grup biasanya dalam format: -100xxxxxxxxxx
 * ID user biasanya dalam format: 123456789
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

// Ambil token bot dari environment variable atau ganti langsung di sini
const botToken = process.env.BOT_TOKEN || 'GANTI_DENGAN_TOKEN_BOT_ANDA';

// Inisialisasi bot
const bot = new Telegraf(botToken);

// Handler untuk mengambil update terbaru
console.log('Mendapatkan updates dari Telegram...');

// Fungsi untuk mendapatkan updates
async function getUpdates() {
    try {
        // Ambil updates langsung dari API Telegram
        const response = await bot.telegram.getUpdates(0, 100, undefined, undefined);

        console.log(`\nDitemukan ${response.length} pesan terbaru:\n`);

        if (response.length === 0) {
            console.log('Tidak ada pesan terbaru. Pastikan Anda telah mengirim pesan ke bot (di grup atau chat pribadi).');
            console.log('Tip: Tambahkan bot ke grup, kirim pesan, lalu jalankan script ini kembali.');
            return;
        }

        // Tampilkan informasi untuk setiap update
        response.forEach((update, index) => {
            if (update.message) {
                const { message } = update;
                const chatId = message.chat.id;
                const chatType = message.chat.type;
                const chatTitle = message.chat.title || 'Private Chat';
                const fromName = message.from ? `${message.from.first_name} ${message.from.last_name || ''}`.trim() : 'Unknown';
                const username = message.from && message.from.username ? `@${message.from.username}` : 'No Username';
                const userId = message.from ? message.from.id : 'Unknown';
                const messageText = message.text || '[Media/Dokumen]';

                console.log(`[${index + 1}] ${chatType.toUpperCase()}: ${chatTitle}`);
                console.log(`    - Chat ID: ${chatId}`);
                console.log(`    - Pengirim: ${fromName} (${username}, ID: ${userId})`);
                console.log(`    - Pesan: ${messageText}`);
                console.log('');
            }
        });

        console.log('\nGunakan Chat ID yang sesuai untuk konfigurasi access control.');
        console.log('- Untuk grup: Tambahkan ID ke ALLOWED_GROUPS di .env');
        console.log('- Untuk user: Tambahkan ID ke ALLOWED_USERS di .env');

    } catch (error) {
        console.error('Error saat mendapatkan updates:', error.message);
        if (error.message.includes('Unauthorized')) {
            console.log('\nToken bot tidak valid. Pastikan token bot yang digunakan benar.');
        }
    }
}

// Jalankan fungsi
getUpdates().finally(() => {
    process.exit(0);
});