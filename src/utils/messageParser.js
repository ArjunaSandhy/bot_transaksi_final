/**
 * Fungsi untuk memparse pesan dari pengguna
 * Format pesan yang didukung:
 * 
 * /penjualan
 * Tanggal: DD/MM/YYYY
 * No. INV: [nomor invoice]
 * Keterangan: [deskripsi]
 * Customer: [nama customer]
 * Nominal: [jumlah]
 * 
 * atau
 * 
 * /pembelian
 * Tanggal: DD/MM/YYYY
 * No. INV: [nomor invoice]
 * Keterangan: [deskripsi]
 * Supplier: [nama supplier]
 * Nominal: [jumlah]
 * 
 * atau
 * 
 * /pembelianlunas
 * Tanggal: DD/MM/YYYY
 * No. INV: [nomor invoice]
 * Keterangan: [deskripsi]
 * Supplier: [nama supplier]
 * Nominal: [jumlah]
 * 
 * atau
 * 
 * /iklan
 * Tanggal: DD/MM/YYYY
 * No. VA: [nomor virtual account]
 * Keterangan: [deskripsi]
 * Supplier: [nama supplier]
 * Nominal: [jumlah]
 * 
 * atau
 * 
 * /invoiceiklan
 * No. VA: [nomor virtual account]
 */

// Fungsi untuk mendapatkan waktu saat ini dalam format WIB
function getCurrentTimeWIB() {
    const now = new Date();

    // Konversi ke timezone Asia/Jakarta (WIB/GMT+7)
    const options = {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };

    // Format: DD/MM/YYYY HH:MM:SS
    return new Intl.DateTimeFormat('id-ID', options).format(now);
}

/**
 * Fungsi untuk normalisasi format rupiah ke angka
 * Mendukung format:
 * - Rp 1.000.000
 * - Rp1.000.000
 * - Rp 1,000,000
 * - Rp 1.000.000,00
 * - Rp. 1.000.000
 * - IDR 1.000.000
 * - 1.000.000
 * - 1000000
 * - 1,000,000
 * - 1jt
 * - 1.5jt
 * - 1,5jt
 * - 1rb
 * - 1.5rb
 * - 1,5rb
 * - 1M
 * - 1.5M
 * - 1,5M
 * - dll.
 */
function normalizeRupiah(rupiahStr) {
    if (!rupiahStr) return '';

    // Hapus simbol mata uang dan spasi
    let normalized = rupiahStr.trim().replace(/^[Rr][Pp]\.?\s?/i, '').replace(/^IDR\s?/i, '');

    // Cek format singkat untuk juta (jt/j) atau ribu (rb/r) atau milyar (M/m)

    // Format juta: 1jt, 1.5jt, 1,5jt, 1j, 1.5j, 1,5j
    if (/^\d+[\.,]?\d*(?:jt|j)$/i.test(normalized)) {
        // Extract angka
        normalized = normalized.replace(/(?:jt|j)$/i, '');
        // Konversi ke format angka dengan koma sebagai desimal
        normalized = normalized.replace(/\./g, ',');
        // Pastikan hanya ada satu koma
        const commas = normalized.match(/,/g);
        if (commas && commas.length > 1) {
            normalized = normalized.replace(/,/g, function(match, offset, string) {
                return (offset === normalized.lastIndexOf(',')) ? '.' : '';
            });
        }
        // Konversi ke juta
        const numValue = parseFloat(normalized.replace(',', '.'));
        return String(numValue * 1000000);
    }

    // Format ribu: 1rb, 1.5rb, 1,5rb, 1r, 1.5r, 1,5r
    if (/^\d+[\.,]?\d*(?:rb|r)$/i.test(normalized)) {
        normalized = normalized.replace(/(?:rb|r)$/i, '');
        // Konversi ke format angka dengan koma sebagai desimal
        normalized = normalized.replace(/\./g, ',');
        // Pastikan hanya ada satu koma
        const commas = normalized.match(/,/g);
        if (commas && commas.length > 1) {
            normalized = normalized.replace(/,/g, function(match, offset, string) {
                return (offset === normalized.lastIndexOf(',')) ? '.' : '';
            });
        }
        // Konversi ke ribu
        const numValue = parseFloat(normalized.replace(',', '.'));
        return String(numValue * 1000);
    }

    // Format milyar: 1M, 1.5M, 1,5M, 1m, 1.5m, 1,5m
    if (/^\d+[\.,]?\d*[Mm]$/i.test(normalized)) {
        normalized = normalized.replace(/[Mm]$/i, '');
        // Konversi ke format angka dengan koma sebagai desimal
        normalized = normalized.replace(/\./g, ',');
        // Pastikan hanya ada satu koma
        const commas = normalized.match(/,/g);
        if (commas && commas.length > 1) {
            normalized = normalized.replace(/,/g, function(match, offset, string) {
                return (offset === normalized.lastIndexOf(',')) ? '.' : '';
            });
        }
        // Konversi ke milyar
        const numValue = parseFloat(normalized.replace(',', '.'));
        return String(numValue * 1000000000);
    }

    // Hapus semua karakter selain angka, titik, dan koma
    normalized = normalized.replace(/[^\d.,]/g, '');

    // Jika format Indonesia (1.000.000,00)
    if (normalized.indexOf(',') > -1 && normalized.indexOf('.') > -1) {
        // Hapus semua titik
        normalized = normalized.replace(/\./g, '');
        // Ganti koma dengan titik (untuk handling desimal)
        normalized = normalized.replace(',', '.');
    }
    // Jika format dengan titik sebagai pemisah ribuan (1.000.000)
    else if (normalized.split('.').length > 1 && normalized.indexOf(',') === -1) {
        // Cek apakah titik digunakan sebagai pemisah ribuan
        if (normalized.split('.').pop().length === 3 || normalized.split('.').length > 2) {
            // Hapus semua titik karena ini pemisah ribuan
            normalized = normalized.replace(/\./g, '');
        }
    }
    // Jika format dengan koma sebagai pemisah ribuan (1,000,000)
    else if (normalized.split(',').length > 1 && normalized.indexOf('.') === -1) {
        // Cek apakah koma digunakan sebagai pemisah ribuan
        if (normalized.split(',').pop().length === 3 || normalized.split(',').length > 2) {
            // Hapus semua koma karena ini pemisah ribuan
            normalized = normalized.replace(/,/g, '');
        } else {
            // Koma digunakan sebagai desimal
            normalized = normalized.replace(',', '.');
        }
    }

    // Hapus bagian desimal jika ada
    if (normalized.indexOf('.') > -1) {
        normalized = normalized.split('.')[0];
    }

    // Validasi hasil akhir
    if (isNaN(normalized) || normalized === '') {
        return '';
    }

    return normalized;
}

/**
 * Memeriksa apakah string tanggal dalam format DD/MM/YYYY yang valid
 * @param {string} dateStr - String tanggal untuk divalidasi
 * @returns {Object} - Objek dengan status valid dan pesan error jika tidak valid
 */
function validateDateFormat(dateStr) {
    // Memeriksa format dasar DD/MM/YYYY
    if (!dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        return {
            valid: false,
            message: 'Format tanggal harus DD/MM/YYYY'
        };
    }

    // Ekstrak komponen tanggal
    const parts = dateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Bulan dalam JS 0-indexed
    const year = parseInt(parts[2], 10);

    // Validasi range (tanggal: 1-31, bulan: 1-12, tahun: > 2000)
    if (day < 1 || day > 31) {
        return {
            valid: false,
            message: 'Tanggal harus antara 1-31'
        };
    }

    if (month < 0 || month > 11) {
        return {
            valid: false,
            message: 'Bulan harus antara 1-12'
        };
    }

    if (year < 2000) {
        return {
            valid: false,
            message: 'Tahun tidak valid (harus >= 2000)'
        };
    }

    // Buat objek Date dan validasi tanggal
    const date = new Date(year, month, day);

    // Cek apakah tanggal valid (bulan dan hari valid)
    if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
        return {
            valid: false,
            message: 'Tanggal tidak valid untuk bulan yang dipilih'
        };
    }

    return {
        valid: true
    };
}

/**
 * Validasi nominal dan berikan pesan error spesifik
 * @param {string} nominalStr - String nominal untuk divalidasi
 * @returns {Object} - Objek dengan nominal yang ternormalisasi dan status error jika ada
 */
function validateNominal(nominalStr) {
    if (!nominalStr || nominalStr.trim() === '') {
        return {
            valid: false,
            message: 'Nominal tidak boleh kosong'
        };
    }

    const normalized = normalizeRupiah(nominalStr);

    if (!normalized || normalized === '' || normalized === '0') {
        return {
            valid: false,
            message: 'Format nominal tidak valid'
        };
    }

    // Validasi nominal harus angka positif
    const numValue = parseFloat(normalized);
    if (isNaN(numValue) || numValue <= 0) {
        return {
            valid: false,
            message: 'Nominal harus lebih dari 0'
        };
    }

    return {
        valid: true,
        value: normalized
    };
}

function parseMessage(text) {
    if (!text) return null;

    // Cek jenis transaksi dengan lebih akurat
    let type;
    // Periksa apakah perintah adalah '/penjualan' atau '/pembelian' atau '/pembelianlunas' atau '/iklan'
    // dengan match yang lebih longgar untuk menangkap berbagai format
    const penjualanMatch = text.match(/^\/penjualan(?:\s|\n|\r\n|$)/i);
    const pembelianMatch = text.match(/^\/pembelian(?:\s|\n|\r\n|$)/i);
    const pembelianLunasMatch = text.match(/^\/pembelianlunas(?:\s|\n|\r\n|$)/i);
    const iklanMatch = text.match(/^\/iklan(?:\s|\n|\r\n|$)/i);

    if (penjualanMatch) {
        type = 'penjualan';
    } else if (pembelianLunasMatch) {
        type = 'pembelianlunas';
    } else if (pembelianMatch) {
        type = 'pembelian';
    } else if (iklanMatch) {
        type = 'iklan';
    } else {
        return null; // Bukan format yang valid
    }

    // Pastikan bahwa semua field dicari dalam format yang benar
    try {
        // Buat objek untuk menyimpan data
        const data = {
            type,
            waktuInput: getCurrentTimeWIB()
        };

        // Array untuk menyimpan field yang kosong atau error
        const missingFields = [];
        const errorMessages = {};

        // Ambil semua baris dari text
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        // Objek untuk melacak field yang sudah ditemukan
        const foundFields = {
            'tanggal': false,
            'noInvoice': false,
            'noVA': false,
            'keterangan': false,
            'customer': false,
            'supplier': false,
            'nominal': false
        };

        // Identifikasi setiap baris dan pastikan sebagai field yang tepat
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Lewati baris pertama (command)
            if (i === 0 && (line.startsWith('/penjualan') || line.startsWith('/pembelian') || line.startsWith('/pembelianlunas') || line.startsWith('/iklan'))) {
                continue;
            }

            // Cek format setiap field
            if (line.match(/^Tanggal\s*:/i)) {
                const value = line.replace(/^Tanggal\s*:/i, '').trim();
                if (value) {
                    // Validasi format tanggal
                    const dateValidation = validateDateFormat(value);
                    if (dateValidation.valid) {
                        data.tanggal = value;
                        foundFields.tanggal = true;
                    } else {
                        missingFields.push('Tanggal');
                        errorMessages['Tanggal'] = dateValidation.message;
                    }
                } else {
                    missingFields.push('Tanggal');
                }
            } else if (line.match(/^No\.\s*INV\s*:/i)) {
                // Khusus /iklan tidak menggunakan No. INV
                if (type === 'iklan') continue;

                const value = line.replace(/^No\.\s*INV\s*:/i, '').trim();
                if (value) {
                    data.noInvoice = value;
                    foundFields.noInvoice = true;
                } else {
                    missingFields.push('No. INV');
                }
            } else if (line.match(/^No\.\s*VA\s*:/i)) {
                // Khusus /iklan menggunakan No. VA
                if (type !== 'iklan') continue;

                const value = line.replace(/^No\.\s*VA\s*:/i, '').trim();
                if (value) {
                    data.noInvoice = value; // Tetap simpan di field noInvoice untuk kompatibilitas
                    foundFields.noInvoice = true;
                    foundFields.noVA = true;
                } else {
                    missingFields.push('No. VA');
                }
            } else if (line.match(/^Keterangan\s*:/i)) {
                const value = line.replace(/^Keterangan\s*:/i, '').trim();
                if (value) {
                    data.keterangan = value;
                    foundFields.keterangan = true;
                } else {
                    missingFields.push('Keterangan');
                }
            } else if (line.match(/^Customer\s*:/i)) {
                if (type !== 'penjualan') continue;

                const value = line.replace(/^Customer\s*:/i, '').trim();
                if (value) {
                    data.customer = value;
                    foundFields.customer = true;
                } else {
                    missingFields.push('Customer');
                }
            } else if (line.match(/^Supplier\s*:/i)) {
                if (type === 'penjualan') continue;

                const value = line.replace(/^Supplier\s*:/i, '').trim();
                if (value) {
                    data.supplier = value;
                    foundFields.supplier = true;
                } else {
                    missingFields.push('Supplier');
                }
            } else if (line.match(/^Nominal\s*:/i)) {
                const value = line.replace(/^Nominal\s*:/i, '').trim();
                if (value) {
                    const nominalValidation = validateNominal(value);
                    if (nominalValidation.valid) {
                        data.nominal = nominalValidation.value;
                        foundFields.nominal = true;
                    } else {
                        missingFields.push('Nominal');
                        errorMessages['Nominal'] = nominalValidation.message;
                    }
                } else {
                    missingFields.push('Nominal');
                }
            }
        }

        // Periksa field yang belum ditemukan
        if (type === 'penjualan') {
            if (!foundFields.tanggal && !missingFields.includes('Tanggal')) missingFields.push('Tanggal');
            if (!foundFields.noInvoice && !missingFields.includes('No. INV')) missingFields.push('No. INV');
            if (!foundFields.keterangan && !missingFields.includes('Keterangan')) missingFields.push('Keterangan');
            if (!foundFields.customer && !missingFields.includes('Customer')) missingFields.push('Customer');
            if (!foundFields.nominal && !missingFields.includes('Nominal')) missingFields.push('Nominal');
            data.supplier = '';
        } else if (type === 'iklan') { // Khusus untuk /iklan
            if (!foundFields.tanggal && !missingFields.includes('Tanggal')) missingFields.push('Tanggal');
            if (!foundFields.noVA && !foundFields.noInvoice && !missingFields.includes('No. VA')) missingFields.push('No. VA');
            if (!foundFields.keterangan && !missingFields.includes('Keterangan')) missingFields.push('Keterangan');
            if (!foundFields.supplier && !missingFields.includes('Supplier')) missingFields.push('Supplier');
            if (!foundFields.nominal && !missingFields.includes('Nominal')) missingFields.push('Nominal');
            data.customer = '';
        } else { // pembelian atau pembelianlunas
            if (!foundFields.tanggal && !missingFields.includes('Tanggal')) missingFields.push('Tanggal');
            if (!foundFields.noInvoice && !missingFields.includes('No. INV')) missingFields.push('No. INV');
            if (!foundFields.keterangan && !missingFields.includes('Keterangan')) missingFields.push('Keterangan');
            if (!foundFields.supplier && !missingFields.includes('Supplier')) missingFields.push('Supplier');
            if (!foundFields.nominal && !missingFields.includes('Nominal')) missingFields.push('Nominal');
            data.customer = '';
        }

        // Hapus duplikat dari missingFields
        const uniqueMissingFields = [...new Set(missingFields)];

        // Tambahkan nama pengirim (akan diisi nanti dari Telegram)
        data.pengirim = '';

        // Jika ada field yang kosong, kembalikan informasi error dengan semua field yang kosong
        if (uniqueMissingFields.length > 0) {
            return {
                error: true,
                type: type,
                missingFields: uniqueMissingFields,
                errorMessages: errorMessages
            };
        }

        return data;
    } catch (error) {
        console.error('Error saat parsing message:', error);
        return {
            error: true,
            message: 'Terjadi kesalahan saat memproses pesan.'
        };
    }
}

/**
 * Fungsi khusus untuk memparse pesan /pelunasan
 * Format yang diharapkan:
 * /pelunasan
 * No. INV: [nomor invoice]
 * 
 * Atau:
 * /pelunasan
 * No. VA: [nomor va]
 * 
 * Atau format sederhana:
 * /pelunasan
 * [nomor invoice/va]
 */
function parseUpdateStatusMessage(text) {
    if (!text) return null;

    // Periksa apakah format pesan sesuai /pelunasan
    const updateMatch = text.match(/^\/pelunasan(?:\s|\n|\r\n|$)/i);
    if (!updateMatch) {
        return null;
    }

    try {
        // Buat objek untuk menyimpan data
        const data = {
            type: 'pelunasan',
            waktuInput: getCurrentTimeWIB()
        };

        // Array untuk menyimpan field yang kosong
        const missingFields = [];

        // Ambil semua baris dari text
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        // Objek untuk melacak field yang sudah ditemukan
        const foundFields = {
            'noInvoice': false
        };

        // Identifikasi field No. INV atau No. VA dari setiap baris
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Lewati baris pertama (command)
            if (i === 0 && line.startsWith('/pelunasan')) {
                continue;
            }

            // Format 1: No. INV: [value]
            if (line.match(/^No\.\s*INV\s*:/i)) {
                const value = line.replace(/^No\.\s*INV\s*:/i, '').trim();
                if (value) {
                    data.noInvoice = value;
                    foundFields.noInvoice = true;
                } else {
                    missingFields.push('No. INV');
                }
            }
            // Format 2: No. VA: [value]
            else if (line.match(/^No\.\s*VA\s*:/i)) {
                const value = line.replace(/^No\.\s*VA\s*:/i, '').trim();
                if (value) {
                    data.noInvoice = value; // Simpan di noInvoice untuk kompabilitas
                    foundFields.noInvoice = true;
                } else {
                    missingFields.push('No. VA');
                }
            }
            // Format 3: Hanya nomor invoice/VA langsung (tanpa "No. INV:" atau "No. VA:")
            else if (!foundFields.noInvoice) {
                // Jika baris kedua dan bukan format field lain, anggap sebagai nomor invoice/VA
                if (line && !line.match(/^\w+\s*:/i)) {
                    data.noInvoice = line.trim();
                    foundFields.noInvoice = true;
                }
            }
        }

        // Periksa field yang belum ditemukan
        if (!foundFields.noInvoice) {
            missingFields.push('Nomor Invoice/VA');
        }

        // Hapus duplikat dari missingFields
        const uniqueMissingFields = [...new Set(missingFields)];

        // Jika ada field yang kosong, kembalikan informasi error dengan semua field yang kosong
        if (uniqueMissingFields.length > 0) {
            return {
                error: true,
                missingFields: uniqueMissingFields
            };
        }

        return data;
    } catch (error) {
        console.error('Error saat parsing /pelunasan:', error);
        return {
            error: true,
            message: 'Terjadi kesalahan saat memproses pesan pelunasan.'
        };
    }
}

/**
 * Fungsi khusus untuk memparse pesan /pelunasanmassal
 * Format yang diharapkan:
 * /pelunasanmassal
 * INV001
 * INV002
 * INV003
 * 
 * Atau dengan format:
 * /pelunasanmassal
 * No. INV: INV001
 * No. INV: INV002
 * No. INV: INV003
 */
function parseUpdateStatusBatchMessage(text) {
    if (!text) return null;

    // Periksa apakah format pesan sesuai /pelunasanmassal
    const updateMatch = text.match(/^\/pelunasanmassal(?:\s|\n|\r\n|$)/i);
    if (!updateMatch) {
        return null;
    }

    try {
        // Buat objek untuk menyimpan data
        const data = {
            type: 'pelunasanmassal',
            waktuInput: getCurrentTimeWIB(),
            invoices: []
        };

        // Ambil semua baris dari text
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        // Lewati baris pertama (command)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];

            // Format 1: No. INV: [value]
            if (line.match(/^No\.\s*INV\s*:/i)) {
                const value = line.replace(/^No\.\s*INV\s*:/i, '').trim();
                if (value) {
                    data.invoices.push(value);
                }
            }
            // Format 2: Hanya nomor invoice langsung
            else if (!line.match(/^\w+\s*:/i)) {
                const value = line.trim();
                if (value) {
                    data.invoices.push(value);
                }
            }
        }

        // Jika tidak ada invoice yang ditemukan
        if (data.invoices.length === 0) {
            return {
                error: true,
                message: 'Tidak ada nomor invoice yang ditemukan'
            };
        }

        return data;
    } catch (error) {
        console.error('Error saat parsing /pelunasanmassal:', error);
        return {
            error: true,
            message: 'Terjadi kesalahan saat memproses pesan pelunasan massal.'
        };
    }
}

/**
 * Fungsi khusus untuk memparse pesan /invoiceiklan
 * Format yang diharapkan:
 * /invoiceiklan
 * No. VA: [nomor va]
 * 
 * Atau format sederhana:
 * /invoiceiklan
 * [nomor va]
 */
function parseInvoiceIklanMessage(text) {
    if (!text) return null;

    // Periksa apakah format pesan sesuai /invoiceiklan
    const invoiceIklanMatch = text.match(/^\/invoiceiklan(?:\s|\n|\r\n|$)/i);
    if (!invoiceIklanMatch) {
        return null;
    }

    try {
        // Buat objek untuk menyimpan data
        const data = {
            type: 'invoiceiklan',
            waktuInput: getCurrentTimeWIB()
        };

        // Array untuk menyimpan field yang kosong
        const missingFields = [];

        // Ambil semua baris dari text
        const lines = text.split('\n').map(line => line.trim()).filter(line => line);

        // Objek untuk melacak field yang sudah ditemukan
        const foundFields = {
            'noInvoice': false
        };

        // Identifikasi field No. VA dari setiap baris
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Lewati baris pertama (command)
            if (i === 0 && line.startsWith('/invoiceiklan')) {
                continue;
            }

            // Format 1: No. VA: [value]
            if (line.match(/^No\.\s*VA\s*:/i)) {
                const value = line.replace(/^No\.\s*VA\s*:/i, '').trim();
                if (value) {
                    data.noInvoice = value;
                    foundFields.noInvoice = true;
                } else {
                    missingFields.push('No. VA');
                }
            }
            // Format sederhana: jika baris kedua berisi nomor VA saja
            else if (i === 1 && !foundFields.noInvoice) {
                const value = line.trim();
                if (value) {
                    data.noInvoice = value;
                    foundFields.noInvoice = true;
                } else {
                    missingFields.push('No. VA');
                }
            }
        }

        // Periksa field yang belum ditemukan
        if (!foundFields.noInvoice && !missingFields.includes('No. VA')) {
            missingFields.push('No. VA');
        }

        // Tambahkan nama pengirim (akan diisi nanti dari Telegram)
        data.pengirim = '';

        // Jika ada field yang kosong, kembalikan informasi error dengan semua field yang kosong
        if (missingFields.length > 0) {
            return {
                error: true,
                type: 'invoiceiklan',
                missingFields,
                message: 'Format tidak valid. Gunakan format:\n/invoiceiklan\nNo. VA: [nomor VA]'
            };
        }

        return data;
    } catch (error) {
        console.error('Error saat parsing message invoiceiklan:', error);
        return {
            error: true,
            message: 'Terjadi kesalahan saat memproses pesan.'
        };
    }
}

module.exports = {
    parseMessage,
    getCurrentTimeWIB,
    parseUpdateStatusMessage,
    parseUpdateStatusBatchMessage,
    parseInvoiceIklanMessage
};