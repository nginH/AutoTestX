import pino from "pino";
import { exec } from "child_process";
import Storage from "../utils/storage/storage.file";

const logger = pino({
    transport: {
        target: "pino-pretty",
        options: { colorize: true }
    }
});

export class DockerService {
    private lang: "python" | "javascript" | "typescript" | "go";
    private useDistroless: boolean;
    private containerId: string | null;
    private store: Storage;
    constructor(
        lang: "python" | "javascript" | "typescript" | "go",
        private cwd?: string,
        useDistroless: boolean = false
    ) {
        this.cwd = cwd;
        this.lang = lang;
        this.useDistroless = useDistroless;
        this.store = new Storage();
        this.containerId = this.store.getContainer(lang);
    }

    private Picker(lang: string) {
        if (this.useDistroless) {
            switch (lang) {
                case "python":
                    return "gcr.io/distroless/python3";
                case "javascript":
                case "typescript":
                    return "gcr.io/distroless/nodejs20-debian11";
                case "go":
                    return "gcr.io/distroless/static-debian11";
                default:
                    return "";
            }
        } else {
            switch (lang) {
                case "python":
                    return "python:3.8-slim";
                case "javascript":
                case "typescript":
                    return "node:20-slim";
                case "go":
                    return "golang:1.16";
                default:
                    return "";
            }
        }
    }

    private executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const options = this.cwd ? { cwd: this.cwd } : {};
            logger.debug(`Executing: ${command}`);
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    logger.error(`Error: ${error.message}`);
                    reject(error.message);
                } else if (stderr) {
                    logger.warn(`STDERR: ${stderr}`);
                    reject(stderr);
                } else {
                    logger.info(`Success: ${stdout.trim()}`);
                    resolve(stdout.trim());
                }
            });
        });
    }

    public async ImageCreater(): Promise<string> {
        logger.info(`Pulling Docker image for ${this.lang} (${this.useDistroless ? 'distroless' : 'standard'})`);
        return this.executeCommand(`docker pull ${this.Picker(this.lang)}`);
    }

    public async ContainerCreater(): Promise<string> {
        logger.info(`Creating Docker container for ${this.lang} (${this.useDistroless ? 'distroless' : 'standard'})`);
        return this.executeCommand(`docker run -d -it ${this.Picker(this.lang)}`);
    }

    public async ContainerStopper(containerId: string): Promise<string> {
        logger.info(`Stopping container: ${containerId}`);
        return this.executeCommand(`docker stop ${containerId}`);
    }

    public async InjectCodeIntoContainer(containerId: string, rootDir: string): Promise<string> {
        logger.info(`Injecting code into container: ${containerId}`);
        return this.executeCommand(`docker cp ${rootDir} ${containerId}:/app`);
    }

    public async getLogs(containerId: string): Promise<string> {
        logger.info(`Fetching logs for container: ${containerId}`);
        return this.executeCommand(`docker logs ${containerId}`);
    }

    public async execute(containerId: string, command: string): Promise<string> {
        logger.info(`Executing command inside container: ${command}`);
        if (this.useDistroless) {
            return this.executeCommand(`docker exec ${containerId} ${command}`); //this is for distroless as we can't run shell commands
        } else {
            return this.executeCommand(`docker exec ${containerId} /bin/sh -c "${command}"`);
        }
    }

    private async startDockerDaemon(): Promise<void> {
        logger.info(`Checking if Docker daemon is running`);
        try {
            await this.executeCommand(`docker info`);
            logger.info(`Docker daemon is already running`);
        } catch (error) {
            logger.error("Docker daemon is not running");
            try {
                logger.info("trying to start docker deamon");
                await this.executeCommand(`open --background -a Docker`);
                logger.info(`Docker daemon started`);
            } catch (error) {
                throw new Error("unable to start docker daemon automatically, please start docker daemon manually \n and try again" + error);
            }
        }
    }
    public async buildCustomImage(rootDir: string, dockerfile: string = ""): Promise<string> {
        if (!this.useDistroless) {
            throw new Error("This method is only for distroless environments");
        }
        if (!dockerfile) {
            dockerfile = this.generateDockerfile(rootDir);
        }
        const imageName = `custom-${this.lang}-app:latest`;
        const dockerfilePath = `${rootDir}/Dockerfile`;
        await this.executeCommand(`echo '${dockerfile}' > ${dockerfilePath}`);
        logger.info(`Building custom distroless image for ${this.lang}`);
        await this.executeCommand(`docker build -t ${imageName} -f ${dockerfilePath} ${rootDir}`);
        return imageName;
    }

    private generateDockerfile(rootDir: string): string {
        switch (this.lang) {
            case "python":
                return `
FROM python:3.8-slim AS builder
WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt

FROM gcr.io/distroless/python3
WORKDIR /app
COPY --from=builder /app /app
COPY --from=builder /usr/local/lib/python3.8/site-packages /usr/local/lib/python3.8/site-packages
ENV PYTHONPATH=/usr/local/lib/python3.8/site-packages
CMD ["main.py"]
`;
            case "javascript":
            case "typescript":
                return `
FROM node:20-slim AS builder
WORKDIR /app
COPY . .
RUN npm install
${this.lang === "typescript" ? "RUN npm run build" : ""}

FROM gcr.io/distroless/nodejs20-debian11
WORKDIR /app
COPY --from=builder /app ${this.lang === "typescript" ? "/dist" : ""} /app
CMD ["index.js"]
`;
            case "go":
                return `
FROM golang:1.16 AS builder
WORKDIR /app
COPY . .
RUN go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o app .

FROM gcr.io/distroless/static-debian11
COPY --from=builder /app/app /
CMD ["/app"]
`;
            default:
                throw new Error(`Unsupported language: ${this.lang}`);
        }
    }

    public async StartProcessing(rootDir: string): Promise<string> {
        try {
            logger.info(`Starting processing for ${this.lang} (${this.useDistroless ? 'distroless' : 'standard'})`);
            await this.startDockerDaemon();
            let containerId: string;
            if (this.containerId) {
                logger.info(`Using existing container: ${this.containerId}`);
                containerId = this.containerId;
            } else {
                if (this.useDistroless) {
                    const imageName = await this.buildCustomImage(rootDir);
                    logger.info(`Custom image built: ${imageName}`);
                    containerId = await this.executeCommand(`docker run -d ${imageName}`);
                    logger.info(`Container created from custom image: ${containerId}`);
                    this.store.addContainer(this.lang, containerId);
                } else {
                    await this.ImageCreater();
                    logger.info(`Image created for ${this.lang}`);
                    containerId = await this.ContainerCreater();
                    logger.info(`Container created: ${containerId}`);
                    this.store.addContainer(this.lang, containerId);// save container id to file
                    await this.InjectCodeIntoContainer(containerId, rootDir);
                    logger.info(`Code injected into container: ${containerId}`);
                }
            }
            return containerId;
        } catch (error) {
            logger.error(`Error in processing: ${error}`);
            throw error;
        }
    }
}