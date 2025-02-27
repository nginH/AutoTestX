import fs from 'fs';
import path from 'path';
import { _logger } from '../utils/log/winston';

class JSONParsingError extends Error {
    constructor(message: string, public readonly rawData: string) {
        super(message);
        this.name = 'JSONParsingError';
    }
}

export class JSONParser {
    private static readonly isDevelopment = process.env.NODE_ENV === 'development';
    private static readonly logDir = path.join(process.cwd(), 'logs');

    private static async logError(error: Error, rawData: string, context: string): Promise<void> {
        if (!this.isDevelopment) return;

        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
            }
            const timestamp = new Date().toISOString();
            const logFileName = path.join(this.logDir, `json-parsing-errors-${timestamp.split('T')[0]}.log`);

            const logEntry = {
                timestamp,
                errorType: error.name,
                message: error.message,
                context,
                rawData,
                stackTrace: error.stack,
            };

            const logMessage = `
                ==================== JSON Parsing Error ====================
                        Timestamp: ${timestamp}
                        Error Type: ${error.name}
                        Context: ${context}
                        Message: ${error.message}
                        Raw Data: ${rawData}
                        Stack Trace: ${error.stack}
                ======================================================\n\n`;

            await fs.promises.appendFile(logFileName, logMessage, 'utf8');

            _logger.error('JSON Parsing Error:', logEntry);
        } catch (logError) {
            _logger.error('Failed to write error log:', logError);
        }
    }

    static cleanJSONString(jsonString: string): string {
        let cleaned = jsonString.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*\[(?:info|error)\]:\s*/g, '');
        cleaned = cleaned.replace(/```json|```/g, '');
        cleaned = cleaned.replace(/^\s*>\s*/gm, '');
        cleaned = cleaned.replace(/[\n\r\t]/g, ' ');
        cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        cleaned = cleaned
            .replace(/,(\s*[}\]])/g, '$1')
            .replace(/([{,]\s*)(?<!\")([\w]+)(?![\w\s]*[\"])\s*:/g, '$1"$2":')
            .replace(/:\s*(?<!\")([\w.-]+)(?![\w\s]*[\"])(?=\s*[,}])/g, ':"$1"')
            .replace(/\s+/g, ' ')
            .trim();

        return cleaned;
    }
    static cleansJsonStringForFAQs(jsonString: string): string {
        let cleaned = jsonString.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*\[(?:info|error)\]:\s*/g, '');
        cleaned = cleaned.replace(/```json|```/g, '');
        cleaned = cleaned.replace(/^\s*>\s*/gm, '');
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
        cleaned = cleaned.replace(/(?<="description":\s*)"(.*?)"/gs, (match) => match.replace(/\s+/g, ' '));
        cleaned = cleaned.replace(/(?<="suggested_questions":\s*)\[(.*?)\]/gs, (match) => match.replace(/\s+/g, ' '));
        return cleaned.trim();
    }


    public static async tryParseJSON<T>(jsonString: string, errorCode: string): Promise<T> {
        if (!jsonString) {
            const error = new JSONParsingError(`Empty JSON string provided with error code: ${errorCode}`, jsonString);
            await this.logError(error, jsonString, 'Empty Input');
            return {
                error: error.message,
            } as T;
        }
        try {
            const cleaned = this.cleanJSONString(jsonString);
            return JSON.parse(cleaned);
        } catch (error) {
            try {
                const extracted = this.extractJSONObject(jsonString);
                if (!extracted) {
                    throw new Error('No valid JSON object found');
                }
                return JSON.parse(extracted);
            } catch (innerError) {
                const errorMessage = `JSON parsing failed: ${(innerError as Error).message} with error code: ${errorCode}`;
                const parsingError = new JSONParsingError(errorMessage, jsonString);
                await this.logError(parsingError, jsonString, 'Parsing Failed');
                return {
                    error: parsingError.message,
                } as T;
            }
        }
    }
    private static extractJSONObject(text: string): string | null {
        const matches = text.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/g);
        if (!matches) return null;
        const largestMatch = matches.reduce((a, b) => (a.length > b.length ? a : b));
        return this.cleanJSONString(largestMatch);
    }
}
