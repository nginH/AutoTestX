import * as fs from 'fs';
import * as path from 'path';
import { _logger } from '../../utils/log/winston';

export class PromptService {
  private promptTemplates: Map<string, string> = new Map();
  private promptDir: string;

  constructor(promptDir?: string) {
    this.promptDir = promptDir || path.join(__dirname, '../prompts');
    this.loadPromptTemplates();
  }
  private loadPromptTemplates(): void {
    try {
      if (!fs.existsSync(this.promptDir)) {
        fs.mkdirSync(this.promptDir, { recursive: true });
        this.createDefaultPrompts();
      }

      const files = fs.readdirSync(this.promptDir);

      for (const file of files) {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
          const name = path.basename(file, path.extname(file));
          const content = fs.readFileSync(path.join(this.promptDir, file), 'utf8');
          this.promptTemplates.set(name, content);
          _logger.info(`Loaded prompt template: ${name}`);
        }
      }
    } catch (error) {
      _logger.error(`Error loading prompt templates: ${error}`);
    }
  }
  private createDefaultPrompts(): void {
    const defaultPrompts = {
      'critical-files-identification': this.getDefaultCriticalFilesPrompt(),
      'test-generation': this.getDefaultTestGenerationPrompt(),
      'react-troubleshooting': this.getDefaultReactPrompt(),
      'code-analysis': this.getDefaultCodeAnalysisPrompt()
    };

    for (const [name, content] of Object.entries(defaultPrompts)) {
      fs.writeFileSync(path.join(this.promptDir, `${name}.txt`), content);
    }
  }

  getPrompt(name: string): string {
    const prompt = this.promptTemplates.get(name);
    if (!prompt) {
      _logger.warn(`Prompt template '${name}' not found, returning default`);
      return this.getDefaultPrompt(name);
    }
    return prompt;
  }
  private getDefaultPrompt(name: string): string {
    switch (name) {
      case 'critical-files-identification':
        return this.getDefaultCriticalFilesPrompt();
      case 'test-generation':
        return this.getDefaultTestGenerationPrompt();
      case 'react-troubleshooting':
        return this.getDefaultReactPrompt();
      case 'code-analysis':
        return this.getDefaultCodeAnalysisPrompt();
      default:
        return `Default prompt for ${name}`;
    }
  }
  formatPrompt(name: string, variables: Record<string, string>): string {
    let prompt = this.getPrompt(name);

    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    return prompt;
  }

  private getDefaultCriticalFilesPrompt(): string {
    return `
You are a code analysis assistant from AutoTestX specialized in identifying critical files in a codebase. 
Your task is to examine the directory structure and files provided, and identify the most important files that should be analyzed further for test generation.

When analyzing the codebase, consider:
1. Core functionality files
2. Files with complex logic
3. Files that define important types or interfaces
4. Files that handle critical business logic
5. Files that would benefit most from test coverage

Your response should be structured as follows:
<CriticalFiles>
  <Path><![CDATA[path/to/file1.js]]></Path>
  <Path><![CDATA[path/to/file2.ts]]></Path>
  <Path><![CDATA[path/to/file3.py]]></Path>
</CriticalFiles>

Directory structure:
{directory_structure}
    `;
  }

  private getDefaultTestGenerationPrompt(): string {
    return `
You are a test generation assistant from AutoTestX. Your task is to analyze source code files and generate appropriate test cases.
The tests should cover all significant functionality, edge cases, and potential failure modes.

For each file, consider:
1. What are the main functions/methods/classes in this file?
2. What behaviors should be tested?
3. What edge cases or failure scenarios should be covered?
4. What testing framework is appropriate for this language/environment?

Your response should be in the following XML format:

<TestGenerationReport>
  <Create>
    <TestFile>
      <Path relativeTo="project_root">{path/to/test/file.test.js}</Path>
      <Content><![CDATA[
// Test code here
      ]]></Content>
    </TestFile>
  </Create>
  <DependencyGraph>
    <Path relativeTo="project_root">{path/to/related/file.js}</Path>
    <Reason>This file contains functionality that will be called by our test</Reason>
  </DependencyGraph>
</TestGenerationReport>

Here are the source code files to analyze:
{source_code}
    `;
  }
  private getDefaultReactPrompt(): string {
    return `
You are an AI assistant by AutoTestX tasked with fixing code that doesn't work correctly.
Analyze the error output and determine what went wrong with the code execution.

When analyzing the issue:
1. Read the error message carefully
2. Look at the line numbers mentioned in the error
3. Examine the surrounding code context
4. Determine the root cause of the problem
5. Propose a complete fix
6. Identify any missing dependencies
7. If test command is missing then add the test command and dont modify the already existing code just append the test command

Your response should include:
<CodeUpdates>
  <Update>
    <FilePath>path/to/file.js</FilePath>
    <Reason>Brief explanation of what was wrong</Reason>
    <Content><![CDATA[
// Complete corrected file content
    ]]></Content>
    <MissingDependencies>
      <Dependency>LibraryName</Dependency>
    </MissingDependencies>
  </Update>
</CodeUpdates>

Terminal Output:
{terminal_output}

Current Code:
{code}
    `;
  }
  private getDefaultCodeAnalysisPrompt(): string {
    return `
You are a code analysis expert. Your task is to analyze the provided code and identify:
1. Overall architecture and design patterns
2. Potential bugs or issues
3. Performance concerns
4. Security vulnerabilities
5. Code quality and maintainability issues

Your analysis should be thorough but concise, focusing on the most important aspects.
For each issue identified, provide a specific location (file and line number if possible) and a recommendation for improvement.

Source Code:
{source_code}
    `;
  }

  getCriticalFilesPrompt(directoryStructure: string): string {
    return this.formatPrompt('critical-files-identification', {
      directory_structure: directoryStructure
    });
  }

  getTestGenerationPrompt(sourceCode: string): string {
    return this.formatPrompt('test-generation', {
      source_code: sourceCode
    });
  }

  getReactPrompt(terminalOutput: string, code: string): string {
    return this.formatPrompt('react-troubleshooting', {
      terminal_output: terminalOutput,
      code: code
    });
  }

  getCodeAnalysisPrompt(sourceCode: string): string {
    return this.formatPrompt('code-analysis', {
      source_code: sourceCode
    });
  }
}