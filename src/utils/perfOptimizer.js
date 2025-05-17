/**
 * Utilitas untuk mengoptimalkan performa bot
 * File ini berisi fungsi-fungsi yang membantu bot berjalan dengan lebih efisien
 */

// Cache sementara untuk menghindari pembacaan API berulang
const memoryCache = {
    data: new Map(),

    // Simpan data ke cache dengan expiry time
    set(key, value, ttlSeconds = 300) {
        const expiry = Date.now() + (ttlSeconds * 1000);
        this.data.set(key, { value, expiry });

        // Set timeout untuk menghapus data yang sudah expired
        setTimeout(() => {
            if (this.data.has(key) && this.data.get(key).expiry <= Date.now()) {
                this.data.delete(key);
            }
        }, ttlSeconds * 1000);
    },

    // Ambil data dari cache
    get(key) {
        if (!this.data.has(key)) {
            return null;
        }

        const item = this.data.get(key);

        // Cek apakah data sudah expired
        if (item.expiry <= Date.now()) {
            this.data.delete(key);
            return null;
        }

        return item.value;
    },

    // Hapus data dari cache
    delete(key) {
        this.data.delete(key);
    },

    // Bersihkan seluruh cache
    clear() {
        this.data.clear();
    }
};

// Fungsi untuk melakukan batch operation pada API calls
const batchProcessor = {
    queue: [],
    isProcessing: false,
    processBatchSize: 10,
    processingDelay: 100, // ms

    // Tambahkan item ke queue
    add(item, processor, callback) {
        this.queue.push({ item, processor, callback });

        if (!this.isProcessing) {
            this.processQueue();
        }
    },

    // Proses queue
    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessing = false;
            return;
        }

        this.isProcessing = true;

        // Ambil batch sesuai jumlah processBatchSize
        const batchItems = this.queue.splice(0, this.processBatchSize);

        try {
            // Proses batch items secara paralel dengan Promise.all
            await Promise.all(batchItems.map(async({ item, processor, callback }) => {
                try {
                    const result = await processor(item);
                    if (callback) callback(null, result);
                } catch (error) {
                    if (callback) callback(error);
                }
            }));
        } catch (error) {
            console.error('Error saat memproses batch:', error);
        }

        // Delay sebelum memproses batch berikutnya
        setTimeout(() => this.processQueue(), this.processingDelay);
    }
};

// Fungsi untuk rate limiting
function createRateLimiter(maxRequests, timeWindowMs) {
    const requests = [];

    return function checkRateLimit() {
        const now = Date.now();

        // Hapus requests yang sudah expired
        while (requests.length > 0 && requests[0] <= now - timeWindowMs) {
            requests.shift();
        }

        // Cek apakah sudah mencapai batas
        if (requests.length < maxRequests) {
            requests.push(now);
            return true; // Request diperbolehkan
        }

        return false; // Request tidak diperbolehkan (rate limited)
    };
}

// Fungsi untuk mengoptimalkan pemrosesan file
function optimizeFileProcessing(fileBuffer, mimeType) {
    // Fungsi ini akan dapat digunakan untuk mengoptimalkan ukuran file
    // sebelum diupload ke Google Drive

    // Untuk versi awal, kita hanya memastikan bahwa file tidak terlalu besar
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB

    if (fileBuffer.length > MAX_SIZE) {
        throw new Error('Ukuran file terlalu besar. Maksimal 10MB.');
    }

    return fileBuffer;
}

module.exports = {
    memoryCache,
    batchProcessor,
    createRateLimiter,
    optimizeFileProcessing
};