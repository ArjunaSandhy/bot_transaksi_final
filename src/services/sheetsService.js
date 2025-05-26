const { google } = require('googleapis');
const config = require('../../config');
const authorize = require('../utils/googleAuth');
const { memoryCache, batchProcessor } = require('../utils/perfOptimizer');
const Logger = require('../utils/logger');

class SheetsService {
    constructor() {
        this.isInitialized = false;
    }

    // Inisialisasi sheets API
    async init() {
        try {
            // Cek apakah sudah diinisialisasi
            if (this.isInitialized && this.sheets) {
                return;
            }

            const auth = await authorize();
            this.sheets = google.sheets({ version: 'v4', auth });
            this.isInitialized = true;

        } catch (error) {
            Logger.error('Error inisialisasi Google Sheets API:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    // Fungsi untuk mendapatkan waktu WIB saat ini
    getCurrentTimeWIB() {
        const now = new Date();
        const options = {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        return new Intl.DateTimeFormat('id-ID', options).format(now);
    }

    // Membuat hyperlink "Lihat Lampiran" dengan URL yang diberikan
    createLampiranLink(url) {
        // Jika tidak ada URL, kembalikan string kosong
        if (!url) return '';

        // Pastikan URL valid dan di-encode dengan benar
        try {
            const encodedUrl = url.replace(/"/g, '""');
            // Buat formula HYPERLINK untuk Google Sheets dengan format yang konsisten
            return `=HYPERLINK("${encodedUrl}";"Lihat Lampiran")`;
        } catch (error) {
            Logger.error('Error saat membuat link lampiran:', error);
            return '';
        }
    }

    // Fungsi untuk membuat link bukti transfer
    createBuktiTransferLink(url) {
        // Jika tidak ada URL, kembalikan string kosong
        if (!url) return '';

        // Pastikan URL valid dan di-encode dengan benar
        try {
            const encodedUrl = url.replace(/"/g, '""');
            // Buat formula HYPERLINK untuk Google Sheets dengan format yang konsisten
            return `=HYPERLINK("${encodedUrl}";"Bukti Transfer")`;
        } catch (error) {
            Logger.error('Error saat membuat link bukti transfer:', error);
            return '';
        }
    }

    // Fungsi untuk mendapatkan nomor baris dari range yang diupdate
    getRowIndexFromRange(range) {
        try {
            // Range akan dalam format seperti 'Transaksi!A5:L5'
            const match = range.match(/\d+/);
            if (match) {
                return parseInt(match[0]);
            }
            return null;
        } catch (error) {
            Logger.error('Error saat mengekstrak nomor baris:', error);
            return null;
        }
    }

    // Fungsi untuk memformat tanggal dari DD/MM/YYYY menjadi format Google Sheets (MM/DD/YYYY)
    formatDateForSheet(dateStr) {
        if (!dateStr) return '';

        try {
            // Validasi format tanggal
            const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (!dateMatch) {
                Logger.error(`Format tanggal tidak valid: ${dateStr}`);
                return dateStr;
            }

            const [_, day, month, year] = dateMatch;
            // Format tanggal menjadi MM/DD/YYYY (format yang diterima Google Sheets)
            return `${month}/${day}/${year}`;
        } catch (error) {
            Logger.error(`Error saat memformat tanggal: ${error.message}`);
            return dateStr;
        }
    }

    // Fungsi untuk memformat nominal ke format angka Google Sheets
    formatNominalForSheet(nominal) {
        if (!nominal) return '';
        // Hapus semua karakter non-digit
        const cleanNumber = nominal.toString().replace(/\D/g, '');
        // Konversi ke number dan format sebagai angka
        return Number(cleanNumber);
    }

    // Fungsi helper untuk menerapkan format hyperlink
    async applyHyperlinkFormat(spreadsheetId, sheetId, rowIndex, isNewRow = true) {
        const requests = [
            // Reset format untuk semua kolom terlebih dahulu jika ini baris baru
            ...(isNewRow ? [{
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: rowIndex - 1,
                        endRowIndex: rowIndex,
                        startColumnIndex: 0,
                        endColumnIndex: 16
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: { red: 1, green: 1, blue: 1 },
                            textFormat: {
                                foregroundColor: { red: 0, green: 0, blue: 0 },
                                bold: false,
                                italic: false
                            }
                        }
                    },
                    fields: 'userEnteredFormat(backgroundColor,textFormat)'
                }
            }] : []),
            // Format untuk kolom Nominal (kolom G, index 6) dengan warna hijau muda
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: rowIndex - 1,
                        endRowIndex: rowIndex,
                        startColumnIndex: 6,
                        endColumnIndex: 7
                    },
                    cell: {
                        userEnteredFormat: {
                            backgroundColor: {
                                red: 0.85,
                                green: 0.92,
                                blue: 0.85
                            }
                        }
                    },
                    fields: 'userEnteredFormat.backgroundColor'
                }
            },
            // Format untuk kolom Lampiran (kolom K, index 10)
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: rowIndex - 1,
                        endRowIndex: rowIndex,
                        startColumnIndex: 10,
                        endColumnIndex: 11
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                foregroundColor: { red: 0.17, green: 0.41, blue: 0.96 },
                                italic: true,
                                underline: true
                            }
                        }
                    },
                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic,underline)'
                }
            },
            // Format untuk kolom Bukti Transfer (kolom L, index 11)
            {
                repeatCell: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: rowIndex - 1,
                        endRowIndex: rowIndex,
                        startColumnIndex: 11,
                        endColumnIndex: 12
                    },
                    cell: {
                        userEnteredFormat: {
                            textFormat: {
                                foregroundColor: { red: 0.17, green: 0.41, blue: 0.96 },
                                italic: true,
                                underline: true
                            }
                        }
                    },
                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic,underline)'
                }
            }
        ];

        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: { requests }
            });
        } catch (error) {
            Logger.error('Error saat menerapkan format hyperlink:', error);
            throw error;
        }
    }

    // Menyimpan transaksi penjualan ke Google Sheets
    async savePenjualan(data, groupConfig) {
        if (!this.isInitialized) await this.init();

        // Format tanggal dan nominal sebelum disimpan
        const formattedDate = this.formatDateForSheet(data.tanggal);
        const formattedNominal = this.formatNominalForSheet(data.nominal);

        // Data untuk disimpan ke Google Sheets sesuai urutan kolom
        const values = [
            [
                formattedDate, // A: Tanggal
                'Penjualan', // B: Jenis Transaksi
                data.noInvoice, // C: No. Invoice
                data.keterangan, // D: Keterangan
                data.supplier || '', // E: Supplier
                data.customer || '', // F: Customer
                formattedNominal, // G: Nominal
                data.noRekening || '', // H: No. Rekening
                data.namaRekening || '', // I: Nama Rekening
                'Terjual', // J: Status
                this.createLampiranLink(data.fileUrl), // K: Lampiran
                '', // L: Bukti Transfer
                data.waktuInput || new Date().toISOString(), // M: Waktu input
                '-', // N: Waktu update
                data.pengirim || '', // O: Pengirim
                '0' // P: IsIklan
            ]
        ];

        try {
            // Simpan ke Google Sheets dengan format khusus
            const appendResponse = await this.sheets.spreadsheets.values.append({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });

            // Ambil info tentang baris yang baru saja ditambahkan
            const updatedRange = appendResponse.data.updates.updatedRange;
            const rowIndex = this.getRowIndexFromRange(updatedRange);

            if (rowIndex !== null) {
                // Ambil ID sheet Transaksi
                const sheetsResponse = await this.sheets.spreadsheets.get({
                    spreadsheetId: groupConfig.spreadsheetId
                });

                const transaksiSheet = sheetsResponse.data.sheets.find(
                    sheet => sheet.properties.title === 'Transaksi'
                );

                if (transaksiSheet) {
                    await this.applyHyperlinkFormat(groupConfig.spreadsheetId, transaksiSheet.properties.sheetId, rowIndex);
                }
            }

            return rowIndex || 0;
        } catch (error) {
            Logger.error('Error menyimpan data penjualan:', error);
            throw error;
        }
    }

    // Menyimpan transaksi pembelian ke Google Sheets
    async savePembelian(data, groupConfig) {
        if (!this.isInitialized) await this.init();

        // Format tanggal dan nominal sebelum disimpan
        const formattedDate = this.formatDateForSheet(data.tanggal);
        const formattedNominal = this.formatNominalForSheet(data.nominal);

        // Pastikan waktu input memiliki username
        let waktuInput = data.waktuInput || '';
        // Jika pengirim ada dan waktu input tidak dimulai dengan username/tag
        if (data.pengirim && !waktuInput.startsWith(data.pengirim)) {
            waktuInput = `${data.pengirim} (${this.getCurrentTimeWIB()})`;
        }

        // Data untuk disimpan ke Google Sheets sesuai urutan kolom
        const values = [
            [
                formattedDate, // A: Tanggal
                'Pembelian', // B: Jenis Transaksi
                data.noInvoice, // C: No. Invoice
                data.keterangan, // D: Keterangan
                data.supplier || '', // E: Supplier
                data.customer || '', // F: Customer
                formattedNominal, // G: Nominal
                data.noRekening || '', // H: No. Rekening
                data.namaRekening || '', // I: Nama Rekening
                'Belum Lunas', // J: Status
                this.createLampiranLink(data.fileUrl), // K: Lampiran
                '', // L: Bukti Transfer
                waktuInput, // M: Waktu input
                '', // N: Waktu update
                data.pengirim || '', // O: Pengirim
                data.type === 'iklan' ? 1 : 0 // P: IsIklan
            ]
        ];

        try {
            // Simpan ke Google Sheets dengan format khusus
            const appendResponse = await this.sheets.spreadsheets.values.append({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P',
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                resource: { values }
            });

            // Ambil info tentang baris yang baru saja ditambahkan
            const updatedRange = appendResponse.data.updates.updatedRange;
            const rowIndex = this.getRowIndexFromRange(updatedRange);

            if (rowIndex !== null) {
                // Ambil ID sheet Transaksi
                const sheetsResponse = await this.sheets.spreadsheets.get({
                    spreadsheetId: groupConfig.spreadsheetId
                });

                const transaksiSheet = sheetsResponse.data.sheets.find(
                    sheet => sheet.properties.title === 'Transaksi'
                );

                if (transaksiSheet) {
                    await this.applyHyperlinkFormat(groupConfig.spreadsheetId, transaksiSheet.properties.sheetId, rowIndex);
                }
            }

            return rowIndex || 0;
        } catch (error) {
            Logger.error('Error menyimpan data pembelian:', error);
            throw error;
        }
    }

    // Mencari transaksi pembelian berdasarkan nomor invoice atau nomor VA
    async findPurchaseByInvoice(invoiceNumber, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P',
                valueRenderOption: 'FORMULA' // Mendapatkan formula seperti HYPERLINK bukan nilai yang ditampilkan
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            // Pastikan invoiceNumber dalam bentuk string untuk perbandingan yang konsisten
            const searchInvoice = invoiceNumber.toString().trim();

            // Cari baris yang sesuai dengan kriteria:
            // 1. Kolom B (index 1) harus 'Pembelian'
            // 2. Kolom C (index 2) harus sama dengan invoice atau VA yang dicari
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 8) {
                    const transactionType = row[1]; // Kolom B: Jenis Transaksi
                    // Konversi invoice dari sheet ke string dan bersihkan whitespace
                    const invoice = (row[2] || '').toString().trim(); // Kolom C: No. Invoice/VA

                    if (transactionType === 'Pembelian' && invoice === searchInvoice) {
                        return {
                            rowIndex: i + 1, // Index baris dalam spreadsheet (1-indexed)
                            data: row
                        };
                    }
                }
            }

            // Jika tidak ditemukan, kembalikan null
            return null;
        } catch (error) {
            Logger.error('Gagal mencari invoice/VA pembelian:', error);
            throw error;
        }
    }

    // Mencari apakah nomor invoice/VA sudah ada di spreadsheet (penjualan atau pembelian)
    async findInvoice(invoiceNumber, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P',
                valueRenderOption: 'FORMULA' // Mengambil formula HYPERLINK yang asli
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            // Pastikan invoiceNumber dalam bentuk string untuk perbandingan yang konsisten
            const searchInvoice = invoiceNumber.toString().trim();

            // Cari baris yang sesuai dengan kriteria:
            // Kolom C (index 2) harus sama dengan invoice/VA yang dicari (tanpa memperhatikan tipe transaksi)
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 3) {
                    // Konversi invoice dari sheet ke string dan bersihkan whitespace
                    const invoice = (row[2] || '').toString().trim();

                    // Bandingkan dalam bentuk string
                    if (invoice === searchInvoice) {
                        return {
                            rowIndex: i + 1, // Index baris dalam spreadsheet (1-indexed)
                            data: row
                        };
                    }
                }
            }

            // Jika tidak ditemukan, kembalikan null
            return null;
        } catch (error) {
            Logger.error('Gagal mencari invoice/VA:', error);
            throw error;
        }
    }

    // Mengupdate status pembelian menjadi Lunas
    async updatePurchaseStatus(invoiceNumber, fileUrl, updaterName, waktuUpdate, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            // Cari baris dengan invoice yang dimaksud
            const purchase = await this.findInvoice(invoiceNumber, groupConfig);
            if (!purchase) {
                throw new Error(`Tidak dapat menemukan transaksi dengan nomor: ${invoiceNumber}`);
            }

            // Periksa apakah ini pembelian (tidak dapat melunasi penjualan)
            if (purchase.data[1] !== 'Pembelian') {
                throw new Error(`Transaksi dengan nomor: ${invoiceNumber} bukan transaksi pembelian`);
            }

            // Periksa apakah sudah berstatus Lunas
            if (purchase.data[9] === 'Lunas') {
                throw new Error(`Transaksi dengan nomor: ${invoiceNumber} sudah berstatus LUNAS`);
            }

            // Update nilai di kolom tertentu
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: groupConfig.spreadsheetId,
                range: `Transaksi!A${purchase.rowIndex}:P${purchase.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [
                            purchase.data[0], // Tanggal
                            purchase.data[1], // Jenis transaksi
                            purchase.data[2], // No. Invoice
                            purchase.data[3], // Keterangan
                            purchase.data[4], // Supplier
                            purchase.data[5], // Customer
                            purchase.data[6], // Nominal
                            purchase.data[7], // No. Rekening
                            purchase.data[8], // Nama Rekening
                            'Lunas', // Status
                            purchase.data[10], // Lampiran
                            this.createBuktiTransferLink(fileUrl), // Bukti Transfer
                            purchase.data[12], // Waktu input
                            waktuUpdate, // Waktu update
                            purchase.data[14] || '', // Pengirim
                            purchase.data[15] || '0' // IsIklan
                        ]
                    ]
                }
            });

            // Update format untuk status "Lunas" (warna hijau)
            const sheetsResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: groupConfig.spreadsheetId
            });

            const transaksiSheet = sheetsResponse.data.sheets.find(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (transaksiSheet) {
                await this.applyHyperlinkFormat(
                    groupConfig.spreadsheetId,
                    transaksiSheet.properties.sheetId,
                    purchase.rowIndex,
                    false // false karena ini update baris yang sudah ada
                );
            }

            return purchase.rowIndex;
        } catch (error) {
            Logger.error(`Gagal mengupdate status transaksi: ${error.message}`);
            throw error;
        }
    }

    // Mengupdate status beberapa pembelian sekaligus menjadi Lunas
    async updatePurchaseStatusBatch(invoiceNumbers, updaterName, fileUrl = null, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            // Hasil dari operasi update untuk setiap invoice
            const results = {
                success: [],
                notFound: [],
                alreadyPaid: [],
                fileUrls: {} // Menyimpan URL bukti transfer per invoice
            };

            // Ambil waktu saat ini dalam format WIB
            const now = new Date();
            const optionsDate = {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };

            const tanggalBayar = new Intl.DateTimeFormat('id-ID', optionsDate).format(now);
            const waktuUpdate = `${updaterName} (${tanggalBayar})`;

            // Proses setiap invoice satu per satu
            for (const invoiceNumber of invoiceNumbers) {
                try {
                    // Cari baris dengan invoice yang dimaksud
                    const purchase = await this.findPurchaseByInvoice(invoiceNumber, groupConfig);

                    if (!purchase) {
                        results.notFound.push(invoiceNumber);
                        continue;
                    }

                    // Periksa apakah sudah berstatus Lunas
                    if (purchase.data[9] === 'Lunas') {
                        results.alreadyPaid.push(invoiceNumber);
                        continue;
                    }

                    // Siapkan data untuk kolom bukti transfer
                    let buktiTransferLink = purchase.data[11] || '';
                    if (fileUrl) {
                        buktiTransferLink = this.createBuktiTransferLink(fileUrl);
                        results.fileUrls[invoiceNumber] = fileUrl;
                    }

                    // Update nilai di kolom tertentu dengan menyesuaikan indeks kolom baru
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: groupConfig.spreadsheetId,
                        range: `Transaksi!A${purchase.rowIndex}:P${purchase.rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [
                                [
                                    purchase.data[0], // Tanggal
                                    purchase.data[1], // Jenis transaksi
                                    purchase.data[2], // No. Invoice
                                    purchase.data[3], // Keterangan
                                    purchase.data[4], // Supplier
                                    purchase.data[5], // Customer
                                    purchase.data[6], // Nominal
                                    purchase.data[7], // No. Rekening
                                    purchase.data[8], // Nama Rekening
                                    'Lunas', // Status
                                    purchase.data[10], // Lampiran
                                    buktiTransferLink, // Bukti transfer
                                    purchase.data[12], // Waktu input
                                    waktuUpdate, // Waktu update
                                    purchase.data[14] || '', // Pengirim
                                    purchase.data[15] || '0' // IsIklan
                                ]
                            ]
                        }
                    });

                    // Update format untuk status "Lunas" (warna hijau)
                    const sheetsResponse = await this.sheets.spreadsheets.get({
                        spreadsheetId: groupConfig.spreadsheetId
                    });

                    const transaksiSheet = sheetsResponse.data.sheets.find(
                        sheet => sheet.properties.title === 'Transaksi'
                    );

                    if (transaksiSheet) {
                        await this.applyHyperlinkFormat(
                            groupConfig.spreadsheetId,
                            transaksiSheet.properties.sheetId,
                            purchase.rowIndex,
                            false // false karena ini update baris yang sudah ada
                        );
                    }

                    // Catat hasil sukses
                    results.success.push(invoiceNumber);

                } catch (error) {
                    Logger.error(`Gagal mengupdate status pembelian ${invoiceNumber}: ${error.message}`);
                    // Lanjutkan ke invoice berikutnya
                }
            }

            return results;

        } catch (error) {
            Logger.error(`Gagal melakukan batch update status pembelian: ${error.message}`);
            throw error;
        }
    }

    // Mendapatkan seluruh transaksi dengan status Belum Lunas
    async getPendingInvoices(groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P'
            });

            if (!response.data.values) {
                return [];
            }

            const values = response.data.values;
            const pendingInvoices = [];

            // Mulai dari baris kedua (skip header)
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 14) {
                    const transactionType = row[1]; // Jenis Transaksi
                    const invoiceNumber = row[2]; // No. Invoice
                    const description = row[3]; // Keterangan
                    const supplier = row[4]; // Supplier
                    const status = row[9]; // Status
                    const date = row[0]; // Tanggal

                    // Pastikan nilai nominal valid dan dikonversi dengan benar
                    let nominal = row[6] || '0'; // Nominal

                    // Hapus karakter non-digit (kecuali titik)
                    nominal = nominal.toString().replace(/[^\d]/g, '');

                    // Konversi ke angka (atau 0 jika gagal)
                    const nominalValue = nominal ? parseInt(nominal) : 0;

                    // Hanya tambahkan transaksi pembelian dengan status "Belum Lunas"
                    if (transactionType === 'Pembelian' && status === 'Belum Lunas') {
                        pendingInvoices.push({
                            rowIndex: i + 1,
                            invoiceNumber,
                            description,
                            supplier,
                            date,
                            nominal: nominalValue
                        });
                    }
                }
            }

            return pendingInvoices;
        } catch (error) {
            Logger.error('Gagal mendapatkan daftar invoice yang belum lunas:', error);
            throw error;
        }
    }

    // Mencari transaksi iklan berdasarkan nomor VA yang sudah lunas
    async findPaidAdvertisement(invoiceNumber, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A:P'
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 14) {
                    const invoice = row[2]; // No. Invoice/VA
                    const status = row[9]; // Status
                    const keterangan = (row[3] || '').toLowerCase(); // Keterangan
                    const jenis = (row[1] || '').toLowerCase(); // Jenis Transaksi
                    const supplier = row[4] || ''; // Supplier

                    if (invoice === invoiceNumber && status === 'Lunas' &&
                        (keterangan.includes('iklan') || jenis === 'pembelian')) {
                        return {
                            rowIndex: i + 1,
                            data: row,
                            waktuUpdate: row[13] || '', // Waktu update
                            waktuInput: row[12] || '', // Waktu input
                            supplier: supplier,
                            nominal: parseInt(row[6] || '0').toLocaleString('id-ID') // Nominal
                        };
                    }
                }
            }

            return null;
        } catch (error) {
            Logger.error('Gagal mencari iklan berdasarkan VA:', error);
            throw error;
        }
    }

    // Mengupdate kolom lampiran untuk transaksi iklan yang sudah lunas
    async updateInvoiceIklanAttachment(invoiceNumber, fileUrl, groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            // Cari baris dengan invoice yang dimaksud
            const ad = await this.findPaidAdvertisement(invoiceNumber, groupConfig);
            if (!ad) {
                throw new Error(`Tidak dapat menemukan transaksi iklan dengan nomor VA: ${invoiceNumber} yang sudah lunas`);
            }

            // Update nilai di kolom lampiran (kolom K, index 10)
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: groupConfig.spreadsheetId,
                range: `Transaksi!K${ad.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [this.createLampiranLink(fileUrl)]
                    ]
                }
            });

            // Update format untuk kolom lampiran
            const sheetsResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: groupConfig.spreadsheetId
            });

            const transaksiSheet = sheetsResponse.data.sheets.find(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (transaksiSheet) {
                await this.applyHyperlinkFormat(
                    groupConfig.spreadsheetId,
                    transaksiSheet.properties.sheetId,
                    ad.rowIndex,
                    false // false karena ini update baris yang sudah ada
                );
            }

            return ad.rowIndex;
        } catch (error) {
            Logger.error(`Gagal mengupdate lampiran iklan: ${error.message}`);
            throw error;
        }
    }

    // Fungsi untuk memastikan header untuk kolom Waktu Update ada
    async ensureUpdateTimeHeaderExists(groupConfig) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: groupConfig.spreadsheetId,
                range: 'Transaksi!A1:N1'
            });

            if (!response.data.values || !response.data.values[0]) {
                return; // Tidak ada header sama sekali
            }

            const headers = response.data.values[0];

            // Jika kolom N, O, atau P belum ada atau bukan sesuai yang diharapkan
            if (headers.length < 16 ||
                (headers.length >= 14 && headers[13] !== 'Waktu update') ||
                (headers.length >= 15 && headers[14] !== 'Pengirim') ||
                (headers.length >= 16 && headers[15] !== 'IsIklan')) {

                // Update semua header yang diperlukan
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: groupConfig.spreadsheetId,
                    range: 'Transaksi!N1:P1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            ['Waktu update', 'Pengirim', 'IsIklan']
                        ]
                    }
                });

                Logger.info(`Header kolom N-P ditambahkan/diupdate ke spreadsheet grup ${groupConfig.name}`);
            }
        } catch (error) {
            Logger.error(`Gagal memeriksa header waktu update untuk grup ${groupConfig.name}:`, error);
            // Lanjutkan saja, tidak perlu gagal total jika hanya header yang bermasalah
        }
    }

    // Update fungsi setupSheetFormat untuk menyesuaikan dengan kolom yang benar
    async setupSheetFormat(groupConfig) {
        try {
            if (!this.isInitialized) await this.init();

            // Dapatkan ID sheet Transaksi
            const sheetsResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: groupConfig.spreadsheetId
            });

            const transaksiSheet = sheetsResponse.data.sheets.find(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (transaksiSheet) {
                const sheetId = transaksiSheet.properties.sheetId;

                // Update format kolom
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: groupConfig.spreadsheetId,
                    resource: {
                        requests: [
                            // Format kolom tanggal (kolom A) dengan format dd/MM/yyyy
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: sheetId,
                                        startColumnIndex: 0,
                                        endColumnIndex: 1
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            numberFormat: {
                                                type: 'DATE',
                                                pattern: 'dd/MM/yyyy'
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat.numberFormat'
                                }
                            },
                            // Format kolom nominal (kolom G)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: sheetId,
                                        startColumnIndex: 6,
                                        endColumnIndex: 7
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            numberFormat: {
                                                type: 'CURRENCY',
                                                pattern: '"Rp"#,##0'
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat.numberFormat'
                                }
                            }
                        ]
                    }
                });
            }
        } catch (error) {
            Logger.error('Error saat setup format sheet:', error);
            throw error;
        }
    }

    // Panggil fungsi ini saat inisialisasi
    async ensureTransactionSheetExists() {
        try {
            if (!this.isInitialized) await this.init();

            // Iterasi setiap grup
            for (const groupId in config.groups) {
                const groupConfig = config.groups[groupId];

                // Skip jika tidak ada spreadsheet ID
                if (!groupConfig.spreadsheetId) {
                    Logger.warning(`Spreadsheet ID tidak ditemukan untuk grup ${groupConfig.name}`);
                    continue;
                }

                try {
                    const response = await this.sheets.spreadsheets.get({
                        spreadsheetId: groupConfig.spreadsheetId
                    });

                    const sheetExists = response.data.sheets.some(
                        sheet => sheet.properties.title === 'Transaksi'
                    );

                    if (!sheetExists) {
                        Logger.error(`Sheet "Transaksi" tidak ditemukan di spreadsheet grup ${groupConfig.name}!`);
                        throw new Error(`Sheet "Transaksi" tidak ditemukan untuk grup ${groupConfig.name}`);
                    }

                    // Setup format sheet setelah memastikan sheet ada
                    await this.setupSheetFormat(groupConfig);

                    // Periksa dan pastikan header untuk kolom "Waktu Update" ada
                    await this.ensureUpdateTimeHeaderExists(groupConfig);

                    Logger.success(`Sheet Transaksi ditemukan dan format diatur untuk grup ${groupConfig.name}`);
                } catch (error) {
                    Logger.error(`Gagal memeriksa sheet Transaksi untuk grup ${groupConfig.name}:`, error);
                    throw error;
                }
            }

            return true;
        } catch (error) {
            Logger.error('Gagal memeriksa sheet Transaksi:', error);
            throw error;
        }
    }
}

module.exports = new SheetsService();