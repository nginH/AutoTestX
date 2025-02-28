import * as winston from 'winston';
import * as dotenv from 'dotenv';
dotenv.config();

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
    const colorizer = winston.format.colorize();
    const coloredMessage = colorizer.colorize('info', message as string);
    return `${timestamp} [${level}]: ${coloredMessage}`;
});

export const _logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        }),
        customFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'autoTestX.log' })
    ],
});
