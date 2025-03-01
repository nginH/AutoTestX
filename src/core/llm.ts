import * as path from "path";

import { BaseLLMService } from "../llm/base";
import { XMLService } from "../llm/parser/xml";
import { PromptService } from "../llm/prompt";
import { _logger } from "../utils/log/winston";
import { FileService } from "../llm/file";
import { ReActResult } from "../types";
import { FileAnalyser } from "./fileAnalyser";
import { TestExecuter } from "./TestExecuter";
import Runner from "../excuter/runner";


/*
DEFAULT LOGGER : FALSE
DEFAULT TIMEOUT : 5000
DEFAULT MAX ITERATIONS : 3 for ReActAgent
*/
export class ReActAgent {
    private llmService: BaseLLMService;
    private fileService: FileService;
    private xmlService: XMLService;
    private promptService: PromptService;
    private fileAnalyser: FileAnalyser;
    private testExecution: TestExecuter;
    private runner: Runner;

    constructor(
        llmService: BaseLLMService,
        private config: {
            maxIterations?: number;
            debug?: boolean;
            TerminalTimeOut?: number;
        }
    ) {
        this.llmService = llmService;
        this.fileService = new FileService();
        this.xmlService = new XMLService();
        this.promptService = new PromptService();
        this.fileAnalyser = new FileAnalyser(
            this.fileService,
            this.llmService,
            this.xmlService,
            this.promptService
        );
        this.runner = new Runner(
        );
        this.testExecution = new TestExecuter(
            this.runner,
            this.fileService,
            this.xmlService,
            this.llmService,
            this.promptService,
            this.fileAnalyser,
            this.config.maxIterations ?? 3
        );
    }

    async generateTests(projectDir: string): Promise<ReActResult> {
        _logger.info(`Starting test generation for project at: ${projectDir}`);
        const result: ReActResult = {
            success: false,
            actions: [],
            errors: [],
        };
        try {
            const criticalFiles = await this.fileAnalyser.identifyCriticalFiles(projectDir);
            result.actions.push(`Identified ${criticalFiles.length} critical files`);
            _logger.info("listed critical files: ")
            for (let i = 0; i < criticalFiles.length; i++) {
                _logger.info(criticalFiles[i])
            }
            const testFiles = await this.generateTestFiles(projectDir, criticalFiles);
            result.actions.push(`Generated ${testFiles.length} test files`);

            await this.writeTestFiles(projectDir, testFiles);
            result.actions.push("Wrote test files to disk");
            const testExecution = await this.testExecution.executeTestsWithReAct(projectDir);
            result.actions.push(...testExecution.actions);

            if (testExecution.errors.length > 0) {
                result.errors.push(...testExecution.errors);
            }

            result.success = testExecution.errors.length === 0;
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            _logger.error(`Test generation failed: ${errorMessage}`);
            result.errors.push(errorMessage);
            return result;
        }
    }
    private async generateTestFiles(projectDir: string, criticalFiles: string[]): Promise<{ path: string; content: string }[]> {
        try {
            const fileContents = await Promise.all(
                criticalFiles.map(async (filePath) => {
                    const content = await this.fileService.readFile(filePath);
                    const relativePath = path.relative(projectDir, filePath);
                    return `File: ${relativePath}\n\n${content}\n\n`;
                })
            );
            const sourceCode = fileContents.join("---\n\n");
            const prompt = this.promptService.getTestGenerationPrompt(sourceCode);
            const response = await this.llmService.generateContent(prompt);
            if (!response.success) {
                throw new Error(`Failed to generate test files: ${response.error}`);
            }
            return this.xmlService.extractTestFiles(response.content);
        } catch (error) {
            _logger.error(`Error generating test files: ${error}`);
            throw error;
        }
    }
    private async writeTestFiles(projectDir: string, testFiles: { path: string; content: string }[]): Promise<void> {
        try {
            await Promise.all(
                testFiles.map(async (file) => {
                    const fullPath = path.join(projectDir, file.path);
                    await this.fileService.writeFile(fullPath, file.content);
                    _logger.info(`Test file written to ${fullPath}`);
                })
            );
        } catch (error) {
            _logger.error(`Error writing test files: ${error}`);
            throw error;
        }
    }
}
