import { _logger } from "../utils/log/winston";
export default class Runner {
    async executeCommand(command: string, cwd: string): Promise<{ success: boolean; output: string }> {
        if (command.endsWith("\n")) {
            command = command.slice(0, -1);
        }
        try {
            const { exec } = require('child_process');

            return new Promise((resolve, reject) => {
                const child = exec(command, { cwd }, (error: any, stdout: string, stderr: string) => {
                    if (error) {
                        resolve({
                            success: false,
                            output: `Error: ${error.message}\nStderr: ${stderr}`
                        });
                        return;
                    }
                    resolve({
                        success: true,
                        output: stdout
                    });
                });
                child.on('error', (error: Error) => {
                    resolve({
                        success: false,
                        output: `Process error: ${error.message}`
                    });
                });
            });
        } catch (error) {
            return {
                success: false,
                output: `Execution failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}