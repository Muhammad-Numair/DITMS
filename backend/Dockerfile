FROM node:20-alpine
WORKDIR /app

# Copy configuration metadata files
COPY package*.json ./

# Use a highly resilient install routine that bypasses lockfile matching checks
RUN npm install --no-audit --no-fund

# Copy the rest of the application files
COPY . .

# Run the TypeScript build step
RUN npm run build

EXPOSE 5000

# Execute the compiled JavaScript file directly
CMD ["node", "dist/index.js"]
