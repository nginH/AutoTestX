import { Content, GenerationConfig, GoogleGenerativeAI } from "@google/generative-ai";
import { PromptService } from "../prompt";
import { _CreatReadFile, _FileToAnalyze } from "../types";
import { DOMParser } from 'xmldom';
import { _logger } from "../utils/log/winston";

export class LLMService {
    private genAI: GoogleGenerativeAI;
    private ModelName: string = "gemini-2.0-flash";
    private temperature: number = 1;
    private topP: number = 0.95;
    private topK: number = 40;
    private model: any;
    private promptService: PromptService;
    private generativeConfig: GenerationConfig;
    private parser: DOMParser;

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
        this.parser = new DOMParser();
    }

    private async extractXMLContent(text: string): Promise<string> {
        const xmlStart = text.indexOf('<TestGenerationReport>');
        const xmlEnd = text.lastIndexOf('</TestGenerationReport>') + '</TestGenerationReport>'.length;
        if (xmlStart === -1 || xmlEnd === -1) {
            throw new Error('No valid XML content found in response');
        }
        return text.slice(xmlStart, xmlEnd);
    }

    private async extractStage1Content(text: string): Promise<string> {
        const xmlStart = text.indexOf('<CriticalFiles>');
        const xmlEnd = text.lastIndexOf('</CriticalFiles>') + '</CriticalFiles>'.length;
        if (xmlStart === -1 || xmlEnd === -1) {
            throw new Error('No valid XML content found in response');
        }
        return text.slice(xmlStart, xmlEnd);
    }

    public async generate1Stage(prompt: string): Promise<string[]> {
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
            const rawXml = result.response.candidates[0].content.parts[0].text;

            const xmlContent = await this.extractStage1Content(rawXml);
            const data = xmlContent.startsWith('<Path>') ? xmlContent : xmlContent.replace('<Path>', '<Path><![CDATA[').replace('</Path>', ']]></Path>');
            const xmlDoc = this.parser.parseFromString(data, "application/xml");
            return Array.from(xmlDoc.getElementsByTagName("Path")).flatMap(pathNode => pathNode.textContent?.split(',').map(path => path.trim()) || []);

        } catch (error) {
            _logger.error("Error generating content:", error);
            throw error;
        }
    }

    public async generate2Stage(prompt: string): Promise<any> {
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
            const xmlData = await this.extractXMLContent(data);
            const xmlDoc = this.parser.parseFromString(xmlData, "application/xml");
            const createNodes = xmlDoc.getElementsByTagName("Create");
            const needToReadNodes = xmlDoc.getElementsByTagName("DependencyGraph");
            const create: _CreatReadFile = {
                create: [],
                needToRead: []
            };
            for (let i = 0; i < createNodes.length; i++) {
                const testFiles = createNodes[i].getElementsByTagName("TestFile");
                for (let j = 0; j < testFiles.length; j++) {
                    const testFile = testFiles[j];
                    const pathElement = testFile.getElementsByTagName("Path")[0];
                    const contentElement = testFile.getElementsByTagName("Content")[0];
                    const path = pathElement ? (pathElement.getAttribute('relativeTo') === 'project_root'
                        ? require('path').join('/Users/harshanand/Downloads/development/alumniConnect-Server copy/functions', pathElement.textContent || '')
                        : pathElement.textContent || '')
                        : '';

                    const content = contentElement ? contentElement.textContent : '';
                    create.create.push({ path, content });
                }
            }
            for (let i = 0; i < needToReadNodes.length; i++) {
                const needToReadNode = needToReadNodes[i];
                const pathElement = needToReadNode.getElementsByTagName("Path")[0];
                const reasonElement = needToReadNode.getElementsByTagName("Reason")[0];
                const path = pathElement ? (pathElement.getAttribute('relativeTo') === 'project_root'
                    ? require('path').join('/Users/harshanand/Downloads/development/alumniConnect-Server copy/functions', pathElement.textContent || '')
                    : pathElement.textContent || '')
                    : '';

                const reason = reasonElement ? reasonElement.textContent : '';
                create.needToRead.push({ path, reason });
            }
            return create;
        } catch (error) {
            _logger.error("Error generating content:", error);
            throw error;
        }
    }



    public stage4rdEXtraction = (_text: string) => {
        const xmlStart = _text.indexOf('<ResolutionSteps>');
        const xmlEnd = _text.lastIndexOf('</ResolutionSteps>') + '</ResolutionSteps>'.length;
        if (xmlStart === -1 || xmlEnd === -1) {
            throw new Error('No valid XML content found in response');
        }
        return _text.slice(xmlStart, xmlEnd);
    }

    public stage3rdEXtraction = (_text: string) => {
        const xmlStart = _text.indexOf('<Command>');
        const xmlEnd = _text.lastIndexOf('</Command>') + '</Command>'.length;
        if (xmlStart === -1 || xmlEnd === -1) {
            throw new Error('No valid XML content found in response');
        }
        return _text.slice(xmlStart, xmlEnd);
    }

    public async generate3Stage(prompt: string): Promise<any> {
        try {
            const content: Content[] = [
                {
                    role: "user",
                    parts: [{ text: this.promptService.stage4th() }],
                },
                {
                    role: "model",
                    parts: [{ text: prompt }],
                },
            ];
            const result = await this.model.generateContent({
                contents: content,
                generationConfig: this.generativeConfig,
            });
            if (!result.response.candidates || !result.response.candidates[0].content.parts[0]) {
                throw new Error('Invalid response format');
            }
            const res = result.response.candidates[0].content.parts[0].text;
            const xmlData = this.stage3rdEXtraction(res);
            const xmlDoc = this.parser.parseFromString(xmlData, "application/xml");
            const Command = xmlDoc.getElementsByTagName("Command");
            const commands = [];
            for (let i = 0; i < Command.length; i++) {
                commands.push(Command[i].textContent);
            }
            return commands;
        } catch (error) {
            _logger.error("Error generating content:", error);
            throw error;
        }
    }

    public async stage3Validation(prompt: string): Promise<any> {
        try {
            const content: Content[] = [
                {
                    role: "user",
                    parts: [{ text: this.promptService.stage3rd() }],
                },
                {
                    role: "model",
                    parts: [{ text: prompt }],
                },
            ];
            const result = await this.model.generateContent({
                contents: content,
                generationConfig: this.generativeConfig,
            });
            const res = result.response.candidates[0].content.parts[0].text;
            const xmlData = this.stage4rdEXtraction(res);
            const xmlDoc = this.parser.parseFromString(xmlData, "application/xml");
            const resolutionSteps = xmlDoc.getElementsByTagName("ResolutionStep");
            const steps = [];
            let status = 'stop';
            for (let i = 0; i < resolutionSteps.length; i++) {
                const command = resolutionSteps[i].getElementsByTagName("Command")[0]?.textContent;
                const stepStatus = resolutionSteps[i].getElementsByTagName("Status")[0]?.textContent;
                if (command) {
                    steps.push(command);
                }
                if (stepStatus === 'continue') {
                    status = 'continue';
                }
            }
            return { status, commands: steps };
        } catch (error) {
            _logger.error("Error generating content:", error);
            throw error;
        }
    }

}