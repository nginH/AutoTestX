export class Executer {
    public async execute(command: string, cwd?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            const options = cwd ? { cwd } : {};
            exec(command, options, (error: any, stdout: any, stderr: any) => {
                if (error) {
                    reject(error);
                }
                if (stderr) {
                    reject(stderr);
                }
                resolve(stdout);
            });
        });
    }
}