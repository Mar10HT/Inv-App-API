import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import * as path from 'path';

const isProduction = process.env.NODE_ENV === 'production';
const logDir = process.env.LOG_DIR || 'logs';

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, context, trace, ...meta }) => {
    const contextStr = context ? `[${context}]` : '';
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    const traceStr = trace ? `\n${trace}` : '';
    return `${timestamp} ${level} ${contextStr} ${message} ${metaStr}${traceStr}`;
  }),
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// File transports only for local development (Railway has ephemeral filesystem)
const fileTransports = isProduction
  ? []
  : [
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'combined.log'),
        level: process.env.LOG_LEVEL || 'info',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'http.log'),
        level: 'http',
        format: fileFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 3,
      }),
    ];

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    // Console transport - always enabled
    new winston.transports.Console({
      level: process.env.LOG_LEVEL || 'info',
      format: consoleFormat,
    }),
    ...fileTransports,
  ],

  // Exception/rejection handlers: files only in dev, console in prod
  ...(isProduction
    ? {}
    : {
        exceptionHandlers: [
          new winston.transports.File({
            filename: path.join(logDir, 'exceptions.log'),
            format: fileFormat,
          }),
        ],
        rejectionHandlers: [
          new winston.transports.File({
            filename: path.join(logDir, 'rejections.log'),
            format: fileFormat,
          }),
        ],
      }),
};
