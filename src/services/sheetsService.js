const { google } = require('googleapis');
const config = require('../../config');
const authorize = require('../utils/googleAuth');
const { memoryCache, batchProcessor } = require('../utils/perfOptimizer');
const Logger = require('../utils/logger');

class SheetsService {
    constructor() {
        this.spreadsheetId = config.spreadsheetId;
        this.isInitialized = false;

        // Daftar operasi yang sedang berjalan
        this.pendingOperations = new Map();
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

    // Membuat hyperlink "Lihat Lampiran" dengan URL yang diberikan
    createLampiranLink(url) {
        // Jika tidak ada URL, kembalikan string kosong
        if (!url) return '';

        // Buat formula HYPERLINK untuk Google Sheets
        return `=HYPERLINK("${url}"; "Lihat Lampiran")`;
    }

    // Fungsi untuk membuat link bukti transfer
    createBuktiTransferLink(url) {
        // Jika tidak ada URL, kembalikan string kosong
        if (!url) return '';

        // Buat formula HYPERLINK untuk Google Sheets dengan teks "Bukti Transfer"
        return `=HYPERLINK("${url}"; "Bukti Transfer")`;
    }

    // Menyimpan transaksi penjualan ke Google Sheets
    async savePenjualan(data) {
        if (!this.isInitialized) await this.init();

        // Data untuk disimpan ke Google Sheets
        // Kolom: Tanggal, Jenis Transaksi, No. Invoice, Keterangan, Supplier, Customer, Nominal, Status, Lampiran, Pengirim, waktu input, waktu update
        const values = [
            [
                data.tanggal,
                'Penjualan',
                data.noInvoice,
                data.keterangan,
                data.supplier || '', // Kosong untuk penjualan
                data.customer || '',
                data.nominal,
                'Terjual', // Status diubah menjadi "Terjual" untuk penjualan
                this.createLampiranLink(data.fileUrl),
                '', // Kolom pengirim dikosongkan karena sudah digabung dengan waktu input
                data.waktuInput || new Date().toISOString(),
                '-' // waktu update tidak diperlukan untuk penjualan (menggunakan tanda -)
            ]
        ];

        // Buat unique key untuk operasi ini
        const operationKey = `penjualan_${data.tanggal}_${data.nominal}_${Date.now()}`;

        return new Promise((resolve, reject) => {
            // Tambahkan ke batch processor untuk meningkatkan performa
            batchProcessor.add({ values, range: 'Transaksi!A:L', data },
                async(item) => {
                    try {
                        // Simpan ke Google Sheets
                        const appendResponse = await this.sheets.spreadsheets.values.append({
                            spreadsheetId: this.spreadsheetId,
                            range: item.range,
                            valueInputOption: 'USER_ENTERED', // Penting untuk formula HYPERLINK
                            insertDataOption: 'INSERT_ROWS', // Tambahkan sebagai baris baru
                            resource: { values: item.values }
                        });

                        // Ambil info tentang baris yang baru saja ditambahkan
                        const updatedRange = appendResponse.data.updates.updatedRange;
                        const rowIndex = this.getRowIndexFromRange(updatedRange);

                        if (rowIndex !== null) {
                            // Ambil ID sheet Transaksi
                            const sheetsResponse = await this.sheets.spreadsheets.get({
                                spreadsheetId: this.spreadsheetId
                            });

                            const transaksiSheet = sheetsResponse.data.sheets.find(
                                sheet => sheet.properties.title === 'Transaksi'
                            );

                            if (transaksiSheet) {
                                const sheetId = transaksiSheet.properties.sheetId;

                                // Format styling untuk baris baru
                                await this.sheets.spreadsheets.batchUpdate({
                                    spreadsheetId: this.spreadsheetId,
                                    resource: {
                                        requests: [
                                            // Format semua sel di baris dengan teks hitam tanpa bold
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 0,
                                                        endColumnIndex: 12
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0,
                                                                    green: 0,
                                                                    blue: 0
                                                                },
                                                                bold: false
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            },
                                            // Format khusus untuk kolom Lampiran (index 8) dengan warna biru dan italic
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 8,
                                                        endColumnIndex: 9
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.17,
                                                                    green: 0.41,
                                                                    blue: 0.96
                                                                },
                                                                italic: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                                }
                                            },
                                            // Format kolom Nominal (index 6) dengan latar belakang hijau muda
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
                                                                green: 0.95,
                                                                blue: 0.85
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.backgroundColor'
                                                }
                                            },
                                            // Align left untuk kolom Keterangan (index 3)
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 3,
                                                        endColumnIndex: 4
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            horizontalAlignment: 'LEFT'
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.horizontalAlignment'
                                                }
                                            },
                                            // Format warna hijau untuk status Terjual (index 7)
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 7,
                                                        endColumnIndex: 8
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.13,
                                                                    green: 0.55,
                                                                    blue: 0.13
                                                                },
                                                                bold: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            }
                                        ]
                                    }
                                });
                            }
                        }

                        return rowIndex || 0;
                    } catch (error) {
                        Logger.error('Error menyimpan data penjualan:', error);
                        throw error;
                    }
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    // Menyimpan transaksi pembelian ke Google Sheets
    async savePembelian(data) {
        if (!this.isInitialized) await this.init();

        // Data untuk disimpan ke Google Sheets
        // Kolom: Tanggal, Jenis Transaksi, No. Invoice, Keterangan, Supplier, Customer, Nominal, Status, Lampiran, Pengirim, waktu input, waktu update
        const values = [
            [
                data.tanggal,
                'Pembelian',
                data.noInvoice,
                data.keterangan,
                data.supplier || '',
                data.customer || '', // Kosong untuk pembelian
                data.nominal,
                'Belum Lunas', // Status default untuk pembelian
                this.createLampiranLink(data.fileUrl), // Lampiran bukti pembelian disimpan seperti penjualan
                '', // Kolom pengirim dikosongkan karena sudah digabung dengan waktu input
                data.waktuInput || new Date().toISOString(),
                '' // waktu update (kosong untuk awal)
            ]
        ];

        // Buat unique key untuk operasi ini
        const operationKey = `pembelian_${data.tanggal}_${data.nominal}_${Date.now()}`;

        return new Promise((resolve, reject) => {
            // Tambahkan ke batch processor untuk meningkatkan performa
            batchProcessor.add({ values, range: 'Transaksi!A:L', data },
                async(item) => {
                    try {
                        // Simpan ke Google Sheets
                        const appendResponse = await this.sheets.spreadsheets.values.append({
                            spreadsheetId: this.spreadsheetId,
                            range: item.range,
                            valueInputOption: 'USER_ENTERED', // Penting untuk formula HYPERLINK
                            insertDataOption: 'INSERT_ROWS', // Tambahkan sebagai baris baru
                            resource: { values: item.values }
                        });

                        // Ambil info tentang baris yang baru saja ditambahkan
                        const updatedRange = appendResponse.data.updates.updatedRange;
                        const rowIndex = this.getRowIndexFromRange(updatedRange);

                        if (rowIndex !== null) {
                            // Ambil ID sheet Transaksi
                            const sheetsResponse = await this.sheets.spreadsheets.get({
                                spreadsheetId: this.spreadsheetId
                            });

                            const transaksiSheet = sheetsResponse.data.sheets.find(
                                sheet => sheet.properties.title === 'Transaksi'
                            );

                            if (transaksiSheet) {
                                const sheetId = transaksiSheet.properties.sheetId;

                                // Format styling untuk baris baru
                                await this.sheets.spreadsheets.batchUpdate({
                                    spreadsheetId: this.spreadsheetId,
                                    resource: {
                                        requests: [
                                            // Format semua sel di baris dengan teks hitam tanpa bold
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 0,
                                                        endColumnIndex: 12
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0,
                                                                    green: 0,
                                                                    blue: 0
                                                                },
                                                                bold: false
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            },
                                            // Format khusus untuk kolom Lampiran (index 8) dengan warna biru dan italic
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 8,
                                                        endColumnIndex: 9
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.17,
                                                                    green: 0.41,
                                                                    blue: 0.96
                                                                },
                                                                italic: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                                }
                                            },
                                            // Format kolom Nominal (index 6) dengan latar belakang hijau muda
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
                                                                green: 0.95,
                                                                blue: 0.85
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.backgroundColor'
                                                }
                                            },
                                            // Align left untuk kolom Keterangan (index 3)
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 3,
                                                        endColumnIndex: 4
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            horizontalAlignment: 'LEFT'
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.horizontalAlignment'
                                                }
                                            },
                                            // Format warna merah untuk status Belum Lunas (index 7)
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 7,
                                                        endColumnIndex: 8
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.8,
                                                                    green: 0.0,
                                                                    blue: 0.0
                                                                },
                                                                bold: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            }
                                        ]
                                    }
                                });
                            }
                        }

                        return rowIndex || 0;
                    } catch (error) {
                        Logger.error('Error menyimpan data pembelian:', error);
                        throw error;
                    }
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );
        });
    }

    // Menyimpan transaksi pembelian langsung dengan status lunas ke Google Sheets
    async savePembelianLunas(data) {
        if (!this.isInitialized) await this.init();

        // Format tanggal hari ini untuk digunakan sebagai tanggal pembayaran
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, '0');
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const yyyy = today.getFullYear();
        const tanggalPembayaran = dd + '/' + mm + '/' + yyyy;

        // Data untuk disimpan ke Google Sheets
        // Kolom: Tanggal (Pembayaran), Jenis Transaksi, No. Invoice, Keterangan, Supplier, Customer, Nominal, Status, Lampiran, Pengirim, waktu input, waktu update
        const values = [
            [
                tanggalPembayaran, // Menggunakan tanggal pembayaran sebagai tanggal transaksi
                'Pembelian',
                data.noInvoice,
                data.keterangan,
                data.supplier,
                data.customer || '', // Kosong untuk pembelian
                data.nominal,
                'Lunas', // Status langsung Lunas
                this.createLampiranLink(data.fileUrl),
                '', // Kolom pengirim dikosongkan karena sudah digabung dengan waktu input
                data.waktuInput || new Date().toISOString(),
                '-' // waktu update tidak diperlukan untuk pembelian lunas (menggunakan tanda -)
            ]
        ];

        // Buat unique key untuk operasi ini
        const operationKey = `pembelianlunas_${data.noInvoice}_${Date.now()}`;

        return new Promise((resolve, reject) => {
            // Tambahkan ke batch processor untuk meningkatkan performa
            batchProcessor.add({ values, range: 'Transaksi!A:L', data },
                async(item) => {
                    try {
                        // Simpan ke Google Sheets
                        const appendResponse = await this.sheets.spreadsheets.values.append({
                            spreadsheetId: this.spreadsheetId,
                            range: item.range,
                            valueInputOption: 'USER_ENTERED', // Penting untuk formula HYPERLINK
                            insertDataOption: 'INSERT_ROWS', // Tambahkan sebagai baris baru
                            resource: { values: item.values }
                        });

                        // Ambil info tentang baris yang baru saja ditambahkan
                        const updatedRange = appendResponse.data.updates.updatedRange;
                        const rowIndex = this.getRowIndexFromRange(updatedRange);

                        if (rowIndex !== null) {
                            // Ambil ID sheet Transaksi
                            const sheetsResponse = await this.sheets.spreadsheets.get({
                                spreadsheetId: this.spreadsheetId
                            });

                            const transaksiSheet = sheetsResponse.data.sheets.find(
                                sheet => sheet.properties.title === 'Transaksi'
                            );

                            if (transaksiSheet) {
                                const sheetId = transaksiSheet.properties.sheetId;

                                // Format styling untuk baris baru
                                await this.sheets.spreadsheets.batchUpdate({
                                    spreadsheetId: this.spreadsheetId,
                                    resource: {
                                        requests: [
                                            // Format semua sel di baris dengan teks hitam tanpa bold
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 0,
                                                        endColumnIndex: 12
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0,
                                                                    green: 0,
                                                                    blue: 0
                                                                },
                                                                bold: false
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            },
                                            // Format khusus untuk kolom Lampiran (index 8) dengan warna biru dan italic
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 8,
                                                        endColumnIndex: 9
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.17,
                                                                    green: 0.41,
                                                                    blue: 0.96
                                                                },
                                                                italic: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                                }
                                            },
                                            // Format kolom Nominal (index 6) dengan latar belakang hijau tua (untuk pembelian lunas)
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
                                                                red: 0.56,
                                                                green: 0.76,
                                                                blue: 0.56
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.backgroundColor'
                                                }
                                            },
                                            // Format kolom Status (index 7) dengan warna hijau dan bold
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 7,
                                                        endColumnIndex: 8
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            textFormat: {
                                                                foregroundColor: {
                                                                    red: 0.13,
                                                                    green: 0.55,
                                                                    blue: 0.13
                                                                },
                                                                bold: true
                                                            }
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                                }
                                            },
                                            // Align left untuk kolom Keterangan (index 3)
                                            {
                                                repeatCell: {
                                                    range: {
                                                        sheetId: sheetId,
                                                        startRowIndex: rowIndex - 1,
                                                        endRowIndex: rowIndex,
                                                        startColumnIndex: 3,
                                                        endColumnIndex: 4
                                                    },
                                                    cell: {
                                                        userEnteredFormat: {
                                                            horizontalAlignment: 'LEFT'
                                                        }
                                                    },
                                                    fields: 'userEnteredFormat.horizontalAlignment'
                                                }
                                            }
                                        ]
                                    }
                                });
                            }
                        }

                        // Cache hasil operasi
                        const result = {
                            success: true,
                            message: 'Transaksi pembelian lunas berhasil disimpan',
                            row: rowIndex
                        };

                        // Selesaikan promise
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                },
                operationKey
            );
        });
    }

    // Helper method untuk mengekstrak nomor baris dari range
    getRowIndexFromRange(range) {
        try {
            if (!range) return null;

            // Range biasanya dalam format seperti "Transaksi!A2:J2"
            const match = range.match(/[A-Z]+(\d+):/);
            if (match && match[1]) {
                return parseInt(match[1]);
            }

            // Coba format alternatif seperti "Transaksi!A2"
            const altMatch = range.match(/[A-Z]+(\d+)$/);
            if (altMatch && altMatch[1]) {
                return parseInt(altMatch[1]);
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    // Periksa apakah sheet Transaksi sudah ada
    async ensureTransactionSheetExists() {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const sheetExists = response.data.sheets.some(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (!sheetExists) {
                Logger.error('Sheet "Transaksi" tidak ditemukan di spreadsheet!');
                throw new Error('Sheet "Transaksi" tidak ditemukan');
            }

            // Periksa dan pastikan header untuk kolom "Waktu Update" ada
            await this.ensureUpdateTimeHeaderExists();

            return true;
        } catch (error) {
            Logger.error('Gagal memeriksa sheet Transaksi', error);
            throw error;
        }
    }

    // Memastikan header untuk kolom Waktu Update ada
    async ensureUpdateTimeHeaderExists() {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Transaksi!A1:L1'
            });

            if (!response.data.values || !response.data.values[0]) {
                return; // Tidak ada header sama sekali
            }

            const headers = response.data.values[0];

            // Jika kolom L belum ada atau bukan "Waktu Update"
            if (headers.length < 12 || (headers.length >= 12 && headers[11] !== 'waktu update')) {
                // Tambahkan header "waktu update" di kolom L
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Transaksi!L1',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [
                            ['waktu update']
                        ]
                    }
                });

                Logger.info('Header "waktu update" ditambahkan ke spreadsheet');
            }
        } catch (error) {
            Logger.error('Gagal memeriksa header waktu update', error);
            // Lanjutkan saja, tidak perlu gagal total jika hanya header yang bermasalah
        }
    }

    // Mencari baris transaksi pembelian berdasarkan nomor invoice atau nomor VA
    async findPurchaseByInvoice(invoiceNumber) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Transaksi!A:L',
                valueRenderOption: 'FORMULA' // Mendapatkan formula seperti HYPERLINK bukan nilai yang ditampilkan
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            // Cari baris yang sesuai dengan kriteria:
            // 1. Kolom B (index 1) harus 'Pembelian'
            // 2. Kolom C (index 2) harus sama dengan invoice atau VA yang dicari
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 8) {
                    const transactionType = row[1]; // Kolom B: Jenis Transaksi
                    const invoice = row[2]; // Kolom C: No. Invoice/VA

                    if (transactionType === 'Pembelian' && invoice === invoiceNumber) {
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
    async findInvoice(invoiceNumber) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Transaksi!A:L'
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            // Cari baris yang sesuai dengan kriteria:
            // Kolom C (index 2) harus sama dengan invoice/VA yang dicari (tanpa memperhatikan tipe transaksi)
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 3) {
                    const invoice = row[2]; // Kolom C: No. Invoice/VA

                    if (invoice === invoiceNumber) {
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
    async updatePurchaseStatus(invoiceNumber, fileUrl, updaterName, waktuUpdate) {
        try {
            if (!this.isInitialized) await this.init();

            // Cari baris dengan invoice yang dimaksud
            const purchase = await this.findInvoice(invoiceNumber);
            if (!purchase) {
                throw new Error(`Tidak dapat menemukan transaksi dengan nomor: ${invoiceNumber}`);
            }

            // Periksa apakah ini pembelian (tidak dapat melunasi penjualan)
            if (purchase.data[1] !== 'Pembelian') {
                throw new Error(`Transaksi dengan nomor: ${invoiceNumber} bukan transaksi pembelian`);
            }

            // Periksa apakah sudah berstatus Lunas
            if (purchase.data[7] === 'Lunas') {
                throw new Error(`Transaksi dengan nomor: ${invoiceNumber} sudah berstatus LUNAS`);
            }

            // Ambil waktu saat ini dalam format WIB untuk tanggal update
            const now = new Date();
            const optionsDateTime = {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };

            const waktuBayarLengkap = new Intl.DateTimeFormat('id-ID', optionsDateTime).format(now);

            // Update nilai di kolom tertentu:
            // PERUBAHAN: Tanggal asli tetap dipertahankan (tidak diubah)
            // Kolom H (index 7): Status diubah menjadi "Lunas"
            // Kolom I (index 8): Lampiran bukti pembelian (tetap ada)
            // Kolom J (index 9): Bukti Transfer (Hyperlink dengan teks "Bukti Transfer")
            // Kolom K (index 10): Waktu input asli tetap dipertahankan
            // Kolom L (index 11): Waktu update dengan informasi pengirim
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `Transaksi!A${purchase.rowIndex}:L${purchase.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [
                            purchase.data[0], // Tanggal asli dipertahankan (tidak diubah)
                            purchase.data[1], // Jenis transaksi
                            purchase.data[2], // No. Invoice
                            purchase.data[3], // Keterangan
                            purchase.data[4], // Supplier
                            purchase.data[5], // Customer
                            purchase.data[6], // Nominal
                            'Lunas', // Status
                            purchase.data[8], // Lampiran bukti pembelian tetap dipertahankan
                            this.createBuktiTransferLink(fileUrl), // Bukti Transfer dengan format hyperlink "Bukti Transfer"
                            purchase.data[10] || '', // Waktu input asli tetap dipertahankan
                            waktuUpdate // Waktu update dengan informasi pengirim
                        ]
                    ]
                }
            });

            // Update format untuk status "Lunas" (warna hijau)
            const sheetsResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const transaksiSheet = sheetsResponse.data.sheets.find(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (transaksiSheet) {
                const sheetId = transaksiSheet.properties.sheetId;
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [
                            // Format khusus untuk kolom Lampiran (index 8) dengan warna biru dan italic
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: sheetId,
                                        startRowIndex: purchase.rowIndex - 1,
                                        endRowIndex: purchase.rowIndex,
                                        startColumnIndex: 8,
                                        endColumnIndex: 9
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                foregroundColor: {
                                                    red: 0.17,
                                                    green: 0.41,
                                                    blue: 0.96
                                                },
                                                italic: true
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                }
                            },
                            // Format khusus untuk kolom Bukti Transfer (index 9) dengan warna biru dan italic
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: sheetId,
                                        startRowIndex: purchase.rowIndex - 1,
                                        endRowIndex: purchase.rowIndex,
                                        startColumnIndex: 9,
                                        endColumnIndex: 10
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                foregroundColor: {
                                                    red: 0.17,
                                                    green: 0.41,
                                                    blue: 0.96
                                                },
                                                italic: true
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                }
                            },
                            // Format warna hijau untuk status Lunas (index 7)
                            {
                                repeatCell: {
                                    range: {
                                        sheetId: sheetId,
                                        startRowIndex: purchase.rowIndex - 1,
                                        endRowIndex: purchase.rowIndex,
                                        startColumnIndex: 7,
                                        endColumnIndex: 8
                                    },
                                    cell: {
                                        userEnteredFormat: {
                                            textFormat: {
                                                foregroundColor: {
                                                    red: 0.13,
                                                    green: 0.55,
                                                    blue: 0.13
                                                },
                                                bold: true
                                            }
                                        }
                                    },
                                    fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                }
                            }
                        ]
                    }
                });
            }

            return purchase.rowIndex;
        } catch (error) {
            Logger.error(`Gagal mengupdate status transaksi: ${error.message}`);
            throw error;
        }
    }

    // Mengupdate status beberapa pembelian sekaligus menjadi Lunas
    async updatePurchaseStatusBatch(invoiceNumbers, updaterName, fileUrl = null) {
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
                    const purchase = await this.findPurchaseByInvoice(invoiceNumber);

                    if (!purchase) {
                        results.notFound.push(invoiceNumber);
                        continue;
                    }

                    // Periksa apakah sudah berstatus Lunas
                    if (purchase.data[7] === 'Lunas') {
                        results.alreadyPaid.push(invoiceNumber);
                        continue;
                    }

                    // Siapkan data untuk kolom bukti transfer
                    let buktiTransferLink = purchase.data[9] || '';
                    if (fileUrl) {
                        buktiTransferLink = this.createBuktiTransferLink(fileUrl);
                        // Simpan URL untuk digunakan di luar fungsi
                        results.fileUrls[invoiceNumber] = fileUrl;
                    }

                    // Update nilai di kolom tertentu:
                    // PERUBAHAN: Tanggal asli tetap dipertahankan (tidak diubah)
                    // Kolom H (index 7): Status diubah menjadi "Lunas"
                    // Kolom J (index 9): Link ke bukti transfer jika ada
                    // Kolom L (index 11): Waktu update dengan informasi pengirim
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `Transaksi!A${purchase.rowIndex}:L${purchase.rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [
                                [
                                    purchase.data[0], // Tanggal asli dipertahankan (tidak diubah)
                                    purchase.data[1], // Jenis transaksi
                                    purchase.data[2], // No. Invoice
                                    purchase.data[3], // Keterangan
                                    purchase.data[4], // Supplier
                                    purchase.data[5], // Customer
                                    purchase.data[6], // Nominal
                                    'Lunas', // Status
                                    purchase.data[8], // Lampiran (tetap sama)
                                    buktiTransferLink, // Kolom bukti transfer (jika ada)
                                    purchase.data[10] || '', // Waktu input asli tetap dipertahankan
                                    waktuUpdate // Waktu update dengan informasi pengirim
                                ]
                            ]
                        }
                    });

                    // Update format untuk status "Lunas" (warna hijau)
                    const sheetsResponse = await this.sheets.spreadsheets.get({
                        spreadsheetId: this.spreadsheetId
                    });

                    const transaksiSheet = sheetsResponse.data.sheets.find(
                        sheet => sheet.properties.title === 'Transaksi'
                    );

                    if (transaksiSheet) {
                        const sheetId = transaksiSheet.properties.sheetId;
                        await this.sheets.spreadsheets.batchUpdate({
                            spreadsheetId: this.spreadsheetId,
                            resource: {
                                requests: [
                                    // Format warna hijau untuk status Lunas (index 7)
                                    {
                                        repeatCell: {
                                            range: {
                                                sheetId: sheetId,
                                                startRowIndex: purchase.rowIndex - 1,
                                                endRowIndex: purchase.rowIndex,
                                                startColumnIndex: 7,
                                                endColumnIndex: 8
                                            },
                                            cell: {
                                                userEnteredFormat: {
                                                    textFormat: {
                                                        foregroundColor: {
                                                            red: 0.13,
                                                            green: 0.55,
                                                            blue: 0.13
                                                        },
                                                        bold: true
                                                    }
                                                }
                                            },
                                            fields: 'userEnteredFormat.textFormat(foregroundColor,bold)'
                                        }
                                    },
                                    // Format khusus untuk kolom Lampiran (index 8) dengan warna biru dan italic
                                    {
                                        repeatCell: {
                                            range: {
                                                sheetId: sheetId,
                                                startRowIndex: purchase.rowIndex - 1,
                                                endRowIndex: purchase.rowIndex,
                                                startColumnIndex: 8,
                                                endColumnIndex: 9
                                            },
                                            cell: {
                                                userEnteredFormat: {
                                                    textFormat: {
                                                        foregroundColor: {
                                                            red: 0.17,
                                                            green: 0.41,
                                                            blue: 0.96
                                                        },
                                                        italic: true
                                                    }
                                                }
                                            },
                                            fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                        }
                                    },
                                    // Format khusus untuk kolom Bukti Transfer (index 9) dengan warna biru dan italic
                                    {
                                        repeatCell: {
                                            range: {
                                                sheetId: sheetId,
                                                startRowIndex: purchase.rowIndex - 1,
                                                endRowIndex: purchase.rowIndex,
                                                startColumnIndex: 9,
                                                endColumnIndex: 10
                                            },
                                            cell: {
                                                userEnteredFormat: {
                                                    textFormat: {
                                                        foregroundColor: {
                                                            red: 0.17,
                                                            green: 0.41,
                                                            blue: 0.96
                                                        },
                                                        italic: true
                                                    }
                                                }
                                            },
                                            fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                                        }
                                    }
                                ]
                            }
                        });
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
    async getPendingInvoices() {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Transaksi!A:L'
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
                if (row && row.length >= 8) {
                    const transactionType = row[1]; // Kolom B: Jenis Transaksi
                    const invoiceNumber = row[2]; // Kolom C: No. Invoice
                    const description = row[3]; // Kolom D: Keterangan
                    const supplier = row[4]; // Kolom E: Supplier
                    const status = row[7]; // Kolom H: Status
                    const date = row[0]; // Kolom A: Tanggal

                    // Pastikan nilai nominal valid dan dikonversi dengan benar
                    let nominal = row[6] || '0'; // Kolom G: Nominal

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
    async findPaidAdvertisement(invoiceNumber) {
        try {
            if (!this.isInitialized) await this.init();

            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Transaksi!A:L'
            });

            if (!response.data.values) {
                return null;
            }

            const values = response.data.values;

            // Cari baris yang sesuai dengan kriteria:
            // 1. Kolom C (index 2) harus sama dengan invoice/VA yang dicari
            // 2. Status (index 7) harus "Lunas"
            // 3. Keterangan (index 3) harus mengandung kata "iklan" (case insensitive)
            for (let i = 1; i < values.length; i++) {
                const row = values[i];
                // Pastikan baris memiliki cukup kolom
                if (row && row.length >= 8) {
                    const invoice = row[2]; // Kolom C: No. Invoice/VA
                    const status = row[7]; // Kolom H: Status
                    const keterangan = (row[3] || '').toLowerCase(); // Kolom D: Keterangan
                    const jenis = (row[1] || '').toLowerCase(); // Kolom B: Jenis Transaksi
                    const supplier = row[4] || ''; // Kolom E: Supplier

                    if (invoice === invoiceNumber && status === 'Lunas' &&
                        (keterangan.includes('iklan') || jenis === 'pembelian')) {
                        // Transaksi iklan yang sudah lunas ditemukan
                        return {
                            rowIndex: i + 1,
                            data: row,
                            waktuUpdate: row[11] || '', // Kolom L: waktu update
                            waktuInput: row[10] || '', // Kolom K: waktu input
                            supplier: supplier,
                            nominal: parseInt(row[6] || '0').toLocaleString('id-ID')
                        };
                    }
                }
            }

            // Jika tidak ditemukan, kembalikan null
            return null;
        } catch (error) {
            Logger.error('Gagal mencari iklan berdasarkan VA:', error);
            throw error;
        }
    }

    // Mengupdate kolom lampiran untuk transaksi iklan yang sudah lunas
    async updateInvoiceIklanAttachment(invoiceNumber, fileUrl) {
        try {
            if (!this.isInitialized) await this.init();

            // Cari baris dengan invoice yang dimaksud
            const ad = await this.findPaidAdvertisement(invoiceNumber);
            if (!ad) {
                throw new Error(`Tidak dapat menemukan transaksi iklan dengan nomor VA: ${invoiceNumber} yang sudah lunas`);
            }

            // Update nilai di kolom lampiran (kolom I, index 8)
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `Transaksi!I${ad.rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [
                        [this.createLampiranLink(fileUrl)]
                    ]
                }
            });

            // Update format untuk kolom lampiran
            const sheetsResponse = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const transaksiSheet = sheetsResponse.data.sheets.find(
                sheet => sheet.properties.title === 'Transaksi'
            );

            if (transaksiSheet) {
                const sheetId = transaksiSheet.properties.sheetId;

                // Format lampiran dengan warna biru dan italic
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: ad.rowIndex - 1,
                                    endRowIndex: ad.rowIndex,
                                    startColumnIndex: 8,
                                    endColumnIndex: 9
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: {
                                            foregroundColor: {
                                                red: 0.17,
                                                green: 0.41,
                                                blue: 0.96
                                            },
                                            italic: true
                                        }
                                    }
                                },
                                fields: 'userEnteredFormat.textFormat(foregroundColor,italic)'
                            }
                        }]
                    }
                });
            }

            return ad.rowIndex;
        } catch (error) {
            Logger.error(`Gagal mengupdate lampiran iklan: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new SheetsService();