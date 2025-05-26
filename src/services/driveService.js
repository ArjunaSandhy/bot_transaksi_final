const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../../config');
const authorize = require('../utils/googleAuth');
const { memoryCache, optimizeFileProcessing } = require('../utils/perfOptimizer');
const Logger = require('../utils/logger');

class DriveService {
    constructor() {
        this.isInitialized = false;
    }

    // Inisialisasi drive API
    async init() {
        try {
            // Cek apakah sudah diinisialisasi
            if (this.isInitialized && this.drive) {
                return;
            }

            const auth = await authorize();
            this.drive = google.drive({
                version: 'v3',
                auth
            });
            this.isInitialized = true;
        } catch (error) {
            Logger.error('Error inisialisasi Google Drive API:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    // Mengupload file ke Google Drive
    async uploadFile(fileBuffer, mimeType, fileName, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            // Bersihkan nama file dari karakter khusus
            const sanitizedFileName = fileName.replace(/[\/\\?%*:|"<>]/g, '-');

            // Buat temporary directory jika belum ada
            const tempDir = path.join(os.tmpdir(), 'bot_transaksi_telegram');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Buat file temporary dengan nama yang sudah dibersihkan
            const tempFilePath = path.join(tempDir, sanitizedFileName);

            try {
                fs.writeFileSync(tempFilePath, fileBuffer);
            } catch (writeError) {
                Logger.error(`Gagal menulis file temporary: ${writeError.message}`);
                throw writeError;
            }

            const fileMetadata = {
                name: sanitizedFileName,
                parents: [groupConfig.driveFolderId]
            };

            const media = {
                mimeType: mimeType,
                body: fs.createReadStream(tempFilePath)
            };

            try {
                const response = await this.drive.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, webViewLink'
                });

                // Hapus file temporary
                try {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch (unlinkError) {
                    Logger.error(`Gagal menghapus file temporary: ${unlinkError.message}`);
                    // Lanjutkan meskipun gagal menghapus file temporary
                }

                return {
                    id: response.data.id,
                    url: response.data.webViewLink
                };
            } catch (uploadError) {
                // Hapus file temporary jika upload gagal
                try {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch (unlinkError) {
                    Logger.error(`Gagal menghapus file temporary: ${unlinkError.message}`);
                }
                throw uploadError;
            }
        } catch (error) {
            Logger.error(`Gagal mengupload file: ${error.message}`);
            throw error;
        }
    }

    // Mengcopy file di Google Drive dengan nama baru
    async copyFile(fileId, newFileName, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.drive.files.copy({
                fileId: fileId,
                resource: {
                    name: newFileName,
                    parents: [groupConfig.driveFolderId]
                },
                fields: 'id, webViewLink'
            });

            return {
                id: response.data.id,
                url: response.data.webViewLink
            };
        } catch (error) {
            Logger.error(`Gagal menyalin file ${fileId} dengan nama ${newFileName}:`, error);
            throw error;
        }
    }
}

module.exports = new DriveService();