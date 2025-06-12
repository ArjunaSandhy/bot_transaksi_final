const { Telegraf } = require('telegraf');
const { parseMessage, getCurrentTimeWIB, parseUpdateStatusMessage, parseInvoiceIklanMessage, parseUpdateStatusBatchMessage } = require('./src/utils/messageParser');
const sheetsService = require('./src/services/sheetsService');
const driveService = require('./src/services/driveService');
const { memoryCache, optimizeFileProcessing, createRateLimiter } = require('./src/utils/perfOptimizer');
const Logger = require('./src/utils/logger');
const config = require('./config');
const path = require('path');
const cron = require('node-cron');
const fetch = require('node-fetch');

// Inisialisasi bot
const bot = new Telegraf(config.botToken);

// Rate limiter untuk API calls (20 request per menit)
const apiRateLimiter = createRateLimiter(20, 60 * 1000);

// Middleware untuk pemeriksaan akses
bot.use(async(ctx, next) => {
    try {
        // Jika fitur access control tidak diaktifkan, lanjutkan saja
        if (!config.accessControl.enabled) {
            return next();
        }

        // Dapatkan informasi chat
        const chatId = ctx.chat.id;
        const chatType = ctx.chat.type;
        const userId = ctx.from.id;

        // Jika private chat, periksa apakah user diizinkan
        if (chatType === 'private') {
            const allowedUsers = config.accessControl.allowedUsers;
            if (allowedUsers.length === 0 || !allowedUsers.includes(userId.toString())) {
                Logger.warning(`Akses ditolak untuk private chat dengan user ID: ${userId}`);
                await ctx.reply(config.accessControl.accessDeniedMessage);
                return; // Hentikan eksekusi, jangan lanjut ke handler berikutnya
            }
        }
        // Jika grup atau supergroup, periksa apakah grup diizinkan
        else if (chatType === 'group' || chatType === 'supergroup') {
            // Periksa apakah grup ada dalam konfigurasi
            if (!config.groups[chatId.toString()]) {
                Logger.warning(`Akses ditolak untuk grup dengan ID: ${chatId}`);
                await ctx.reply(config.accessControl.accessDeniedMessage);
                return; // Hentikan eksekusi, jangan lanjut ke handler berikutnya
            }
        }
        // Tolak channel atau jenis chat lain
        else {
            Logger.warning(`Akses ditolak untuk jenis chat: ${chatType} dengan ID: ${chatId}`);
            await ctx.reply(config.accessControl.accessDeniedMessage);
            return;
        }

        // Tambahkan informasi grup ke context untuk digunakan handler lain
        if (chatType === 'group' || chatType === 'supergroup') {
            ctx.groupConfig = config.groups[chatId.toString()];
        }

        // Jika semua pemeriksaan berhasil, lanjutkan ke handler berikutnya
        return next();
    } catch (error) {
        Logger.error(`Error pada middleware pemeriksaan akses: ${error.message}`, error);
        return next(); // Tetap lanjutkan jika terjadi error untuk menghindari bot mati
    }
});

// Fungsi untuk mendapatkan nama pengirim
function getSenderName(ctx) {
    if (ctx.message.from.username) {
        return `@${ctx.message.from.username}`;
    } else {
        const firstName = ctx.message.from.first_name || '';
        const lastName = ctx.message.from.last_name || '';
        return `${firstName} ${lastName}`.trim();
    }
}

// Fungsi untuk escape karakter markdown
function escapeMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\~/g, '\\~')
        .replace(/\`/g, '\\`')
        .replace(/\>/g, '\\>')
        .replace(/\#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/\=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/\!/g, '\\!');
}

// Fungsi untuk memformat tanggal dari formula Google Sheets
function formatDateFromSheet(dateStr) {
    // Cek apakah ini formula DATE
    const dateFormulaMatch = dateStr.match(/=DATE\((\d+),(\d+),(\d+)\)/);
    if (dateFormulaMatch) {
        const [_, year, month, day] = dateFormulaMatch;
        return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }

    // Cek apakah format DD/MM/YYYY
    const dateMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
    }

    return dateStr;
}

// Handler saat bot mulai
bot.start((ctx) => {
    ctx.reply('📊 BOT Transaksi siap digunakan! Ketik /help untuk melihat daftar perintah.', {
        reply_to_message_id: ctx.message.message_id
    });
});

// Handler untuk bantuan
bot.help((ctx) => {
    const helpText = `
*TRANSAKSI:*

*Penjualan:*
\`\`\`
/penjualan
Tanggal: DD/MM/YYYY
No. INV: [nomor invoice]
Keterangan: [deskripsi transaksi]
Customer: [nama customer]
Nominal: [jumlah]
No. Rekening Penerima: [nomor rekening]
Nama Rekening Penerima: [nama pemilik rekening]
\`\`\`

*Pembelian:*
\`\`\`
/pembelian
Tanggal: DD/MM/YYYY
No. INV: [nomor invoice]
Keterangan: [deskripsi transaksi]
Supplier: [nama supplier]
Nominal: [jumlah]
No. Rekening Tujuan: [nomor rekening]
Nama Rekening Tujuan: [nama pemilik rekening]
\`\`\`

*Iklan:*
\`\`\`
/iklan
Tanggal: DD/MM/YYYY
No. VA: [nomor virtual account]
Keterangan: [deskripsi transaksi]
Supplier: [nama supplier]
Nominal: [jumlah]
Rekening Pengirim: [nomor rekening]
Nama Rekening Pengirim: [nama pemilik rekening]
\`\`\`

*PELUNASAN & INVOICE:*

*Pelunasan:*
\`\`\`
/pelunasan
[nomor invoice/VA]
\`\`\`

*Pelunasan Massal:*
\`\`\`
/pelunasanmassal
[nomor invoice/VA 1]
[nomor invoice/VA 2]
[nomor invoice/VA 3]
...
\`\`\`

*Invoice Iklan:*
\`\`\`
/invoiceiklan
No. VA: [nomor VA]
\`\`\`

⚠️Semua perintah di atas menggunakan lampiran.

*LAINNYA:*
\`/belumlunas\` - Daftar invoice belum dibayar
\`/linksheet\` - Link Google Spreadsheet
\`/linkdrive\` - Link folder Google Drive
  `;

    ctx.replyWithMarkdown(helpText, {
        reply_to_message_id: ctx.message.message_id
    });
});

// Handler untuk pesan dengan file atau media
bot.on(['photo', 'document'], async(ctx) => {
    try {
        if (!apiRateLimiter()) {
            ctx.reply('⚠️ Terlalu banyak transaksi dalam waktu singkat. Mohon tunggu beberapa saat sebelum mencoba lagi.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        const caption = ctx.message.caption;
        if (!caption) {
            ctx.reply('Mohon sertakan data transaksi dalam caption file.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Dapatkan konfigurasi grup jika ada
        const groupConfig = ctx.groupConfig;

        // Cek khusus untuk perintah /pelunasan
        const isPelunasan = caption.match(/^\/pelunasan(?:\s|\n|\r\n|$)/i);
        if (isPelunasan) {
            await handlePelunasanWithFile(ctx);
            return;
        }

        // Cek khusus untuk perintah /pelunasanmassal
        const isPelunasanMassal = caption.match(/^\/pelunasanmassal(?:\s|\n|\r\n|$)/i);
        if (isPelunasanMassal) {
            await handlePelunasanMassalWithFile(ctx);
            return;
        }

        // Cek khusus untuk perintah /invoiceiklan
        const isInvoiceIklan = caption.match(/^\/invoiceiklan(?:\s|\n|\r\n|$)/i);
        if (isInvoiceIklan) {
            // Parse pesan /invoiceiklan
            const data = parseInvoiceIklanMessage(caption);

            if (!data) {
                ctx.reply('❌ Format pesan tidak valid. Gunakan format:\n/invoiceiklan\nNo. VA: [nomor VA]', {
                    reply_to_message_id: ctx.message.message_id
                });
                return;
            }

            // Tambahkan data pengirim
            data.pengirim = getSenderName(ctx);

            // Penanganan error untuk field yang kosong
            if (data.error) {
                if (data.missingFields && data.missingFields.length > 0) {
                    ctx.reply(`❌ ${data.missingFields.join(', ')} tidak boleh kosong!`, {
                        reply_to_message_id: ctx.message.message_id
                    });
                    Logger.error(`Fields [${data.missingFields.join(', ')}] error pada invoiceiklan (Pengirim: ${data.pengirim})`);
                } else {
                    ctx.reply(`❌ ${data.message || 'Format pesan tidak valid'}`, {
                        reply_to_message_id: ctx.message.message_id
                    });
                    Logger.error(`Format pesan invoiceiklan tidak valid: ${data.message || 'unknown error'} (Pengirim: ${data.pengirim})`);
                }
                return;
            }

            // Proses file dari message
            let fileId, mimeType, fileName;

            if (ctx.message.document) {
                fileId = ctx.message.document.file_id;
                mimeType = ctx.message.document.mime_type;
                // Ext akan digunakan setelah mendapatkan data transaksi
                const originalExt = path.extname(ctx.message.document.file_name);
            } else if (ctx.message.photo) {
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                fileId = photo.file_id;
                mimeType = 'image/jpeg';
            }

            const statusMessage = await ctx.reply('⏳ Memproses invoice iklan...', {
                reply_to_message_id: ctx.message.message_id
            });

            try {
                // Cari data iklan yang sudah dilunasi
                const paidAd = await sheetsService.findPaidAdvertisement(data.noInvoice, groupConfig);

                if (!paidAd) {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
                    await ctx.reply(`❌ Iklan dengan No. VA: ${data.noInvoice} tidak ditemukan atau belum dilunasi.`, {
                        reply_to_message_id: ctx.message.message_id
                    });
                    return;
                }

                // Format nama file sesuai ketentuan [J/B].[TANGGAL].[NO.INV].[SUPPLIER]-[JENIS_DOK].[EKSTENSI]
                // Untuk iklan, kita gunakan prefix 'B' (seperti pembelian)
                const filePrefix = 'B';
                // Format tanggal dari data yang sudah ada
                const tanggal = paidAd.data[0]; // Kolom A: Tanggal
                const formattedDate = tanggal.replace(/\//g, '-');
                // Nama supplier
                const supplierName = paidAd.supplier.replace(/\s+/g, '-');

                // Update nama file dengan format yang sama seperti /pembelian
                if (ctx.message.document) {
                    const originalExt = path.extname(ctx.message.document.file_name);
                    fileName = `${filePrefix}.${formattedDate}.${data.noInvoice}.${supplierName}-${groupConfig.name}-INV${originalExt}`;
                } else if (ctx.message.photo) {
                    fileName = `${filePrefix}.${formattedDate}.${data.noInvoice}.${supplierName}-${groupConfig.name}-INV.jpg`;
                }

                // Upload file ke Google Drive
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink);
                const fileBuffer = Buffer.from(await response.arrayBuffer());
                const optimizedBuffer = optimizeFileProcessing(fileBuffer, mimeType);
                const uploadResult = await driveService.uploadFile(optimizedBuffer, mimeType, fileName, groupConfig);

                // Update kolom lampiran pada baris yang sesuai
                await sheetsService.updateInvoiceIklanAttachment(data.noInvoice, uploadResult.url, groupConfig);

                // Hapus status message
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
                } catch (deleteError) {
                    // Lanjutkan saja jika gagal menghapus
                }

                // Kirim pesan konfirmasi sederhana
                await ctx.reply(`✅ Invoice iklan berhasil dilampirkan.`, {
                    reply_to_message_id: ctx.message.message_id
                });

                Logger.success(`Invoice iklan No. VA: ${data.noInvoice} berhasil dilampirkan (Pengirim: ${data.pengirim})`);

            } catch (error) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
                } catch (deleteError) {
                    // Lanjutkan saja jika gagal menghapus
                }

                Logger.error(`Gagal memproses invoice iklan: ${error.message} (Pengirim: ${data.pengirim})`);

                await ctx.reply(`❌ Terjadi kesalahan saat memproses invoice iklan: ${error.message}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
            return;
        }

        // Cek jika pesan dimulai dengan "/" tapi bukan perintah valid
        if (caption.startsWith('/') &&
            !caption.match(/^\/penjualan(?:\s|\n|\r\n|$)/i) &&
            !caption.match(/^\/pembelian(?:\s|\n|\r\n|$)/i) &&
            !caption.match(/^\/iklan(?:\s|\n|\r\n|$)/i) &&
            !caption.match(/^\/invoiceiklan(?:\s|\n|\r\n|$)/i) &&
            !caption.match(/^\/pelunasan(?:\s|\n|\r\n|$)/i)) {
            // Ekstrak perintah dari caption (ambil hanya perintah, bukan seluruh pesan)
            const commandMatch = caption.match(/^\/\w+/);
            const command = commandMatch ? commandMatch[0] : '';

            ctx.reply(`❌ Perintah ${command} tidak ditemukan. Gunakan /penjualan atau /pembelian atau /iklan untuk transaksi.`, {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        const data = parseMessage(caption);
        if (!data) {
            ctx.reply('❌ Format pesan tidak valid', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Tambahkan data pengirim sebelum validasi
        data.pengirim = getSenderName(ctx);

        // Penanganan error untuk field yang kosong
        if (data.error) {
            if (data.missingFields && data.missingFields.length > 0) {
                // Mengecek jika ada pesan error spesifik
                let errorMessage = '';

                if (data.missingFields.length === 1) {
                    // Jika hanya satu field yang kosong
                    const missingField = data.missingFields[0];
                    // Gunakan pesan error spesifik jika tersedia
                    if (data.errorMessages && data.errorMessages[missingField]) {
                        errorMessage = `❌ ${missingField}: ${data.errorMessages[missingField]}`;
                    } else {
                        errorMessage = `❌ ${missingField} tidak boleh kosong!`;
                    }

                    Logger.error(`Field ${missingField} error pada transaksi ${data.type || 'unknown'} (Pengirim: ${data.pengirim})`);
                } else {
                    // Jika ada beberapa field yang kosong
                    const missingFieldsText = data.missingFields.join(', ');
                    errorMessage = `❌ Beberapa field tidak valid: ${missingFieldsText}`;

                    // Tambahkan detail error spesifik jika tersedia
                    if (data.errorMessages && Object.keys(data.errorMessages).length > 0) {
                        errorMessage += '\n\nDetail error:';
                        for (const field in data.errorMessages) {
                            errorMessage += `\n• ${field}: ${data.errorMessages[field]}`;
                        }
                    }

                    Logger.error(`Fields [${missingFieldsText}] error pada transaksi ${data.type || 'unknown'} (Pengirim: ${data.pengirim})`);
                }

                ctx.reply(errorMessage, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                Logger.error(`Format pesan tidak valid: ${data.message || 'unknown error'} (Pengirim: ${data.pengirim})`);
                ctx.reply(`❌ ${data.message || 'Format pesan tidak valid'}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
            return;
        }

        // Cek apakah nomor invoice sudah ada di spreadsheet
        try {
            const existingInvoice = await sheetsService.findInvoice(data.noInvoice, groupConfig);
            if (existingInvoice) {
                // Jika nomor invoice sudah ada, kembalikan pesan error dengan informasi baris
                ctx.reply(`❌ No. INV: ${data.noInvoice} sudah ada pada baris ke-${existingInvoice.rowIndex}`, {
                    reply_to_message_id: ctx.message.message_id
                });
                return;
            }
        } catch (error) {
            Logger.error(`Error saat memeriksa invoice duplikat: ${error.message} (Pengirim: ${data.pengirim})`);
            // Lanjutkan proses jika gagal memeriksa duplikat untuk menghindari false negative
        }

        // Proses transaksi dengan file
        let fileId, mimeType, fileName;

        // Format nama file sesuai ketentuan [J/B].[TANGGAL].[NO.INV].[CUSTOMER/SUPPLIER]-[JENIS_DOK].[EKSTENSI]
        const filePrefix = data.type === 'penjualan' ? 'J' : 'B';
        const entityName = data.type === 'penjualan' ?
            data.customer.replace(/\s+/g, '-') :
            data.supplier.replace(/\s+/g, '-');
        // Format tanggal DD-MM-YYYY untuk urutan kronologis
        const formattedDate = data.tanggal.replace(/\//g, '-');

        if (ctx.message.document) {
            fileId = ctx.message.document.file_id;
            mimeType = ctx.message.document.mime_type;
            const originalExt = path.extname(ctx.message.document.file_name);
            fileName = `${filePrefix}.${formattedDate}.${data.noInvoice}.${entityName}-${groupConfig.name}-INV${originalExt}`;
        } else if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            fileId = photo.file_id;
            mimeType = 'image/jpeg';
            fileName = `${filePrefix}.${formattedDate}.${data.noInvoice}.${entityName}-${groupConfig.name}-INV.jpg`;
        }

        const statusMessage = await ctx.reply('⏳ Memproses transaksi...', {
            reply_to_message_id: ctx.message.message_id
        });

        // Simpan ke Google Sheets
        let rowNumber;
        try {
            // Format waktu input dengan pengirim, seperti waktu update
            const now = new Date();
            const options = {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };
            const waktuInputFormatted = new Intl.DateTimeFormat('id-ID', options).format(now);

            // Gabungkan pengirim dengan waktu input
            data.waktuInput = `${data.pengirim} (${waktuInputFormatted})`;

            if (data.type === 'penjualan') {
                // Untuk penjualan: Upload file ke Google Drive dan simpan URL
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink);
                const fileBuffer = Buffer.from(await response.arrayBuffer());

                const optimizedBuffer = optimizeFileProcessing(fileBuffer, mimeType);

                const uploadResult = await driveService.uploadFile(optimizedBuffer, mimeType, fileName, groupConfig);

                // Tambahkan URL file ke data
                data.fileUrl = uploadResult.url;

                // Simpan data penjualan ke Google Sheets
                rowNumber = await sheetsService.savePenjualan(data, groupConfig);
            } else if (data.type === 'iklan') {
                // Untuk iklan: tidak perlu upload file, langsung simpan data sebagai pembelian
                data.fileUrl = ''; // Tidak ada URL file

                // Simpan data iklan ke Google Sheets sebagai pembelian
                rowNumber = await sheetsService.savePembelian(data, groupConfig);
            } else { // pembelian
                // Untuk pembelian: Upload file ke Google Drive sama seperti penjualan
                const fileLink = await ctx.telegram.getFileLink(fileId);
                const response = await fetch(fileLink);
                const fileBuffer = Buffer.from(await response.arrayBuffer());

                const optimizedBuffer = optimizeFileProcessing(fileBuffer, mimeType);

                const uploadResult = await driveService.uploadFile(optimizedBuffer, mimeType, fileName, groupConfig);

                // Tambahkan URL file ke data
                data.fileUrl = uploadResult.url;

                // Simpan data pembelian ke Google Sheets
                rowNumber = await sheetsService.savePembelian(data, groupConfig);
            }

            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja
            }

            // Log sukses
            Logger.logTransaksi(data, rowNumber);

            // Formatkan pesan konfirmasi
            const formatNominal = parseInt(data.nominal).toLocaleString('id-ID');
            let konfirmasi;

            if (data.type === 'penjualan') {
                konfirmasi = `✅ ${data.type.toUpperCase()} kepada ${escapeMarkdown(data.customer)} sebesar Rp ${formatNominal} berhasil dicatat.`;
            } else if (data.type === 'iklan') {
                konfirmasi = `✅ IKLAN dari ${escapeMarkdown(data.supplier)} sebesar Rp ${formatNominal} berhasil dicatat.\n\n` +
                    `Untuk melakukan pelunasan, gunakan command berikut:\n` +
                    `\`\`\`\n/pelunasan\n${data.noInvoice}\n\`\`\`` +
                    `Lampirkan bukti transfer saat menggunakan command di atas.`;
            } else { // pembelian
                konfirmasi = `✅ ${data.type.toUpperCase()} dari ${escapeMarkdown(data.supplier)} sebesar Rp ${formatNominal} berhasil dicatat.\n\n` +
                    `Untuk melakukan pelunasan, gunakan command berikut:\n` +
                    `\`\`\`\n/pelunasan\n${data.noInvoice}\n\`\`\`` +
                    `Lampirkan bukti transfer saat menggunakan command di atas.`;
            }

            await ctx.replyWithMarkdown(konfirmasi, {
                reply_to_message_id: ctx.message.message_id
            });

        } catch (error) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja
            }

            Logger.error(`Gagal menyimpan data ${data.type}: ${error.message} (Pengirim: ${data.pengirim})`);
            Logger.logErrorTransaksi(data);

            await ctx.reply('❌ Terjadi kesalahan saat menyimpan data. Silakan coba lagi.', {
                reply_to_message_id: ctx.message.message_id
            });
        }
    } catch (error) {
        let errorMessage = '❌ Terjadi kesalahan saat memproses transaksi. Silakan coba lagi.';

        if (error.message.includes('Ukuran file')) {
            errorMessage = `❌ ${error.message}`;
        } else if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
            errorMessage = '❌ Gagal terhubung ke server. Periksa koneksi internet Anda dan coba lagi nanti.';
        }

        Logger.error(`Error photo/document: ${error.message}`, error);

        ctx.reply(errorMessage, {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Fungsi pemformatan invoice dengan jarak lebih pendek untuk perintah /belumlunas dan /invoicebelumlunas
async function formatAndSendPendingInvoices(ctx, pendingInvoices, isReply = true) {
    // Kelompokkan invoice berdasarkan supplier
    const invoicesBySupplier = {};
    let totalNominalAll = 0;

    // Dapatkan konfigurasi grup
    const groupConfig = ctx.groupConfig;

    pendingInvoices.forEach((invoice) => {
        const supplier = invoice.supplier || 'Lainnya';
        const nominal = invoice.nominal || 0;
        const noRekening = invoice.noRekening || '-';
        const namaRekening = invoice.namaRekening || '-';

        if (!invoicesBySupplier[supplier]) {
            invoicesBySupplier[supplier] = {
                invoices: [],
                totalNominal: 0,
                noRekening: noRekening,
                namaRekening: namaRekening
            };
        }

        invoicesBySupplier[supplier].invoices.push(invoice);
        invoicesBySupplier[supplier].totalNominal += nominal;
        totalNominalAll += nominal;
    });

    // Format pesan untuk notifikasi - lebih mudah dibaca
    let message = `📋 *DAFTAR INVOICE BELUM LUNAS*\n`;
    message += `📍 Grup: *${groupConfig.name}*\n`;

    // Urutkan supplier berdasarkan abjad
    const sortedSuppliers = Object.keys(invoicesBySupplier).sort();

    sortedSuppliers.forEach((supplier, index) => {
        const supplierData = invoicesBySupplier[supplier];

        message += `\n👨‍💼 *${supplier}*\n`;
        message += `💰 Total: *Rp ${supplierData.totalNominal.toLocaleString('id-ID')}*\n`;
        message += `🏦 No. Rekening: \`${supplierData.noRekening}\`\n`;
        message += `👤 Nama Rekening: \`${supplierData.namaRekening}\`\n\n`;

        supplierData.invoices.forEach((invoice, idx) => {
            // Format yang lebih mudah dibaca dengan emoji dan penggantian baris yang lebih jelas
            message += `${idx + 1}. \`${invoice.invoiceNumber}\` (${invoice.date})\n`;
            message += `   💵 Rp ${invoice.nominal.toLocaleString('id-ID')}\n`;
            message += `   📝 ${invoice.description}\n`;
        });

        // Tambahkan pemisah antar supplier yang lebih jelas
        if (index < sortedSuppliers.length - 1) {
            message += `\n${'─'.repeat(18)}\n`;
        }
    });

    // Tambahkan total nominal keseluruhan dengan format ringkas namun jelas
    message += `\n${'═'.repeat(25)}\n`;
    message += `💵 *TOTAL KESELURUHAN:*\n*Rp ${totalNominalAll.toLocaleString('id-ID')}*\n`;
    message += `📊 Jumlah invoice: ${pendingInvoices.length}`;

    // Kirim pesan notifikasi
    try {
        if (isReply) {
            await ctx.telegram.sendMessage(ctx.chat.id, message, {
                parse_mode: 'Markdown',
                reply_to_message_id: ctx.message.message_id
            });
        } else {
            await ctx.telegram.sendMessage(ctx.chat.id, message, {
                parse_mode: 'Markdown'
            });
        }
    } catch (error) {
        // Jika pesan terlalu panjang, pecah menjadi beberapa bagian
        if (error.description && error.description.includes('message is too long')) {
            // Kirim header terlebih dahulu
            await ctx.telegram.sendMessage(ctx.chat.id,
                `📋 *DAFTAR INVOICE BELUM LUNAS*\n📍 Grup: *${groupConfig.name}*`, {
                    parse_mode: 'Markdown',
                    reply_to_message_id: isReply ? ctx.message.message_id : undefined
                });

            // Kirim data per supplier dengan format ringkas
            for (const supplier of sortedSuppliers) {
                const supplierData = invoicesBySupplier[supplier];
                let supplierMessage = `👨‍💼 *${supplier}*\n`;
                supplierMessage += `💰 Total: *Rp ${supplierData.totalNominal.toLocaleString('id-ID')}*\n`;
                supplierMessage += `🏦 No. Rekening: \`${supplierData.noRekening}\`\n`;
                supplierMessage += `👤 Nama Rekening: \`${supplierData.namaRekening}\`\n\n`;

                supplierData.invoices.forEach((invoice, idx) => {
                    supplierMessage += `${idx + 1}. \`${invoice.invoiceNumber}\` (${invoice.date})\n`;
                    supplierMessage += `   💵 Rp ${invoice.nominal.toLocaleString('id-ID')}\n`;
                    supplierMessage += `   📝 ${invoice.description}\n\n`;
                });

                await ctx.telegram.sendMessage(ctx.chat.id, supplierMessage, {
                    parse_mode: 'Markdown'
                });
            }

            // Kirim summary ringkas
            let summaryMessage = `\n${'═'.repeat(25)}\n`;
            summaryMessage += `💵 *TOTAL KESELURUHAN:*\n*Rp ${totalNominalAll.toLocaleString('id-ID')}*\n`;
            summaryMessage += `📊 Jumlah invoice: ${pendingInvoices.length}`;

            await ctx.telegram.sendMessage(ctx.chat.id, summaryMessage, {
                parse_mode: 'Markdown'
            });
        } else {
            // Kesalahan lain
            throw error;
        }
    }
}

// Command untuk menampilkan invoice belum lunas
bot.command('invoicebelumlunas', async(ctx) => {
    try {
        const statusMessage = await ctx.reply('⏳ Mengambil data invoice belum lunas...', {
            reply_to_message_id: ctx.message.message_id
        });

        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        // Dapatkan daftar invoice yang belum lunas
        const pendingInvoices = await sheetsService.getPendingInvoices(groupConfig);

        // Hapus pesan status
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
        } catch (deleteError) {
            // Lanjutkan saja jika gagal menghapus
        }

        if (pendingInvoices.length === 0) {
            await ctx.reply('✅ Tidak ada invoice pembelian yang belum lunas.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Gunakan fungsi format dan kirim yang baru
        await formatAndSendPendingInvoices(ctx, pendingInvoices, true);
        Logger.info(`User ${getSenderName(ctx)} meminta daftar invoice belum lunas`);
    } catch (error) {
        Logger.error('Gagal mendapatkan invoice belum lunas:', error);
        ctx.reply('❌ Terjadi kesalahan saat mengambil data invoice belum lunas.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Alias untuk perintah belumlunas
bot.command('belumlunas', async(ctx) => {
    try {
        const statusMessage = await ctx.reply('⏳ Mengambil data invoice belum lunas...', {
            reply_to_message_id: ctx.message.message_id
        });

        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        // Dapatkan daftar invoice yang belum lunas
        const pendingInvoices = await sheetsService.getPendingInvoices(groupConfig);

        // Hapus pesan status
        try {
            await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
        } catch (deleteError) {
            // Lanjutkan saja jika gagal menghapus
        }

        if (pendingInvoices.length === 0) {
            await ctx.reply('✅ Tidak ada invoice pembelian yang belum lunas.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Gunakan fungsi format dan kirim yang baru
        await formatAndSendPendingInvoices(ctx, pendingInvoices, true);
        Logger.info(`User ${getSenderName(ctx)} meminta daftar invoice belum lunas (via /belumlunas)`);
    } catch (error) {
        Logger.error('Gagal mendapatkan invoice belum lunas:', error);
        ctx.reply('❌ Terjadi kesalahan saat mengambil data invoice belum lunas.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Command untuk mendapatkan link Google Spreadsheet
bot.command('linksheet', async(ctx) => {
    try {
        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        const sheetUrl = `https://docs.google.com/spreadsheets/d/${groupConfig.spreadsheetId}`;

        // Kirim link sebagai pesan dengan format Markdown
        await ctx.telegram.sendMessage(ctx.chat.id, `🔗 *Link Google Spreadsheet*\n\n[Buka Spreadsheet](${sheetUrl})`, {
            parse_mode: 'Markdown',
            reply_to_message_id: ctx.message.message_id,
            disable_web_page_preview: true
        });

        Logger.info(`User ${getSenderName(ctx)} meminta link spreadsheet`);
    } catch (error) {
        Logger.error('Gagal mengirim link spreadsheet:', error);
        ctx.reply('❌ Terjadi kesalahan saat mendapatkan link spreadsheet.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Command untuk mendapatkan link Google Drive
bot.command('linkdrive', async(ctx) => {
    try {
        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        ctx.replyWithMarkdown(`🗂 [Folder Google Drive](https://drive.google.com/drive/folders/${groupConfig.driveFolderId})`, {
            reply_to_message_id: ctx.message.message_id
        });
        Logger.info(`User ${getSenderName(ctx)} meminta link Google Drive`);
    } catch (error) {
        Logger.error('Gagal mendapatkan link Google Drive:', error);
        ctx.reply('❌ Terjadi kesalahan saat mengambil link Google Drive.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Handler untuk pesan text saja (tanpa file)
bot.on('text', async(ctx) => {
    try {
        // Handler untuk perintah yang tidak dikenal
        if (ctx.message.text.startsWith('/') &&
            !ctx.message.text.startsWith('/penjualan') &&
            !ctx.message.text.startsWith('/pembelian') &&
            !ctx.message.text.startsWith('/help') &&
            !ctx.message.text.startsWith('/start') &&
            !ctx.message.text.startsWith('/invoicebelumlunas') &&
            !ctx.message.text.startsWith('/belumlunas') &&
            !ctx.message.text.startsWith('/linksheet') &&
            !ctx.message.text.startsWith('/linkdrive') &&
            !ctx.message.text.startsWith('/iklan') &&
            !ctx.message.text.startsWith('/invoiceiklan') &&
            !ctx.message.text.startsWith('/pelunasan')) {

            // Ekstrak perintah dari teks (ambil hanya perintah, bukan seluruh pesan)
            const commandMatch = ctx.message.text.match(/^\/\w+/);
            const command = commandMatch ? commandMatch[0] : '';

            ctx.reply(`❌ Perintah ${command} tidak ditemukan. Gunakan /help untuk melihat daftar perintah yang tersedia.`, {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Cek khusus untuk /pembelian, /penjualan, dan /iklan
        if (ctx.message.text.startsWith('/pembelian')) {
            ctx.reply('❌ Perintah /pembelian harus menyertakan lampiran file/gambar.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        if (ctx.message.text.startsWith('/penjualan')) {
            ctx.reply('❌ Perintah /penjualan harus menyertakan lampiran file/gambar.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        if (ctx.message.text.startsWith('/iklan')) {
            ctx.reply('❌ Perintah /iklan harus menyertakan lampiran file/gambar.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        if (ctx.message.text.startsWith('/pelunasan')) {
            ctx.reply('❌ Perintah /pelunasan harus menyertakan lampiran bukti transfer berupa file/gambar.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Pesan text biasa atau command lain yang sudah dihandle di handler masing-masing
        if (ctx.message.text.startsWith('/')) {
            return;
        }

        const text = ctx.message.text;

        const data = parseMessage(text);
        if (!data) {
            return;
        }

        // Tambahkan data pengirim sebelum validasi
        data.pengirim = getSenderName(ctx);

        // Penanganan error untuk field yang kosong
        if (data.error) {
            if (data.missingFields && data.missingFields.length > 0) {
                // Mengecek jika ada pesan error spesifik
                let errorMessage = '';

                if (data.missingFields.length === 1) {
                    // Jika hanya satu field yang kosong
                    const missingField = data.missingFields[0];
                    // Gunakan pesan error spesifik jika tersedia
                    if (data.errorMessages && data.errorMessages[missingField]) {
                        errorMessage = `❌ ${missingField}: ${data.errorMessages[missingField]}`;
                    } else {
                        errorMessage = `❌ ${missingField} tidak boleh kosong!`;
                    }

                    Logger.error(`Field ${missingField} error pada transaksi text ${data.type || 'unknown'} (Pengirim: ${data.pengirim})`);
                } else {
                    // Jika ada beberapa field yang kosong
                    const missingFieldsText = data.missingFields.join(', ');
                    errorMessage = `❌ Beberapa field tidak valid: ${missingFieldsText}`;

                    // Tambahkan detail error spesifik jika tersedia
                    if (data.errorMessages && Object.keys(data.errorMessages).length > 0) {
                        errorMessage += '\n\nDetail error:';
                        for (const field in data.errorMessages) {
                            errorMessage += `\n• ${field}: ${data.errorMessages[field]}`;
                        }
                    }

                    Logger.error(`Fields [${missingFieldsText}] error pada transaksi text ${data.type || 'unknown'} (Pengirim: ${data.pengirim})`);
                }

                ctx.reply(errorMessage, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                Logger.error(`Format pesan text tidak valid: ${data.message || 'unknown error'} (Pengirim: ${data.pengirim})`);
                ctx.reply(`❌ ${data.message || 'Format pesan tidak valid'}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
            return;
        }

    } catch (error) {
        ctx.reply('❌ Terjadi kesalahan saat memproses transaksi. Silakan coba lagi.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
});

// Error handler
bot.catch((err, ctx) => {
    Logger.error('Terjadi kesalahan pada BOT', err);
    if (ctx.message) {
        ctx.reply('❌ Terjadi kesalahan pada BOT. Silakan coba lagi nanti.', {
            reply_to_message_id: ctx.message.message_id
        });
    } else {
        ctx.reply('❌ Terjadi kesalahan pada BOT. Silakan coba lagi nanti.');
    }
});

// Fungsi untuk mengirim notifikasi invoice yang belum lunas (format ringkas)
async function sendPendingInvoicesNotification() {
    try {
        if (!config.notification.enabled) {
            return;
        }

        Logger.info('Memulai pengecekan invoice yang belum lunas...');

        // Iterasi setiap grup
        for (const groupId in config.groups) {
            const groupConfig = config.groups[groupId];

            // Skip jika grup tidak memiliki topic ID untuk notifikasi
            if (!groupConfig.notificationTopicId) {
                continue;
            }

            try {
                // Dapatkan daftar invoice yang belum lunas untuk grup ini
                const pendingInvoices = await sheetsService.getPendingInvoices(groupConfig);

                if (pendingInvoices.length === 0) {
                    Logger.info(`Tidak ada invoice yang belum lunas untuk grup ${groupConfig.name}`);
                    continue;
                }

                // Kelompokkan invoice berdasarkan supplier
                const invoicesBySupplier = {};
                let totalNominalAll = 0;

                pendingInvoices.forEach((invoice) => {
                    const supplier = invoice.supplier || 'Lainnya';
                    const nominal = invoice.nominal || 0;
                    const noRekening = invoice.noRekening || '-';
                    const namaRekening = invoice.namaRekening || '-';

                    if (!invoicesBySupplier[supplier]) {
                        invoicesBySupplier[supplier] = {
                            invoices: [],
                            totalNominal: 0,
                            noRekening: noRekening,
                            namaRekening: namaRekening
                        };
                    }

                    invoicesBySupplier[supplier].invoices.push(invoice);
                    invoicesBySupplier[supplier].totalNominal += nominal;
                    totalNominalAll += nominal;
                });

                // Format pesan untuk notifikasi - lebih mudah dibaca
                let message = `📋 *DAFTAR INVOICE BELUM LUNAS*\n`;
                message += `📍 Grup: *${groupConfig.name}*\n`;

                // Urutkan supplier berdasarkan abjad
                const sortedSuppliers = Object.keys(invoicesBySupplier).sort();

                sortedSuppliers.forEach((supplier, index) => {
                    const supplierData = invoicesBySupplier[supplier];

                    message += `\n👨‍💼 *${supplier}*\n`;
                    message += `💰 Total: *Rp ${supplierData.totalNominal.toLocaleString('id-ID')}*\n`;
                    message += `🏦 No. Rekening: \`${supplierData.noRekening}\`\n`;
                    message += `👤 Nama Rekening: \`${supplierData.namaRekening}\`\n\n`;

                    supplierData.invoices.forEach((invoice, idx) => {
                        // Format yang lebih mudah dibaca dengan emoji dan penggantian baris yang lebih jelas
                        message += `${idx + 1}. \`${invoice.invoiceNumber}\` (${invoice.date})\n`;
                        message += `   💵 Rp ${invoice.nominal.toLocaleString('id-ID')}\n`;
                        message += `   📝 ${invoice.description}\n`;
                    });

                    // Tambahkan pemisah antar supplier yang lebih jelas
                    if (index < sortedSuppliers.length - 1) {
                        message += `\n${'─'.repeat(18)}\n`;
                    }
                });

                // Tambahkan total nominal keseluruhan dengan format ringkas namun jelas
                message += `\n${'═'.repeat(25)}\n`;
                message += `💵 *TOTAL KESELURUHAN:*\n*Rp ${totalNominalAll.toLocaleString('id-ID')}*\n`;
                message += `📊 Jumlah invoice: ${pendingInvoices.length}`;

                // Kirim pesan notifikasi ke topic grup
                try {
                    await bot.telegram.sendMessage(
                        groupId,
                        message, {
                            parse_mode: 'Markdown',
                            message_thread_id: groupConfig.notificationTopicId
                        }
                    );

                    Logger.success(`Notifikasi ${pendingInvoices.length} invoice belum lunas berhasil dikirim ke grup ${groupConfig.name}`);
                } catch (error) {
                    // Jika pesan terlalu panjang, pecah menjadi beberapa bagian
                    if (error.description && error.description.includes('message is too long')) {
                        // Kirim header terlebih dahulu
                        await bot.telegram.sendMessage(
                            groupId,
                            `📋 *DAFTAR INVOICE BELUM LUNAS*\n📍 Grup: *${groupConfig.name}*`, {
                                parse_mode: 'Markdown',
                                message_thread_id: groupConfig.notificationTopicId
                            }
                        );

                        // Kirim data per supplier dengan format ringkas
                        for (const supplier of sortedSuppliers) {
                            const supplierData = invoicesBySupplier[supplier];
                            let supplierMessage = `👨‍💼 *${supplier}*\n`;
                            supplierMessage += `💰 Total: *Rp ${supplierData.totalNominal.toLocaleString('id-ID')}*\n`;
                            supplierMessage += `🏦 No. Rekening: \`${supplierData.noRekening}\`\n`;
                            supplierMessage += `👤 Nama Rekening: \`${supplierData.namaRekening}\`\n\n`;

                            supplierData.invoices.forEach((invoice, idx) => {
                                supplierMessage += `${idx + 1}. \`${invoice.invoiceNumber}\` (${invoice.date})\n`;
                                supplierMessage += `   💵 Rp ${invoice.nominal.toLocaleString('id-ID')}\n`;
                                supplierMessage += `   📝 ${invoice.description}\n\n`;
                            });

                            await bot.telegram.sendMessage(
                                groupId,
                                supplierMessage, {
                                    parse_mode: 'Markdown',
                                    message_thread_id: groupConfig.notificationTopicId
                                }
                            );
                        }

                        // Kirim summary ringkas
                        let summaryMessage = `\n${'═'.repeat(25)}\n`;
                        summaryMessage += `💵 *TOTAL KESELURUHAN:*\n*Rp ${totalNominalAll.toLocaleString('id-ID')}*\n`;
                        summaryMessage += `📊 Jumlah invoice: ${pendingInvoices.length}`;

                        await bot.telegram.sendMessage(
                            groupId,
                            summaryMessage, {
                                parse_mode: 'Markdown',
                                message_thread_id: groupConfig.notificationTopicId
                            }
                        );

                        Logger.success(`Notifikasi ${pendingInvoices.length} invoice belum lunas berhasil dikirim ke grup ${groupConfig.name} (dalam beberapa bagian)`);
                    } else {
                        throw error;
                    }
                }
            } catch (error) {
                Logger.error(`Gagal mengirim notifikasi ke grup ${groupConfig.name}:`, error);
            }
        }
    } catch (error) {
        Logger.error('Gagal mengirim notifikasi invoice belum lunas:', error);
    }
}

// Fungsi untuk setup penjadwalan notifikasi
function setupNotificationScheduler() {
    if (!config.notification.enabled) {
        Logger.info('Notifikasi invoice belum lunas tidak diaktifkan.');
        return;
    }

    // Parse waktu notifikasi dari konfigurasi
    const [hour, minute] = config.notification.time.split(':');

    // Jadwalkan notifikasi menggunakan node-cron
    // Format: minute hour day month day-of-week
    const cronSchedule = `${minute} ${hour} * * *`;

    Logger.info(`Mengatur penjadwalan notifikasi invoice belum lunas pada pukul ${config.notification.time} WIB.`);

    cron.schedule(cronSchedule, sendPendingInvoicesNotification, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    });
}

// Memulai aplikasi
async function initializeApp() {
    try {
        Logger.info('Memulai BOT...');
        Logger.info('Memulai inisialisasi BOT...');

        // Inisialisasi services terlebih dahulu
        Logger.info('Menginisialisasi Google Sheets API...');
        await sheetsService.ensureTransactionSheetExists();
        Logger.success('Sheet Transaksi ditemukan dan siap digunakan');

        Logger.info('Menginisialisasi Google Drive API...');
        await driveService.init();
        Logger.success('Google Drive API berhasil diinisialisasi');

        // Setup notifikasi terjadwal
        setupNotificationScheduler();

        // Setup shutdown handlers
        process.once('SIGINT', async() => {
            Logger.warning('Menerima sinyal shutdown (SIGINT)...');
            await bot.stop('SIGINT');
            process.exit(0);
        });

        process.once('SIGTERM', async() => {
            Logger.warning('Menerima sinyal shutdown (SIGTERM)...');
            await bot.stop('SIGTERM');
            process.exit(0);
        });

        // Jalankan bot setelah semua inisialisasi selesai
        Logger.info('Menjalankan BOT...');
        bot.launch();

        // Tunggu sebentar untuk memastikan bot sudah benar-benar berjalan
        await new Promise(resolve => setTimeout(resolve, 1000));
        Logger.success('BOT berhasil dijalankan!');

    } catch (error) {
        Logger.error('Gagal menginisialisasi aplikasi', error);
        process.exit(1);
    }
}

// Memulai aplikasi
initializeApp().catch(error => {
    Logger.error('Terjadi error yang tidak tertangkap:', error);
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    // Cek apakah error berkaitan dengan "message to be replied not found"
    if (error.message && error.message.includes('message to be replied not found')) {
        Logger.error(`Terjadi error yang tidak tertangkap: | Detail: ${error.message}`);
        // Jangan exit process untuk error reply yang gagal, biarkan bot tetap berjalan
    } else {
        Logger.error('Terjadi error yang tidak tertangkap:', error);
        process.exit(1);
    }
});

// Fungsi untuk menangani perintah pelunasan dengan file
async function handlePelunasanWithFile(ctx) {
    try {
        const caption = ctx.message.caption;
        const data = parseUpdateStatusMessage(caption);

        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        if (!data) {
            ctx.reply('❌ Format pesan tidak valid. Gunakan format:\n/pelunasan\n[nomor invoice/VA]', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Tambahkan data pengirim
        data.pengirim = getSenderName(ctx);

        // Penanganan error untuk field yang kosong
        if (data.error) {
            if (data.missingFields && data.missingFields.length > 0) {
                ctx.reply(`❌ ${data.missingFields.join(', ')} tidak boleh kosong!`, {
                    reply_to_message_id: ctx.message.message_id
                });
                Logger.error(`Fields [${data.missingFields.join(', ')}] error pada pelunasan (Pengirim: ${data.pengirim})`);
            } else {
                ctx.reply(`❌ ${data.message || 'Format pesan tidak valid'}`, {
                    reply_to_message_id: ctx.message.message_id
                });
                Logger.error(`Format pesan pelunasan tidak valid: ${data.message || 'unknown error'} (Pengirim: ${data.pengirim})`);
            }
            return;
        }

        // Cari transaksi yang akan dilunasi
        let invoice;
        try {
            invoice = await sheetsService.findInvoice(data.noInvoice, groupConfig);
            if (!invoice) {
                ctx.reply(`❌ Transaksi dengan Nomor: ${data.noInvoice} tidak ditemukan.`, {
                    reply_to_message_id: ctx.message.message_id
                });
                return;
            }

            // Periksa apakah ini pembelian (tidak bisa melunasi penjualan)
            if (invoice.data[1] !== 'Pembelian') {
                ctx.reply('❌ Hanya transaksi pembelian yang dapat dilunasi.', {
                    reply_to_message_id: ctx.message.message_id
                });
                return;
            }

            // Periksa apakah sudah lunas
            if (invoice.data[7] === 'Lunas') {
                ctx.reply(`❌ Transaksi dengan Nomor: ${data.noInvoice} sudah berstatus LUNAS.`, {
                    reply_to_message_id: ctx.message.message_id
                });
                return;
            }
        } catch (error) {
            Logger.error(`Error saat mencari invoice: ${error.message} (Pengirim: ${data.pengirim})`);
            ctx.reply(`❌ Terjadi kesalahan saat mencari transaksi: ${error.message}`, {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Proses file bukti transfer
        let fileId, mimeType, fileName;

        // Format tanggal DD-MM-YYYY menggunakan fungsi dari sheetsService
        const formattedDate = sheetsService.formatDateFromSheet(invoice.data[0]);
        // Dapatkan nama supplier
        const supplierName = invoice.data[4].replace(/\s+/g, '-');

        // Format nama file: B.DD-MM-YYYY.NOINV.SUPPLIER-TF.ext
        if (ctx.message.document) {
            fileId = ctx.message.document.file_id;
            mimeType = ctx.message.document.mime_type;
            const originalExt = path.extname(ctx.message.document.file_name);
            fileName = `B.${formattedDate}.${data.noInvoice}.${supplierName}-${groupConfig.name}-TF${originalExt}`;
        } else if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            fileId = photo.file_id;
            mimeType = 'image/jpeg';
            fileName = `B.${formattedDate}.${data.noInvoice}.${supplierName}-${groupConfig.name}-TF.jpg`;
        }

        const statusMessage = await ctx.reply('⏳ Memproses pelunasan...', {
            reply_to_message_id: ctx.message.message_id
        });

        try {
            // Format waktu update dengan pengirim
            const now = new Date();
            const options = {
                timeZone: 'Asia/Jakarta',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            };
            const waktuUpdateFormatted = new Intl.DateTimeFormat('id-ID', options).format(now);
            const waktuUpdate = `${data.pengirim} (${waktuUpdateFormatted})`;

            // Upload bukti transfer ke Google Drive
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink);
            const fileBuffer = Buffer.from(await response.arrayBuffer());

            const optimizedBuffer = optimizeFileProcessing(fileBuffer, mimeType);

            const uploadResult = await driveService.uploadFile(optimizedBuffer, mimeType, fileName, groupConfig);

            // Update status transaksi menjadi lunas
            const rowIndex = await sheetsService.updatePurchaseStatus(data.noInvoice, uploadResult.url, data.pengirim, waktuUpdate, groupConfig);

            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }


            // Cek apakah ini transaksi iklan (IsIklan = 1)
            const isIklan = invoice.data.length >= 16 && Number(invoice.data[15]) === 1;
            const originalSender = invoice.data.length >= 15 ? invoice.data[14] : ''; // Ambil username dari kolom O (Pengirim)

            // Siapkan pesan konfirmasi
            let confirmationMessage = `✅ Invoice *${escapeMarkdown(data.noInvoice)}* berhasil dilunasi.`;

            // Jika ini transaksi iklan dan ada username pengirim, tambahkan tag
            if (isIklan && originalSender && originalSender.trim() !== '') {
                confirmationMessage = `✅ Invoice *${escapeMarkdown(data.noInvoice)}* berhasil dilunasi.\n\n${originalSender}, silahkan kirim invoice iklan dengan menggunakan command berikut:\n\`\`\`\n/invoiceiklan\nNo. VA: ${data.noInvoice}\n\`\`\``;
            }

            await ctx.replyWithMarkdown(confirmationMessage, {
                reply_to_message_id: ctx.message.message_id
            });

            Logger.success(`Pelunasan berhasil untuk transaksi ${data.noInvoice} (Pengirim: ${data.pengirim}, Baris: ${rowIndex})`);

        } catch (error) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }

            Logger.error(`Gagal melakukan pelunasan: ${error.message} (Pengirim: ${data.pengirim})`);

            await ctx.reply(`❌ Terjadi kesalahan saat memproses pelunasan: ${error.message}`, {
                reply_to_message_id: ctx.message.message_id
            });
        }
    } catch (error) {
        Logger.error(`Error pelunasan: ${error.message}`, error);

        ctx.reply('❌ Terjadi kesalahan saat memproses pelunasan. Silakan coba lagi.', {
            reply_to_message_id: ctx.message.message_id
        });
    }
}

// Fungsi untuk menangani perintah pelunasan massal dengan file
async function handlePelunasanMassalWithFile(ctx) {
    try {
        const caption = ctx.message.caption;
        const data = parseUpdateStatusBatchMessage(caption);

        // Dapatkan konfigurasi grup
        const groupConfig = ctx.groupConfig;

        if (!data) {
            ctx.reply('❌ Format pesan tidak valid. Gunakan format:\n/pelunasanmassal\nNOINV1\nNOINV2\nNOINV3\n...', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        if (data.error) {
            ctx.reply(`❌ ${data.message || 'Format pesan tidak valid'}`, {
                reply_to_message_id: ctx.message.message_id
            });
            Logger.error(`Format pesan pelunasan massal tidak valid: ${data.message || 'unknown error'} (Pengirim: ${getSenderName(ctx)})`);
            return;
        }

        if (data.invoices.length === 0) {
            ctx.reply('❌ Tidak ada nomor invoice yang ditemukan dalam pesan.', {
                reply_to_message_id: ctx.message.message_id
            });
            return;
        }

        // Tambahkan data pengirim
        data.pengirim = getSenderName(ctx);

        // Validasi semua invoice berasal dari supplier yang sama
        const statusCheckMessage = await ctx.reply('⏳ Memeriksa invoice...', {
            reply_to_message_id: ctx.message.message_id
        });

        // Cek supplier semua invoice
        let commonSupplier = null;
        let invalidInvoices = [];
        let supplierName = '';

        // Kumpulkan semua invoice dan periksa supplier
        for (const invoiceNumber of data.invoices) {
            try {
                const invoice = await sheetsService.findInvoice(invoiceNumber, groupConfig);

                if (!invoice) {
                    invalidInvoices.push(`${invoiceNumber} (tidak ditemukan)`);
                    continue;
                }

                // Periksa apakah ini pembelian (tidak bisa melunasi penjualan)
                if (invoice.data[1] !== 'Pembelian') {
                    invalidInvoices.push(`${invoiceNumber} (bukan pembelian)`);
                    continue;
                }

                // Periksa apakah sudah lunas
                if (invoice.data[7] === 'Lunas') {
                    invalidInvoices.push(`${invoiceNumber} (sudah lunas)`);
                    continue;
                }

                // Ambil supplier (kolom 4 = supplier)
                const invoiceSupplier = invoice.data[4];

                // Jika ini invoice pertama yang valid, tetapkan sebagai supplier umum
                if (commonSupplier === null) {
                    commonSupplier = invoiceSupplier;
                    supplierName = invoiceSupplier;
                }
                // Jika ada invoice dengan supplier berbeda, catat sebagai invalid
                else if (commonSupplier !== invoiceSupplier) {
                    invalidInvoices.push(`${invoiceNumber} (supplier: ${invoiceSupplier}, berbeda dari ${commonSupplier})`);
                }
            } catch (error) {
                invalidInvoices.push(`${invoiceNumber} (error: ${error.message})`);
            }
        }

        // Jika ada invoice tidak valid atau supplier berbeda
        if (invalidInvoices.length > 0) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusCheckMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }

            try {
                ctx.reply(`❌ Pelunasan massal gagal karena:\n- ${invalidInvoices.join('\n- ')}\n\nPelunasan massal hanya dapat dilakukan untuk invoice dengan supplier yang sama.`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } catch (replyError) {
                // Jika gagal membalas, coba kirim pesan baru tanpa reply
                Logger.error(`Gagal mengirim balasan error: ${replyError.message}`);
                try {
                    ctx.reply(`❌ Pelunasan massal gagal karena:\n- ${invalidInvoices.join('\n- ')}\n\nPelunasan massal hanya dapat dilakukan untuk invoice dengan supplier yang sama.`);
                } catch (sendError) {
                    Logger.error(`Gagal mengirim pesan error: ${sendError.message}`);
                }
            }
            return;
        }

        // Jika tidak ada invoice valid
        if (!commonSupplier) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusCheckMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }

            try {
                ctx.reply('❌ Tidak ada invoice valid untuk dilunasi.', {
                    reply_to_message_id: ctx.message.message_id
                });
            } catch (replyError) {
                // Jika gagal membalas, coba kirim pesan baru tanpa reply
                Logger.error(`Gagal mengirim balasan: ${replyError.message}`);
                try {
                    await ctx.reply(`❌ Tidak ada invoice valid untuk dilunasi.`);
                } catch (sendError) {
                    Logger.error(`Gagal mengirim pesan: ${sendError.message}`);
                }
            }
            return;
        }

        // Update status message
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusCheckMessage.message_id,
                undefined,
                '⏳ Memproses pelunasan massal...'
            );
        } catch (editError) {
            // Lanjutkan meskipun gagal update status
        }

        // Proses file bukti transfer
        let fileId, mimeType, fileName;

        // Format tanggal untuk nama file (gunakan tanggal hari ini)
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

        // Format nama file dengan supplier yang sebenarnya: B.DD-MM-YYYY.REKAP-PEMBAYARAN.SUPPLIERNAME-TF.ext
        const normalizedSupplierName = supplierName.replace(/\s+/g, '-');

        if (ctx.message.document) {
            fileId = ctx.message.document.file_id;
            mimeType = ctx.message.document.mime_type;
            const originalExt = path.extname(ctx.message.document.file_name);
            fileName = `B.${formattedDate}.REKAP-PEMBAYARAN.${normalizedSupplierName}-${groupConfig.name}-TF${originalExt}`;
        } else if (ctx.message.photo) {
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            fileId = photo.file_id;
            mimeType = 'image/jpeg';
            fileName = `B.${formattedDate}.REKAP-PEMBAYARAN.${normalizedSupplierName}-${groupConfig.name}-TF.jpg`;
        }

        const statusMessage = statusCheckMessage;

        try {
            // Upload bukti transfer ke Google Drive
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const response = await fetch(fileLink);
            const fileBuffer = Buffer.from(await response.arrayBuffer());

            const optimizedBuffer = optimizeFileProcessing(fileBuffer, mimeType);

            const uploadResult = await driveService.uploadFile(optimizedBuffer, mimeType, fileName, groupConfig);

            // Kita sudah memfilter invoice yang valid pada tahap validasi,
            // jadi kita hanya melunasi invoice yang memiliki supplier sama
            const results = await sheetsService.updatePurchaseStatusBatch(data.invoices, data.pengirim, uploadResult.url, groupConfig);

            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }

            // Buat pesan konfirmasi
            let message = [];

            if (results.success.length > 0) {
                message.push(`✅ Berhasil melunasi ${results.success.length} invoice: ${results.success.join(', ')}`);
            }

            if (results.notFound.length > 0) {
                message.push(`❌ ${results.notFound.length} invoice tidak ditemukan: ${results.notFound.join(', ')}`);
            }

            if (results.alreadyPaid.length > 0) {
                message.push(`⚠️ ${results.alreadyPaid.length} invoice sudah lunas sebelumnya: ${results.alreadyPaid.join(', ')}`);
            }

            try {
                await ctx.replyWithMarkdown(message.join('\n'), {
                    reply_to_message_id: ctx.message.message_id
                });

            } catch (replyError) {
                // Jika gagal membalas, coba kirim pesan baru tanpa reply
                Logger.error(`Gagal mengirim balasan: ${replyError.message}`);
                try {
                    await ctx.replyWithMarkdown(message.join('\n'));
                } catch (sendError) {
                    Logger.error(`Gagal mengirim pesan: ${sendError.message}`);
                }
            }

            Logger.success(`Pelunasan massal berhasil: ${results.success.length} berhasil, ${results.notFound.length} tidak ditemukan, ${results.alreadyPaid.length} sudah lunas (Pengirim: ${data.pengirim})`);

        } catch (error) {
            try {
                await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
            } catch (deleteError) {
                // Lanjutkan saja jika gagal menghapus
            }

            Logger.error(`Gagal melakukan pelunasan massal: ${error.message} (Pengirim: ${data.pengirim})`);

            try {
                await ctx.reply(`❌ Terjadi kesalahan saat memproses pelunasan massal: ${error.message}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } catch (replyError) {
                Logger.error(`Gagal mengirim balasan error: ${replyError.message}`);
                try {
                    await ctx.reply(`❌ Terjadi kesalahan saat memproses pelunasan massal: ${error.message}`);
                } catch (sendError) {
                    Logger.error(`Gagal mengirim pesan: ${sendError.message}`);
                }
            }
        }
    } catch (error) {
        Logger.error(`Error pelunasan massal: ${error.message}`, error);

        try {
            ctx.reply('❌ Terjadi kesalahan saat memproses pelunasan massal. Silakan coba lagi.', {
                reply_to_message_id: ctx.message.message_id
            });
        } catch (replyError) {
            Logger.error(`Gagal mengirim balasan pada error umum: ${replyError.message}`);
            try {
                ctx.reply('❌ Terjadi kesalahan saat memproses pelunasan massal. Silakan coba lagi.');
            } catch (sendError) {
                Logger.error(`Gagal mengirim pesan pada error umum: ${sendError.message}`);
            }
        }
    }
}