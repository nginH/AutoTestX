import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseLLMService } from '../llm/base';
import { XMLService } from '../llm/parser/xml';
import { PromptService } from '../prompt';
import { _logger } from '../utils/log/winston';
import { FileService } from '../llm/file';
import { CodeUpdate, ReActAgentOptions, ReActResult } from '../types';
const execAsync = promisify(exec);
export class ReActAgent {
    private llmService: BaseLLMService;
    private fileService: FileService;
    private xmlService: XMLService;
    private promptService: PromptService;
    private maxIterations: number;
    private debug: boolean;

    constructor(
        llmService: BaseLLMService,
        xmlService: XMLService,
        promptService: PromptService,
        options: ReActAgentOptions = {}
    ) {
        this.llmService = llmService;
        this.fileService = new FileService();
        this.xmlService = xmlService;
        this.promptService = promptService;
        this.maxIterations = options.maxIterations || 5;
        this.debug = options.debug || false;
    }
    private async executeCommand(
        command: string,
        cwd: string,
        timeout: number = 5000 // Default timeout of 30 seconds
    ): Promise<{ success: boolean; output: string }> {
        try {
            if (this.debug) {
                _logger.info(`Executing command: ${command} in ${cwd}`);
            }
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Command timed out after ${timeout}ms`));
                }, timeout);
            });
            const commandPromise = execAsync(command, { cwd });
            const { stdout, stderr } = await Promise.race([
                commandPromise,
                timeoutPromise
            ]) as { stdout: string; stderr: string };

            const output = stdout + (stderr ? `\nERROR: ${stderr}` : '');
            _logger.info(`Command output: ${output}`);
            return {
                success: !stderr,
                output
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            _logger.error(`Command execution failed: ${errorMessage}`);
            return {
                success: false,
                output: errorMessage.includes('timed out') ? `Operation timed out after ${timeout}ms` : errorMessage
            };
        }
    }
    async generateTests(projectDir: string): Promise<ReActResult> {
        _logger.info(`Starting test generation for project at: ${projectDir}`);
        const result: ReActResult = {
            success: false,
            actions: [],
            errors: []
        };

        try {
            const criticalFiles = await this.identifyCriticalFiles(projectDir);
            result.actions.push(`Identified ${criticalFiles.length} critical files`);

            const testFiles = await this.generateTestFiles(projectDir, criticalFiles);
            result.actions.push(`Generated ${testFiles.length} test files`);

            await this.writeTestFiles(projectDir, testFiles);
            result.actions.push('Wrote test files to disk');

            //ReAct execution
            const testExecution = await this.executeTestsWithReAct(projectDir);
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
    private async identifyCriticalFiles(projectDir: string): Promise<string[]> {
        try {
            const allFiles = await this.fileService.readDirectoryRecursively(projectDir);

            const directoryStructure = allFiles
                .map(file => path.relative(projectDir, file))
                .join('\n');
            const prompt = this.promptService.getCriticalFilesPrompt(directoryStructure);
            const response = await this.llmService.generateContent(prompt);

            if (!response.success) {
                throw new Error(`Failed to identify critical files: ${response.error}`);
            }
            const criticalFiles = this.xmlService.extractCriticalFiles(response.content);
            return criticalFiles.map(file => path.join(projectDir, file));
        } catch (error) {
            _logger.error(`Error identifying critical files: ${error}`);
            throw error;
        }
    }

    private async generateTestFiles(
        projectDir: string,
        criticalFiles: string[]
    ): Promise<{ path: string; content: string }[]> {
        try {
            const fileContents = await Promise.all(
                criticalFiles.map(async filePath => {
                    const content = await this.fileService.readFile(filePath);
                    const relativePath = path.relative(projectDir, filePath);
                    return `File: ${relativePath}\n\n${content}\n\n`;
                })
            );
            const sourceCode = fileContents.join('---\n\n');
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
    private async writeTestFiles(
        projectDir: string,
        testFiles: { path: string; content: string }[]
    ): Promise<void> {
        try {
            await Promise.all(
                testFiles.map(async file => {
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
    private async executeTestsWithReAct(projectDir: string): Promise<ReActResult> {
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
            const testResult = await this.executeCommand(testCommand, projectDir);

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
                await this.installMissingPackages(projectDir, missingPackages);
                result.actions.push(`Installed missing packages: ${missingPackages.join(', ')}`);
            }

            if (codeUpdates.length === 0) {
                result.errors.push('Failed to identify code fixes from test output');
                break;
            }

            // Step 3: Apply code updates
            await this.applyCodeUpdates(projectDir, codeUpdates);
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

            try {
                const packageJson = JSON.parse(await this.fileService.readFile(packageJsonPath));
                if (packageJson.scripts && packageJson.scripts.test) {
                    return 'npm test';
                }
            } catch (error) {
            }
            const files = await this.fileService.readDirectoryRecursively(projectDir);

            if (files.some(file => file.includes('jest.config'))) {
                return 'npx jest';
            }

            if (files.some(file => file.includes('mocha'))) {
                return 'npx mocha';
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
            const errorFiles = this.extractErrorFiles(testOutput, projectDir);
            if (errorFiles.length === 0) {
                return this.getGeneralCodeUpdates(projectDir, testOutput);
            }
            const fileContents = await Promise.all(
                errorFiles.map(async filePath => {
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
            return this.xmlService.extractCodeUpdates(response.content).map(update => ({
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

    private extractErrorFiles(testOutput: string, projectDir: string): string[] {
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
    private async getGeneralCodeUpdates(
        projectDir: string,
        testOutput: string
    ): Promise<CodeUpdate[]> {
        const files = await this.fileService.readDirectoryRecursively(projectDir);
        const testFiles = files.filter(file =>
            file.includes('.test.') ||
            file.includes('.spec.') ||
            file.includes('__tests__')
        );
        const recentTestFiles = await Promise.all(
            testFiles.slice(0, 3).map(async file => {
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
        const implementationFiles = await this.extractImplementationFiles(validTestFiles, projectDir);
        const fileContents = [
            ...validTestFiles.map(file => {
                const relativePath = path.relative(projectDir, file.path);
                return `File (TEST): ${relativePath}\n\n${file.content}\n\n`;
            }),
            ...implementationFiles.map(file => {
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

    private async installMissingPackages(
        projectDir: string,
        missingPackages: string[]
    ): Promise<void> {
        try {
            const packageManager = await this.determinePackageManager(projectDir);
            const installCommand = `${packageManager} install ${missingPackages.join(' ')}`;
            const installResult = await this.executeCommand(installCommand, projectDir);

            if (!installResult.success) {
                throw new Error(`Failed to install missing packages: ${installResult.output}`);
            }
        } catch (error) {
            _logger.error(`Error installing missing packages: ${error}`);
            throw error;
        }
    }

    private async determinePackageManager(projectDir: string): Promise<string> {
        try {
            const packageJsonPath = path.join(projectDir, 'package.json');
            const packageJson = JSON.parse(await this.fileService.readFile(packageJsonPath));

            if (packageJson.dependencies) {
                return 'npm';
            }

            if (packageJson.devDependencies) {
                return 'npm';
            }

            if (packageJson.dependencies) {
                return 'yarn';
            }

            if (packageJson.devDependencies) {
                return 'yarn';
            }

            return 'npm';
        }
        catch (error) {
            _logger.warn(`Error determining package manager: ${error}, defaulting to npm`);
            return 'npm';
        }
    }


    private async extractImplementationFiles(
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
    private async applyCodeUpdates(
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