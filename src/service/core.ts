import { _CreatReadFile, _FileToAnalyze } from "../types";
import { FileService } from "./fileService";
import { LLMService } from "./llm";
import { _logger } from "../utils/log/winston";


export class CoreService {
    private anlyzeFilePath = "/Users/harshanand/Downloads/development/alumniConnect-Server";
    private llmService: LLMService;
    private fileService: FileService;
    constructor() {
        this.llmService = new LLMService(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);
        this.fileService = new FileService();
    }
    public async StartService() {
        const _allPath = await this.fileService.readFolderRecursively(this.anlyzeFilePath);
        console.log("STARTING 1st STAGE");
        const llm_s1: _FileToAnalyze = await this.llmService.generate1Stage(_allPath.join("\n"));
        console.log("llm_s1", JSON.stringify(llm_s1));

        let finalArrayOfAnalysis: string[] = [];
        try {
            if (llm_s1.fileToAnalyze) {
                llm_s1.fileToAnalyze.forEach(async (file) => {
                    console.log(file);
                    const fileData = await this.fileService.readFile(file.path);
                    finalArrayOfAnalysis.push("File Path: " + file.path + "\n" + "Reason: " + file.reason + "\n" + "Content: " + fileData);
                });
            } else {
                _logger.error("fileToAnalyze is undefined");
            }
        } catch (error) {
            _logger.error("Error in reading file", error);
            _logger.error(JSON.stringify(llm_s1));
        }

        console.log("STARTING 2nd STAGE");

        const llm_s2: _CreatReadFile = await this.llmService.generate2Stage(JSON.stringify(finalArrayOfAnalysis.join("\n")));
        console.log("llm_s2", JSON.stringify(llm_s2));
        if (llm_s2.create) {
            llm_s2.create.forEach(async (file) => {
                console.log(file);
                await this.fileService.writeFile(file.path, file.content);
            });
        } else {
            _logger.error("llm_s2.create is undefined");
            _logger.error(JSON.stringify(llm_s2));
        }
        console.log("All files created");

        await this.fileService.writeFile("stage2.json", JSON.stringify(llm_s2.needToRead));



    }

}