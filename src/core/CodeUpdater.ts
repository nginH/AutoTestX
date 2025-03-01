import { XMLService } from "../llm/parser/xml";
import { CodeUpdate } from "../types";

import * as path from 'path';
import { _logger } from "../utils/log/winston";
import { FileService } from "../llm/file";
import { BaseLLMService } from "../llm/base";
import { PromptService } from "../llm/prompt";
import { FileAnalyser } from "./fileAnalyser";
export class CodeUpdater {
    constructor(
        private fileService: FileService,
        private xmlService: XMLService,
        private llmService: BaseLLMService,
        private promptService: PromptService,
        private fileAnalyser: FileAnalyser
    ) { }

    async getGeneralCodeUpdates(
        projectDir: string,
        testOutput: string
    ): Promise<CodeUpdate[]> {
        const files = await this.fileService.readDirectoryRecursively(projectDir);
        const testFiles = files.filter((file: string | string[]) =>
            file.includes('.test.') ||
            file.includes('.spec.') ||
            file.includes('__tests__')
        );
        const recentTestFiles = await Promise.all(
            testFiles.slice(0, 3).map(async (file: any) => {
                try {
                    const stats = await this.fileService.getFileInfo(file);
                    return {
                        path: file,
                        content: await this.fileService.readFile(file),
                        modifiedTime: stats.modifiedTime
                    };
                } catch (error) {
                    return null;
                }
            })
        );
        const validTestFiles = recentTestFiles.filter(file => file !== null) as { path: string; content: string; modifiedTime: Date }[];
        validTestFiles.sort((a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime());
        const implementationFiles = await this.fileAnalyser.extractImplementationFiles(validTestFiles, projectDir);
        const fileContents = [
            ...validTestFiles.map(file => {
                const relativePath = path.relative(projectDir, file.path);
                return `File (TEST): ${relativePath}\n\n${file.content}\n\n`;
            }),
            ...implementationFiles.map((file: any) => {
                const relativePath = path.relative(projectDir, file.path);
                return `File (IMPL): ${relativePath}\n\n${file.content}\n\n`;
            })
        ];

        const sourceCode = fileContents.join('---\n\n');

        // Get ReAct prompt
        const prompt = this.promptService.getReactPrompt(testOutput, sourceCode);

        // Generate content using LLM

        const response = await this.llmService.generateContent(prompt);

        if (!response.success) {
            return [];
        }
        return this.xmlService.extractCodeUpdates(response.content).map(update => ({

            filePath: path.join(projectDir, update.filePath),
            content: update.content,
            reason: update.reason,
            missingPackage: update.missigPackage
        }));
    }

    public async applyCodeUpdates(
        projectDir: string,
        codeUpdates: CodeUpdate[]
    ): Promise<void> {
        try {
            await Promise.all(
                codeUpdates.map(async update => {
                    await this.fileService.writeFile(update.filePath, update.content);
                    _logger.info(`Updated file ${update.filePath}: ${update.reason}`);
                })
            );
        } catch (error) {
            _logger.error(`Error applying code updates: ${error}`);
            throw error;
        }
    }
}