
import * as path from 'path';
import { _logger } from '../utils/log/winston';
import { FileService } from '../llm/file';
import { BaseLLMService } from '../llm/base';
import { XMLService } from '../llm/parser/xml';
import { PromptService } from '../llm/prompt';

export class FileAnalyser {
    constructor(
        private fileService: FileService,
        private llmService: BaseLLMService,
        private xmlService: XMLService,
        private promptService: PromptService,
    ) { }

    async identifyCriticalFiles(projectDir: string): Promise<string[]> {
        try {
            const allFiles = await this.fileService.readDirectoryRecursively(projectDir);

            const directoryStructure = allFiles
                .map((file: string) => path.relative(projectDir, file))
                .join('\n');
            const prompt = this.promptService.getCriticalFilesPrompt(directoryStructure);
            const response = await this.llmService.generateContent(prompt);

            if (!response.success) {
                throw new Error(`Failed to identify critical files: ${response.error}`);
            }
            const criticalFiles = this.xmlService.extractCriticalFiles(response.content);
            return criticalFiles.map((file: string) => path.join(projectDir, file));
        } catch (error) {
            _logger.error(`Error identifying critical files: ${error}`);
            throw error;
        }
    }

    async extractImplementationFiles(
        testFiles: { path: string; content: string }[],
        projectDir: string
    ): Promise<{ path: string; content: string }[]> {
        const implementationFiles: { path: string; content: string }[] = [];

        for (const testFile of testFiles) {
            const importRegex = /import\s+.*\s+from\s+['"](.+)['"]/g;
            const content = testFile.content;
            let match;

            while ((match = importRegex.exec(content)) !== null) {
                const importPath = match[1];

                // Skip node modules and relative paths that go up directories
                if (importPath.startsWith('.') && !importPath.startsWith('..')) {
                    try {
                        // Resolve the path relative to the test file
                        const testDir = path.dirname(testFile.path);
                        let resolvedPath = path.resolve(testDir, importPath);

                        if (!path.extname(resolvedPath)) {
                            for (const ext of ['.js', '.ts', '.jsx', '.tsx']) {
                                const pathWithExt = `${resolvedPath}${ext}`;
                                try {
                                    await this.fileService.getFileInfo(pathWithExt);
                                    resolvedPath = pathWithExt;
                                    break;
                                } catch (error) {
                                    // Skip if file doesn't exist
                                }
                            }
                        }

                        try {
                            const fileInfo = await this.fileService.getFileInfo(resolvedPath);

                            if (!fileInfo.isDirectory) {
                                const content = await this.fileService.readFile(resolvedPath);
                                implementationFiles.push({
                                    path: resolvedPath,
                                    content
                                });
                            }
                        } catch (error) {

                        }
                    } catch (error) {
                        // Skip if path resolution fails
                    }
                }
            }
        }

        return implementationFiles;
    }

    extractErrorFiles(testOutput: string, projectDir: string): string[] {
        const lines = testOutput.split('\n');
        const fileRegex = /([a-zA-Z0-9_\-/.]+\.(js|ts|jsx|tsx))/g;
        const uniqueFiles = new Set<string>();

        lines.forEach(line => {
            const matches = line.match(fileRegex);
            if (matches) {
                matches.forEach(match => {
                    if (match.includes('/') || match.includes('\\')) {
                        try {
                            let fullPath = match;
                            if (!path.isAbsolute(match)) {
                                fullPath = path.join(projectDir, match);
                            }
                            uniqueFiles.add(fullPath);
                        } catch (error) {
                            // Skip if path is invalid
                        }
                    }
                });
            }
        });

        return Array.from(uniqueFiles);
    }



}