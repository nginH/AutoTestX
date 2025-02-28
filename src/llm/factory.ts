import { _logger } from "../utils/log/winston";
import { BaseLLMService } from "./base";
import { GoogleAIService } from "./service/google.llm";
import { OpenAIService } from "./service/openAi.llm";

export class LLMFactory {
    private static instances: Map<string, BaseLLMService> = new Map();
    static async getInstance(type: string, config: any): Promise<BaseLLMService> {
        const lowerType = type.toLowerCase();

        if (this.instances.has(lowerType)) {
            return this.instances.get(lowerType)!;
        }
        let service: BaseLLMService;
        switch (lowerType) {
            case "openai":
                service = new OpenAIService();
                break;
            case "google":
                service = new GoogleAIService();
                break;
            default:
                throw new Error(`Unsupported LLM type: ${type}`);
        }
        await service.initialize(config);
        this.instances.set(lowerType, service);
        _logger.info(`Created ${service.getName()} LLM service`);
        return service;
    }
}