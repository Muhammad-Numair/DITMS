FROM node:20-alpine
WORKDIR /app

# 1. Force context paths to read from the monorepo subfolder explicitly
COPY backend/package*.json ./

# 2. Run a resilient dependency installation 
RUN npm install --no-audit --no-fund

# 3. Copy the rest of the backend files over 
COPY backend/ ./

# 4. Compile the TypeScript scripts
RUN npm run build

EXPOSE 5000

# 5. Run the compiled JS bundle directly
CMD ["node", "dist/index.js"]
