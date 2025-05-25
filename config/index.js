require('dotenv').config();

// Fungsi untuk mendapatkan konfigurasi grup dari environment variables
function getGroupConfigs() {
    const groups = {};
    let groupIndex = 1;

    while (process.env[`GROUP${groupIndex}_ID`]) {
        const groupId = process.env[`GROUP${groupIndex}_ID`];
        groups[groupId] = {
            id: groupId,
            name: process.env[`GROUP${groupIndex}_NAME`] || `Group ${groupIndex}`,
            spreadsheetId: process.env[`GROUP${groupIndex}_SHEET`] || '',
            driveFolderId: process.env[`GROUP${groupIndex}_DRIVE`] || '',
            notificationTopicId: process.env[`GROUP${groupIndex}_NOTIFICATION_TOPIC_ID`] || ''
        };
        groupIndex++;
    }

    return groups;
}

// Konfigurasi untuk Bot Telegram
const config = {
    // Token Bot Telegram
    botToken: process.env.BOT_TOKEN || '',

    // Konfigurasi untuk notifikasi invoice belum lunas
    notification: {
        enabled: process.env.NOTIFICATION_ENABLED === 'true',
        time: process.env.NOTIFICATION_TIME || '09:00', // Format: HH:MM
    },

    // Akses kontrol bot
    accessControl: {
        // Array ID user yang diizinkan akses private chat
        allowedUsers: (process.env.ALLOWED_USERS || '').split(',').filter(id => id.trim() !== ''),

        // Pesan yang ditampilkan saat akses ditolak (hardcoded)
        accessDeniedMessage: '⛔ Maaf, Anda tidak memiliki akses untuk menggunakan bot ini.',

        // Aktifkan/nonaktifkan fitur akses kontrol
        enabled: process.env.ACCESS_CONTROL_ENABLED === 'true'
    },

    // Konfigurasi grup
    groups: getGroupConfigs()
};

module.exports = config;