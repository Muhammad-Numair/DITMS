// backend/src/utils/logger.ts
import winston from 'winston';
import fs from 'fs';
if (!fs.existsSync('logs')) fs.mkdirSync('logs');
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}] ${message}`)
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/ditms.log', format: winston.format.uncolorize() }),
  ],
});
