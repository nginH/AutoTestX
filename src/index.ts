import { exit } from "process";
import { LLMFactory } from "./llm/factory";
import { XMLService } from "./llm/parser/xml";
import { PromptService } from "./prompt";
import { ReActAgent } from "./service/llm";

const xmlService = new XMLService();
const promptService = new PromptService();

LLMFactory.getInstance(
    'google',
    {
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY as string,
        model: 'gemini-2.0-flash',
        temperature: 0.5,
    },
).then((service) => {
    console.log('LLM service initialized successfully!', service);
    const reactAgent = new ReActAgent(
        service,
        xmlService,
        promptService,
        { maxIterations: 10, debug: true }
    );
    reactAgent.generateTests('/Users/harshanand/Downloads/development/autotest/alumniConnect-Server copy/functions').then((result) => {
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


// const llmService = new LLMService(process.env.GOOGLE_GENERATIVE_AI_API_KEY as string);

// async function fixCodeWithReAct() {
//     const result = await llmService.executeReAct(
//         '/Users/harshanand/autoTestX-test/tt',              // Project directory
//         'npm start',                  // Command to validate code
//         'index.js',               // Main file to track
//         3                       // Max iterations
//     );

//     if (result.success) {
//         console.log('Code fixed successfully!');
//     } else {
//         console.log('Failed to fix code. Errors:', result.errors);
//         console.log('Actions taken:', result.actions);
//     }
// }

// fixCodeWithReAct().then(() => {
//     console.log('Code fixed successfully!');
// }
// ).catch((error) => {
//     console.error('Failed to fix code. Errors:', error);
// }).finally(() => {
//     console.log('Process completed');
// });