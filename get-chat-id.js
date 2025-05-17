// Import library Telegraf
const { Telegraf } = require('telegraf');
require('dotenv').config();

// Gunakan token bot dari .env
const bot = new Telegraf(process.env.BOT_TOKEN);

// Log semua update yang diterima bot
bot.use((ctx, next) => {
    console.log('Update diterima:', JSON.stringify(ctx.update, null, 2));
    return next();
});

// Handler untuk perintah /chatid
bot.command('chatid', (ctx) => {
    ctx.reply(`ID chat ini adalah: ${ctx.chat.id}`);
    console.log('Chat ID:', ctx.chat.id, 'Chat Type:', ctx.chat.type, 'Chat Title:', ctx.chat.title || 'Private Chat');
});

// Handler untuk semua pesan
bot.on('message', (ctx) => {
    const chatId = ctx.chat.id;
    ctx.reply(`ID chat ini adalah: ${chatId}`);
    console.log('Chat ID:', chatId, 'Chat Type:', ctx.chat.type, 'Chat Title:', ctx.chat.title || 'Private Chat');
});

// Start bot
bot.launch()
    .then(() => {
        console.log('Bot started successfully!');
        console.log('Kirim /chatid atau pesan apa saja untuk mendapatkan ID chat.');
    })
    .catch((err) => {
        console.error('Error starting bot:', err);
    });

// Menangani shutdown dengan baik
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    console.log('Bot stopped due to SIGINT');
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    console.log('Bot stopped due to SIGTERM');
});