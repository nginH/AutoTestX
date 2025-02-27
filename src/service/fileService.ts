import fs from "fs";
import path from "path";
import { _logger } from "../utils/log/winston";
import CircularJSON from "circular-json";

const DefaultIgnoreFiles = [".git", "node_modules", ".vscode", ".idea", "dist", "lib", "build", "coverage", "test", "tests", "*.log", "*.logs", "*.md"];

export class FileService {
    private CustomIgnoreFiles: string[] = [];
    constructor(
        ignoreFiles: string[] = []
    ) {
        this.CustomIgnoreFiles = ignoreFiles;
        const currentPath = process.cwd();
        console.log(currentPath);
    }

    private shouldIgnore(filePath: string): boolean {
        DefaultIgnoreFiles.push(...this.CustomIgnoreFiles);
        return DefaultIgnoreFiles.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, ".*"));
            return regex.test(filePath);
        });
    }

    public async readFolderRecursively(dir: string): Promise<string[]> {
        const readDir = (dir: string): Promise<string[]> => {
            return new Promise((resolve, reject) => {
                fs.readdir(dir, { withFileTypes: true }, async (err, files) => {
                    if (err) {
                        return reject(err);
                    }
                    let filePaths: string[] = [];
                    for (const file of files) {
                        const fullPath = path.join(dir, file.name);
                        if (this.shouldIgnore(fullPath)) {
                            continue;
                        }
                        if (file.isDirectory()) {
                            const nestedFiles = await readDir(fullPath);
                            filePaths = filePaths.concat(nestedFiles);
                        } else {
                            filePaths.push(fullPath);
                        }
                    }
                    resolve(filePaths);
                });
            });
        };
        try {
            const files = await readDir(dir);
            return files;
        } catch (err) {
            console.error("Error reading folder recursively:", err);
            throw err;
        }
    }
    public async readFile(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, "utf8", (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(data);
            });
        });
    }
    public createFolder(folderPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            fs.mkdir(folderPath, { recursive: true }, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });
        });
    }

    public async writeFile(filePath: string, content: any, basePath?: string): Promise<void> {

        if (filePath === "") {
            const defaultFolderPath = path.join(process.cwd(), "llmOut");
            const defaultFilePath = path.join(defaultFolderPath, "output.xml");

            if (!fs.existsSync(defaultFolderPath)) {
                await this.createFolder(defaultFolderPath);
            }
            if (!fs.existsSync(defaultFilePath)) {
                fs.writeFileSync(defaultFilePath, "");
            }
            filePath = defaultFilePath;
        } else {
            const folderPath = path.dirname(filePath);
            if (!fs.existsSync(folderPath)) {
                await this.createFolder(folderPath);
            }
        }
        return new Promise((resolve, reject) => {
            const data = typeof content === 'string' ? content : CircularJSON.stringify(content);
            fs.writeFile(filePath, data, (err) => {
                if (err) {
                    console.error("Error writing to file:", err);
                    return reject(err);
                }
                resolve();
            });
        });
    }
}
