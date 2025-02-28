export interface _File {
    path: string;
    content: string;
}

export interface _AIResponse {
    response: _File[];
}

export interface _FileToAnalyze {
    topFilesToAnalyze: {
        "path": string;
        "reason": string;
    }[];
}

export interface _CreatReadFile {
    create: create[];
    needToRead: needToRead[];
}


interface create {
    path: string | null;
    content: string | null;
}
interface needToRead {
    path: string | null;
    reason: string | null;
}
export interface XMLTestFile {
    path: string;
    content: string;
}

export interface XMLDependency {
    path: string;
    reason: string;
}


export interface CriticalFile {
    path: string;
    rationale: string;
    category: 'API Definition' | 'Controller' | 'Auth' | 'Service' | 'Validation';
    priority: number;
}


export interface ModelInfo {
    name: string;
    label: string;
    provider: string;
    maxTokenAllowed: number;
}


export interface ReActResult {
    success: boolean;
    finalCode?: string;
    actions: string[];
    errors: string[];
}

/**
 * Code update interface for ReAct
 */
export interface CodeUpdate {
    filePath: string;
    content: string;
    reason: string;
    missingPackage: string;
}

/**
 * ReAct Agent options
 */
export interface ReActAgentOptions {
    maxIterations?: number;
    debug?: boolean;
}