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
        this.folderId = config.driveFolderId;
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
    async uploadFile(fileBuffer, mimeType, fileName) {
        try {
            if (!this.isInitialized) await this.init();

            // Buat file temporary
            const tempFilePath = path.join(os.tmpdir(), fileName);
            fs.writeFileSync(tempFilePath, fileBuffer);

            const fileMetadata = {
                name: fileName,
                parents: [this.folderId]
            };

            const media = {
                mimeType: mimeType,
                body: fs.createReadStream(tempFilePath)
            };

            const response = await this.drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, webViewLink'
            });

            // Hapus file temporary
            fs.unlinkSync(tempFilePath);

            return {
                id: response.data.id,
                url: response.data.webViewLink
            };
        } catch (error) {
            Logger.error('Gagal mengupload file', error);
            throw error;
        }
    }

    // Mengcopy file di Google Drive dengan nama baru
    async copyFile(fileId, newFileName) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.drive.files.copy({
                fileId: fileId,
                resource: {
                    name: newFileName,
                    parents: [this.folderId]
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