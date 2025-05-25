#!/bin/bash

# Update repository
git pull origin main

# Install dependencies
npm install --production

# Copy environment file if not exists
if [ ! -f .env ]; then
    cp env.example .env
    echo "Please update .env file with your configuration"
fi

# Copy credentials file if not exists
if [ ! -f credentials.json ]; then
    cp credentials.json.example credentials.json
    echo "Please update credentials.json with your Google API credentials"
fi

# Restart PM2 process
pm2 restart ecosystem.config.js 