import Runner from "../excuter/runner";
import { BaseLLMService } from "../llm/base";
import { FileService } from "../llm/file";
import { XMLService } from "../llm/parser/xml";
import { PromptService } from "../llm/prompt";
import { CodeUpdate, ReActResult } from "../types";
import { _logger } from "../utils/log/winston";
import { CodeUpdater } from "./CodeUpdater";
import { FileAnalyser } from "./fileAnalyser";
import { PackageManager } from "./PackageManager";
import * as path from 'path';


export class TestExecuter {
    private packageManage: PackageManager;
    private codeUpdater: CodeUpdater;
    private fileAnalyzer: FileAnalyser;
    constructor(
        private runner: Runner,
        private fileService: FileService,
        private xmlService: XMLService,
        private llmService: BaseLLMService,
        private promptService: PromptService,
        private extractImplementationFiles: any,
        private maxIterations: number
    ) {
        this.packageManage = new PackageManager(
            this.fileService
        );
        this.codeUpdater = new CodeUpdater(
            this.fileService,
            this.xmlService,
            this.llmService,
            this.promptService,
            this.extractImplementationFiles
        );
        this.fileAnalyzer = new FileAnalyser(
            this.fileService,
            this.llmService,
            this.xmlService,
            this.promptService
        );
    }
    public async executeTestsWithReAct(projectDir: string): Promise<ReActResult> {
        const result: ReActResult = {
            success: true,
            actions: [],
            errors: []
        };

        let iteration = 0;
        let testsPassing = false;

        while (!testsPassing && iteration < this.maxIterations) {
            iteration++;
            _logger.info(`ReAct iteration ${iteration}/${this.maxIterations}`);
            result.actions.push(`Starting ReAct iteration ${iteration}`);

            // Step 1: Run tests
            const testCommand = await this.determineTestCommand(projectDir);
            if (testCommand == '') {
                result.errors.push('Failed to determine test command');
                break;
            }
            const testResult = await this.runner.executeCommand(testCommand, projectDir);

            // Check if tests are passing
            if (testResult.success) {
                testsPassing = true;
                result.actions.push('All tests are passing');
                break;
            }

            result.actions.push(`Tests failed, analyzing issues from test output`);

            // Step 2: Analyze test failures and get code updates
            const codeUpdates = await this.analyzeTestFailures(projectDir, testResult.output);
            result.actions.push(`Identified ${codeUpdates.length} code updates`);

            // Step 2.1: Install missing packages
            if (codeUpdates.some(update => update.missingPackage)) {
                const missingPackages = codeUpdates
                    .filter(update => update.missingPackage)
                    .map(update => update.missingPackage as string);
                await this.packageManage.installMissingPackages(projectDir, missingPackages);
                result.actions.push(`Installed missing packages: ${missingPackages.join(', ')}`);
            }

            if (codeUpdates.length === 0) {
                result.errors.push('Failed to identify code fixes from test output');
                break;
            }

            // Step 3: Apply code updates
            await this.codeUpdater.applyCodeUpdates(projectDir, codeUpdates);
            result.actions.push(`Applied ${codeUpdates.length} code updates`);
        }

        if (!testsPassing) {
            result.success = false;
            result.errors.push(`Failed to get tests passing after ${this.maxIterations} iterations`);
        }

        return result;
    }

    private async determineTestCommand(projectDir: string): Promise<string> {
        try {
            const packageJsonPath = path.join(projectDir, 'package.json');
            const pythonFiles = ['requirements.txt', 'setup.py', 'Pipfile'];

            try {
                const packageJson = JSON.parse(await this.fileService.readFile(packageJsonPath));
                if (packageJson.scripts && packageJson.scripts.test) {
                    return 'npm test';
                }
            } catch (error) {
            }

            const files = await this.fileService.readDirectoryRecursively(projectDir);

            if (files.some((file: string | string[]) => file.includes('jest.config'))) {
                return 'npx jest';
            }
            if (files.some((file: string | string[]) => file.includes('mocha'))) {
                return 'npx mocha';
            }
            if (files.some((file: string | string[]) => pythonFiles.includes(path.basename(file as string)))) {
                return 'pytest';
            }
            return 'npm test';
        } catch (error) {
            _logger.warn(`Error determining test command: ${error}, defaulting to 'npm test'`);
            return 'npm test';
        }
    }


    private async analyzeTestFailures(
        projectDir: string,
        testOutput: string
    ): Promise<CodeUpdate[]> {
        try {
            const errorFiles = this.fileAnalyzer.extractErrorFiles(testOutput, projectDir);
            if (errorFiles.length === 0) {
                return this.codeUpdater.getGeneralCodeUpdates(projectDir, testOutput);
            }
            const fileContents = await Promise.all(
                errorFiles.map(async (filePath: string) => {
                    try {
                        const content = await this.fileService.readFile(filePath);
                        const relativePath = path.relative(projectDir, filePath);
                        return `File: ${relativePath}\n\n${content}\n\n`;
                    } catch (error) {
                        _logger.warn(`Could not read file ${filePath}: ${error}`);
                        return '';
                    }
                })
            );
            const sourceCode = fileContents.filter(Boolean).join('---\n\n');
            const prompt = this.promptService.getReactPrompt(testOutput, sourceCode);
            const response = await this.llmService.generateContent(prompt);

            if (!response.success) {
                throw new Error(`Failed to analyze test failures: ${response.error}`);
            }
            return this.xmlService.extractCodeUpdates(response.content).map((update: { filePath: string; content: any; reason: any; missigPackage: any; }) => ({
                filePath: path.join(projectDir, update.filePath),
                content: update.content,
                reason: update.reason,
                missingPackage: update.missigPackage,
            }));
        } catch (error) {
            _logger.error(`Error analyzing test failures: ${error}`);
            throw error;
        }
    }



}