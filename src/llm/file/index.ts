import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { _logger } from '../../utils/log/winston';

// Convert callback-based fs methods to Promise-based
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

export interface FileServiceOptions {
    ignorePatterns?: string[];
    outputDir?: string;
}

export class FileService {
    private ignorePatterns: string[];
    private outputDir: string;

    private defaultIgnorePatterns = [
        ".git",
        "node_modules",
        ".vscode",
        ".idea",
        "dist",
        "lib",
        "build",
        "coverage",
        "*.log",
        "*.logs",
        "*.md"
    ];

    constructor(options: FileServiceOptions = {}) {
        this.ignorePatterns = [...this.defaultIgnorePatterns, ...(options.ignorePatterns || [])];
        this.outputDir = options.outputDir || path.join(process.cwd(), 'output');
        _logger.info(`File service initialized, output directory: ${this.outputDir}`);
    }
    private shouldIgnore(filePath: string): boolean {
        const normalizedPath = filePath.replace(/\\/g, '/');
        return this.ignorePatterns.some(pattern => {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*');
            const regex = new RegExp(regexPattern);
            return regex.test(normalizedPath);
        });
    }
    async readDirectoryRecursively(dir: string): Promise<string[]> {
        try {
            const baseDir = path.resolve(dir);
            const entries = await readdir(baseDir, { withFileTypes: true });

            const files = await Promise.all(
                entries.map(async entry => {
                    const fullPath = path.join(baseDir, entry.name);

                    if (this.shouldIgnore(fullPath)) {
                        return [];
                    }

                    if (entry.isDirectory()) {
                        return await this.readDirectoryRecursively(fullPath);
                    }

                    return [fullPath];
                })
            );

            return files.flat();
        } catch (error) {
            _logger.error(`Error reading directory ${dir}: ${error}`);
            throw error;
        }
    }
    async readFile(filePath: string): Promise<string> {
        try {
            return await readFile(filePath, 'utf8');
        } catch (error) {
            _logger.error(`Error reading file ${filePath}: ${error}`);
            throw error;
        }
    }
    async ensureDirectory(dirPath: string): Promise<void> {
        try {
            await mkdir(dirPath, { recursive: true });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
                _logger.error(`Error creating directory ${dirPath}: ${error}`);
                throw error;
            }
        }
    }
    async writeFile(filePath: string, content: string | object): Promise<void> {
        try {
            const dirPath = path.dirname(filePath);
            await this.ensureDirectory(dirPath);

            const fileContent = typeof content === 'string'
                ? content
                : JSON.stringify(content, null, 2);

            await writeFile(filePath, fileContent, 'utf8');
            _logger.info(`Successfully wrote to file: ${filePath}`);
        } catch (error) {
            _logger.error(`Error writing to file ${filePath}: ${error}`);
            throw error;
        }
    }
    async getFileInfo(filePath: string): Promise<{
        path: string;
        size: number;
        extension: string;
        isDirectory: boolean;
        modifiedTime: Date;
    }> {
        try {
            const stats = await stat(filePath);
            return {
                path: filePath,
                size: stats.size,
                extension: path.extname(filePath),
                isDirectory: stats.isDirectory(),
                modifiedTime: stats.mtime
            };
        } catch (error) {
            _logger.error(`Error getting file info for ${filePath}: ${error}`);
            throw error;
        }
    }
    getOutputDirectory(): string {
        return this.outputDir;
    }
    setOutputDirectory(dir: string): void {
        this.outputDir = dir;
        _logger.info(`Output directory set to: ${this.outputDir}`);
    }
}