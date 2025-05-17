const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Path ke file credentials.json
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

// Fungsi untuk mengautentikasi Google API
async function authorize() {
    try {
        // Memastikan file credentials.json ada
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            throw new Error('File credentials.json tidak ditemukan. Silakan download dari Google Cloud Console.');
        }

        // Membaca file credentials
        const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

        // Setup autentikasi JWT
        const auth = new google.auth.JWT(
            credentials.client_email,
            null,
            credentials.private_key, ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        );

        // Autentikasi
        await auth.authorize();

        return auth;
    } catch (error) {
        console.error('Error saat autentikasi Google API:', error);
        throw error;
    }
}

module.exports = authorize;