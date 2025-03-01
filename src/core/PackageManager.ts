import Runner from "../excuter/runner";
import { FileService } from "../llm/file";
import { _logger } from "../utils/log/winston";
import * as path from 'path';


export class PackageManager {
    private runner: Runner;
    constructor(
        private fileService: FileService,
        timeout = 5000,
        debug = false,
    ) {
        this.runner = new Runner(
            debug,
            timeout
        );
    }
    public async installMissingPackages(
        projectDir: string,
        missingPackages: string[]
    ): Promise<void> {
        try {
            const packageManager = await this.determinePackageManager(projectDir);
            const installCommand = `${packageManager} install ${missingPackages.join(' ')}`;
            const installResult = await this.runner.executeCommand(installCommand, projectDir);

            if (!installResult.success) {
                throw new Error(`Failed to install missing packages: ${installResult.output}`);
            }
        } catch (error) {
            _logger.error(`Error installing missing packages: ${error}`);
            throw error;
        }
    }
    public async determinePackageManager(projectDir: string): Promise<string> {
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

}