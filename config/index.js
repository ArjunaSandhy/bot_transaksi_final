require('dotenv').config();

module.exports = {
    // Bot Telegram Token
    botToken: process.env.BOT_TOKEN,

    // Google Sheets
    spreadsheetId: process.env.SPREADSHEET_ID,

    // Google Drive
    driveFolderId: process.env.DRIVE_FOLDER_ID,

    // Notification Settings
    notification: {
        chatId: process.env.NOTIFICATION_CHAT_ID || '', // Chat ID untuk notifikasi
        time: process.env.NOTIFICATION_TIME || '19:00', // Waktu notifikasi (format: HH:MM)
        enabled: process.env.NOTIFICATION_ENABLED === 'true' || false // Apakah notifikasi diaktifkan
    }
};