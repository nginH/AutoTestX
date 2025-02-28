import { _logger } from "../../utils/log/winston";
import { BaseLLMService, LLMResponse } from "../base";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface GoogleAIConfig {
    apiKey: string;
    model: string;
    temperature?: number;
    topP?: number;
    topK?: number;
}

export class GoogleAIService extends BaseLLMService {
    private client: GoogleGenerativeAI | null = null;
    private model: any = null;
    private config: GoogleAIConfig | null = null;

    constructor() {
        super("Google AI");
    }

    async initialize(config: GoogleAIConfig): Promise<void> {
        if (!config.apiKey) {
            throw new Error(`Missing API Key for ${this.name} LLM`);
        }

        this.config = {
            ...config,
            temperature: config.temperature || 1.0,
            topP: config.topP || 0.95,
            topK: config.topK || 40
        };

        this.client = new GoogleGenerativeAI(this.config.apiKey);
        this.model = this.client.getGenerativeModel({ model: this.config.model });

        _logger.info(`${this.name} LLM service initialized with model: ${this.config.model}`);
    }

    async generateContent(prompt: string, options?: any): Promise<LLMResponse> {
        try {
            if (!this.client || !this.model) {
                throw new Error(`${this.name} LLM service not initialized`);
            }

            const generationConfig = {
                temperature: options?.temperature || this.config?.temperature,
                topP: options?.topP || this.config?.topP,
                topK: options?.topK || this.config?.topK,
            };

            const content = [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ];

            const result = await this.model.generateContent({
                contents: content,
                generationConfig
            });

            const responseText = result.response.candidates[0].content.parts[0].text;

            return {
                success: true,
                content: responseText
            };
        } catch (error) {
            return this.handleError(error);
        }
    }
}