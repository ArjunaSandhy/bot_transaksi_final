require('dotenv').config();

// Konfigurasi untuk Bot Telegram
const config = {
    // Token Bot Telegram
    botToken: process.env.BOT_TOKEN || '',

    // Spreadsheet ID Google Sheets
    spreadsheetId: process.env.SPREADSHEET_ID || '',

    // Folder ID Google Drive
    driveFolderId: process.env.DRIVE_FOLDER_ID || '',

    // Konfigurasi untuk notifikasi invoice belum lunas
    notification: {
        enabled: process.env.NOTIFICATION_ENABLED === 'true',
        chatId: process.env.NOTIFICATION_CHAT_ID || '',
        time: process.env.NOTIFICATION_TIME || '08:00', // Format: HH:MM
    },

    // Akses kontrol bot
    accessControl: {
        // Array ID grup yang diizinkan akses (kosongkan untuk mengizinkan semua grup)
        allowedGroups: (process.env.ALLOWED_GROUPS || '').split(',').filter(id => id.trim() !== ''),

        // Array ID user yang diizinkan akses private chat (kosongkan untuk tidak mengizinkan private chat)
        allowedUsers: (process.env.ALLOWED_USERS || '').split(',').filter(id => id.trim() !== ''),

        // Pesan yang ditampilkan saat akses ditolak (hardcoded, tidak perlu dari .env)
        accessDeniedMessage: '⛔ Maaf, Anda tidak memiliki akses untuk menggunakan bot ini.',

        // Aktifkan/nonaktifkan fitur akses kontrol
        enabled: process.env.ACCESS_CONTROL_ENABLED === 'true'
    }
};

module.exports = config;