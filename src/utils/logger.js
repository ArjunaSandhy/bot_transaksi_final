const chalk = require('chalk');

class Logger {
    static info(message) {
        console.log(`[${new Date().toLocaleString('id-ID')}] ${chalk.blue('[INFO]')} ${message}`);
    }

    static success(message) {
        console.log(`[${new Date().toLocaleString('id-ID')}] ${chalk.green('[SUCCESS]')} ${message}`);
    }

    static warning(message) {
        console.log(`[${new Date().toLocaleString('id-ID')}] ${chalk.yellow('[WARN]')} ${message}`);
    }

    static error(message, error) {
        if (error) {
            const senderMatch = message.match(/\(Pengirim: (.*?)\)/);
            const sender = senderMatch ? senderMatch[1] : '';

            const errorMessage = error.message ? error.message.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '';

            if (sender) {
                console.error(`[${new Date().toLocaleString('id-ID')}] ${chalk.red('[ERROR]')} [${sender}] ${message} | Detail: ${errorMessage}`);
            } else {
                console.error(`[${new Date().toLocaleString('id-ID')}] ${chalk.red('[ERROR]')} ${message} | Detail: ${errorMessage}`);
            }
        } else {
            const senderMatch = message.match(/\(Pengirim: (.*?)\)/);
            const sender = senderMatch ? senderMatch[1] : '';

            if (sender) {
                console.error(`[${new Date().toLocaleString('id-ID')}] ${chalk.red('[ERROR]')} [${sender}] ${message}`);
            } else {
                console.error(`[${new Date().toLocaleString('id-ID')}] ${chalk.red('[ERROR]')} ${message}`);
            }
        }
    }

    static logTransaksi(data, rowNumber) {
        const transaksiInfo = `${data.type.toUpperCase()} | ${data.tanggal} | ${data.noInvoice} | ${data.keterangan} | ${data.type === 'penjualan' ? data.customer : data.supplier} | Rp ${parseInt(data.nominal).toLocaleString('id-ID')} | ${data.pengirim} | Ditambahkan pada baris ke-${rowNumber}`;
        this.success(transaksiInfo);
    }

    static logErrorTransaksi(data) {
        let errorType = "GAGAL_TRANSAKSI";
        if (data && data.error && data.missingFields) {
            errorType = "VALIDASI_GAGAL";
        }

        const pengirim = (data && data.pengirim) ? data.pengirim : 'unknown';
        const errorInfo = `${errorType} | Pengirim: ${pengirim} | ${data && data.type || '-'} | ${data && data.tanggal || '-'} | ${data && data.noInvoice || '-'} | ${data && data.keterangan || '-'} | ${data && data.type === 'penjualan' ? data && data.customer || '-' : data && data.supplier || '-'} | ${data && data.nominal || '-'}`;
        this.error(errorInfo);
    }
}

module.exports = Logger;