export interface _File {
    path: string;
    content: string;
}

export interface _AIResponse {
    response: _File[];
}

export interface _FileToAnalyze {
    fileToAnalyze: {
        "path": string;
        "reason": string;
    }[];
}

export interface _CreatReadFile {
    create: create[];
    needToRead: needToRead[];
}


interface create {
    path: string;
    content: string;
}
interface needToRead {
    path: string;
    reason: string;
}