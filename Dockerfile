FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy bot code
COPY bot.js test.js ./

# Run the bot
CMD ["node", "bot.js"]
