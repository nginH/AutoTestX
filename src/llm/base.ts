import { _logger } from "../utils/log/winston";
export interface LLMResponse {
    success: boolean;
    content: string;
    error?: string;
}
export abstract class BaseLLMService {
    protected name: string;

    constructor(name: string) {
        this.name = name;
    }
    abstract initialize(config: any): Promise<void>;
    abstract generateContent(prompt: string, options?: any): Promise<LLMResponse>;

    getName(): string {
        return this.name;
    }
    protected handleError(error: any): LLMResponse {
        const errorMessage = error instanceof Error ? error.message : String(error);
        _logger.error(`${this.name} LLM error: ${errorMessage}`);
        return {
            success: false,
            content: '',
            error: errorMessage
        };
    }
}