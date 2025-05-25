# Gunakan node versi LTS
FROM node:18-alpine

# Buat direktori aplikasi
WORKDIR /app

# Install dependensi sistem yang diperlukan
RUN apk add --no-cache python3 make g++

# Copy package.json dan package-lock.json
COPY package*.json ./

# Install dependensi
RUN npm install

# Copy seluruh kode sumber
COPY . .

# Expose port jika diperlukan (opsional untuk bot Telegram)
EXPOSE 3000

# Command untuk menjalankan aplikasi
CMD ["node", "main.js"] 