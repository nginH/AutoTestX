import { Content, GenerationConfig, GoogleGenerativeAI } from "@google/generative-ai";
import { PromptService } from "../prompt";
import { JSONParser } from "../parser/json";
import { _CreatReadFile, _FileToAnalyze } from "../types";

export class LLMService {
    private genAI: GoogleGenerativeAI;
    private ModelName: string = "gemini-2.0-flash";
    private temperature: number = 1;
    private topP: number = 0.95;
    private topK: number = 40;
    private model: any;
    private promptService: PromptService;
    private generativeConfig: GenerationConfig

    constructor(private GOOGLE_GENERATIVE_AI_API_KEY: string) {
        if (!this.GOOGLE_GENERATIVE_AI_API_KEY) {
            throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
        }
        this.genAI = new GoogleGenerativeAI(
            this.GOOGLE_GENERATIVE_AI_API_KEY
        );
        this.model = this.genAI.getGenerativeModel({ model: this.ModelName });
        this.promptService = new PromptService();
        this.generativeConfig = {
            temperature: this.temperature,
            topP: this.topP,
            topK: this.topK,
        };
    }

    public async generate1Stage(prompt: string): Promise<_FileToAnalyze> {
        try {
            const content: Content[] = [
                {
                    role: "user",
                    parts: [{ text: this.promptService.stage1st() }],
                },
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ];
            const result = await this.model.generateContent({
                contents: content,
                generationConfig: this.generativeConfig,
            });
            const data = result.response.candidates[0].content.parts[0].text;
            const cleanedData = await JSONParser.tryParseJSON<_FileToAnalyze>(data, "path picker error");
            return cleanedData;
        } catch (error) {
            console.error("Error generating content:", error);
            throw error;
        }
    }

    public async generate2Stage(prompt: string): Promise<_CreatReadFile> {
        try {
            const content: Content[] = [
                {
                    role: "user",
                    parts: [{ text: this.promptService.stage2nd() }],
                },
                {
                    role: "user",
                    parts: [{ text: prompt }],
                },
            ];
            const result = await this.model.generateContent({
                contents: content,
                generationConfig: this.generativeConfig,
            });
            const data = result.response.candidates[0].content.parts[0].text;
            const cleanedData: _CreatReadFile = await JSONParser.tryParseJSON<_CreatReadFile>(data, "Stage 2 error");
            return cleanedData;
        } catch (error) {
            console.error("Error generating content:", error);
            throw error;
        }
    }
}