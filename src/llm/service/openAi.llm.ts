import { BaseLLMService, LLMResponse } from "../base";
import { _logger } from "../../utils/log/winston";
import { OpenAI } from "@langchain/openai";

interface OpenAIConfig {
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
}

export class OpenAIService extends BaseLLMService {
    private client: OpenAI | null = null;
    private config: OpenAIConfig | null = null;

    constructor() {
        super("OpenAI");
    }

    async initialize(config: OpenAIConfig): Promise<void> {
        if (!config.apiKey) {
            throw new Error(`Missing API Key for ${this.name} LLM`);
        }

        this.config = {
            ...config,
            temperature: config.temperature || 0.7,
            maxTokens: config.maxTokens || 1500
        };

        this.client = new OpenAI({
            openAIApiKey: this.config.apiKey,
            modelName: this.config.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens
        });

        _logger.info(`${this.name} LLM service initialized with model: ${this.config.model}`);
    }

    async generateContent(prompt: string, options?: any): Promise<LLMResponse> {
        try {
            if (!this.client) {
                throw new Error(`${this.name} LLM service not initialized`);
            }
            // const mergedOptions = { ...this.config, ...options };
            if (options) {
                this.client.temperature = options.temperature || this.client.temperature;
                this.client.maxTokens = options.maxTokens || this.client.maxTokens;
            }

            const response = await this.client.call(prompt);

            return {
                success: true,
                content: response
            };
        } catch (error) {
            return this.handleError(error);
        }
    }
}