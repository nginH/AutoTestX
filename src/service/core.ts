import { _CreatReadFile, _FileToAnalyze } from "../types";
import { FileService } from "./fileService";
import { LLMService } from "./llm";
import { _logger } from "../utils/log/winston";
import { Executer } from "./codeExecuter";

export class CoreService {
    private anlyzeFilePath = "/Users/harshanand/Downloads/development/alumniConnect-Server copy";
    private llmService: LLMService;
    private fileService: FileService;
    private executer: Executer;
    constructor() {
        this.llmService = new LLMService(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
        this.fileService = new FileService();
        this.executer = new Executer();
    }
    public async StartService() {
        const _allPath = await this.fileService.readFolderRecursively(this.anlyzeFilePath);
        console.log("STARTING 1st STAGE");
        const llm_s1: string[] = await this.llmService.generate1Stage(_allPath.join("\n"));

        if (!llm_s1) {
            return;
        }
        let finalArrayOfAnalysis: string[] = [];
        try {
            for (const file of llm_s1) {
                console.info(`Reading file: ${file}`);
                const fileContent = await this.fileService.readFile(file);
                finalArrayOfAnalysis.push(fileContent);
            }
        } catch (error) {
            _logger.error("Error in reading file", error);
            _logger.error(JSON.stringify(llm_s1));
        }

        console.log("STARTING 2nd STAGE");

        const llm_s2: _CreatReadFile = await this.llmService.generate2Stage(JSON.stringify(finalArrayOfAnalysis.join("\n")));
        if (!llm_s2) {
            _logger.error("Error in stage 2");
            return;
        }
        if (llm_s2.create.length > 0) {
            for (const file of llm_s2.create) {
                if (!file.path || !file.content) {
                    continue;
                }
                console.info(`Creating file: ${file.path}`);
                await this.fileService.writeFile(file.path as string, file.content as string, this.anlyzeFilePath);
            }
        }
        console.log("All files created");
        if (llm_s2.needToRead.length > 0) {
            for (const file of llm_s2.needToRead) {
                if (!file.path) {
                    continue;
                }
                console.info(`Reading file: ${file.path}`);
                console.info("WHY", file.reason);
                const fileContent = await this.fileService.readFile(file.path as string);
                finalArrayOfAnalysis.push(fileContent);
            }
        }
        console.log("STARTING 3rd STAGE");

        const command = await this.llmService.generate3Stage(JSON.stringify(finalArrayOfAnalysis.join("\n")));
        if (!command) {
            _logger.error("Error in stage 3");
            return;
        }
        console.log("All files validated");
        const extractedCommand = command[0].trim();
        console.info(extractedCommand);
        const resp = await this.executer.execute(extractedCommand + "/src", this.anlyzeFilePath);
        console.log("TERMINAL RESPONSE", resp);

        // const llm_s3: any = await this.llmService.stage3Validation(JSON.stringify(llm_s2));
        // if (!llm_s3) {
        //     _logger.error("Error in stage 3");
        //     return;
        // }
        // console.log("All files validated");
        // console.log(JSON.stringify(llm_s3));
    }
}
