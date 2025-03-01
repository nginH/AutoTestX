import { cwd, exit } from "process";
import { LLMFactory } from "./llm/factory";
import { ReActAgent } from "./core/llm";
import Runner from "./excuter/runner";

const TIMEOUT = 120000; // 2 minutes timeout

async function executeWithTimeout(promise: Promise<any>, timeoutMs: number, errorMessage: string) {
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms: ${errorMessage}`));
        }, timeoutMs);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutHandle!);
        return result;
    } catch (error) {
        clearTimeout(timeoutHandle!);
        throw error;
    }
}

LLMFactory.getInstance(
    'google',
    {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string,
        model: 'gemini-2.0-flash',
        temperature: 0.5,
        debug: true
    },
).then(async (service) => {
    console.log('LLM service initialized successfully!', service);
    const reactAgent = new ReActAgent(
        service,
        { maxIterations: 8, debug: true, TerminalTimeOut: TIMEOUT }
    );

    try {
        const result = await executeWithTimeout(
            reactAgent.generateTests('/Users/harshanand/Downloads/development/BackServer2'),
            TIMEOUT,
            'Test generation process'
        );
        console.log('Tests generated successfully!', result);
    } catch (error) {
        console.error('Failed to generate tests. Errors:', error);
    } finally {
        console.log('Process completed');
        const executer = new Runner();
        try {
            await executeWithTimeout(
                executer.executeCommand('rm -rf /Users/harshanand/Downloads/development/AutoTestX/lib', cwd()),
                30000, // 30 seconds timeout for cleanup
                'Cleanup operation'
            );
            console.log('Cleanup completed successfully');
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
        exit(0);
    }
}).catch((error) => {
    console.error('Failed to initialize LLM service. Errors:', error);
    exit(1);
});