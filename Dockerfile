FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --production=false

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Create directories
RUN mkdir -p agent data import/inbox import/processed

EXPOSE 3000

CMD ["node", "dist/index.js"]
