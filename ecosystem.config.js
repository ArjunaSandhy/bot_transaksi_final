module.exports = {
    apps: [{
        name: 'bot-transaksi-telegram',
        script: 'main.js',
        watch: false,
        instances: 1,
        autorestart: true,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production'
        }
    }]
};