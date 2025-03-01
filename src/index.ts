import { exit } from "process";
import { LLMFactory } from "./llm/factory";
import { ReActAgent } from "./core/llm";

LLMFactory.getInstance(
    'google',
    {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string,
        model: 'gemini-2.0-flash',
        temperature: 0.5,
        debug: true
    },
).then((service) => {
    console.log('LLM service initialized successfully!', service);
    const reactAgent = new ReActAgent(
        service,
        { maxIterations: 8, debug: true }
    );
    reactAgent.generateTests('/Users/harshanand/autoTestX-test/tt').then((result) => {
        console.log('Tests generated successfully!', result);
    }).catch((error) => {
        console.error('Failed to generate tests. Errors:', error);
    }).finally(() => {
        console.log('Process completed');
        exit(0);
    });
}
).catch((error) => {
    console.error('Failed to initialize LLM service. Errors:', error);
});

