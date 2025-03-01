import { _logger } from "../utils/log/winston";
import { exec } from 'child_process';
import { promisify } from 'util';

export default class Runner {
    private execAsync: any;
    constructor(
        private debug: boolean = false,
        private timeout = 5000,
    ) {
        this.execAsync = promisify(exec);
    }
    public async executeCommand(
        command: string,
        cwd: string,
    ): Promise<{ success: boolean; output: string }> {
        try {
            if (this.debug) {
                _logger.info(`Executing command: ${command} in ${cwd}`);
            }
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Command timed out after ${this.timeout}ms`));
                }, this.timeout);
            });
            const commandPromise = this.execAsync(command, { cwd });
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
                output: errorMessage.includes('timed out') ? `Operation timed out after ${this.timeout}ms` : errorMessage
            };
        }
    }
}