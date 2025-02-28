import { DOMParser } from 'xmldom';
import { _logger } from '../../utils/log/winston';

export class XMLService {
    private parser: DOMParser;
    constructor() {
        this.parser = new DOMParser();
    }
    extractXMLContent(text: string, tagName: string): string {
        const startTag = `<${tagName}>`;
        const endTag = `</${tagName}>`;
        const startIndex = text.indexOf(startTag);
        const endIndex = text.lastIndexOf(endTag) + endTag.length;

        if (startIndex === -1 || endIndex === -1) {
            throw new Error(`No valid XML content found with tag '${tagName}'`);
        }

        return text.slice(startIndex, endIndex);
    }
    parseXML(xmlString: string): Document {
        try {
            return this.parser.parseFromString(xmlString, 'application/xml');
        } catch (error) {
            _logger.error(`Error parsing XML: ${error}`);
            throw new Error(`Failed to parse XML: ${error}`);
        }
    }
    getElementTextContent(doc: Document, tagName: string): string[] {
        const elements = doc.getElementsByTagName(tagName);
        const results: string[] = [];

        for (let i = 0; i < elements.length; i++) {
            const content = elements[i].textContent;
            if (content) {
                results.push(content);
            }
        }

        return results;
    }
    extractCriticalFiles(xmlContent: string): string[] {
        try {
            const xml = this.extractXMLContent(xmlContent, 'CriticalFiles');
            const doc = this.parseXML(xml);
            const paths = this.getElementTextContent(doc, 'Path');
            return paths.flatMap(path =>
                path.includes(',') ? path.split(',').map(p => p.trim()) : [path.trim()]
            );
        } catch (error) {
            _logger.error(`Error extracting critical files: ${error}`);
            throw error;
        }
    }
    extractTestFiles(xmlContent: string): { path: string; content: string }[] {
        try {
            const xml = this.extractXMLContent(xmlContent, 'TestGenerationReport');
            const doc = this.parseXML(xml);
            const testFiles = doc.getElementsByTagName('TestFile');
            const results: { path: string; content: string }[] = [];

            for (let i = 0; i < testFiles.length; i++) {
                const testFile = testFiles[i];
                const pathElement = testFile.getElementsByTagName('Path')[0];
                const contentElement = testFile.getElementsByTagName('Content')[0];
                if (pathElement && contentElement) {
                    const path = pathElement.textContent || '';
                    const content = contentElement.textContent || '';

                    results.push({
                        path: path,
                        content: content
                    });
                }
            }

            return results;
        } catch (error) {
            _logger.error(`Error extracting test files: ${error}`);
            throw error;
        }
    }
    extractDependencies(xmlContent: string): { path: string; reason: string }[] {
        try {
            const xml = this.extractXMLContent(xmlContent, 'TestGenerationReport');
            const doc = this.parseXML(xml);
            const dependencyNodes = doc.getElementsByTagName('DependencyGraph');
            const results: { path: string; reason: string }[] = [];

            for (let i = 0; i < dependencyNodes.length; i++) {
                const node = dependencyNodes[i];
                const pathElement = node.getElementsByTagName('Path')[0];
                const reasonElement = node.getElementsByTagName('Reason')[0];

                if (pathElement) {
                    const path = pathElement.textContent || '';
                    const reason = reasonElement ? reasonElement.textContent || '' : '';

                    results.push({
                        path: path,
                        reason: reason
                    });
                }
            }

            return results;
        } catch (error) {
            _logger.error(`Error extracting dependencies: ${error}`);
            throw error;
        }
    }

    extractCodeUpdates(xmlContent: string): {
        filePath: string;
        content: string;
        reason: string;
        missigPackage: string
    }[] {
        try {
            if (xmlContent.includes('<CodeUpdates>')) {
                const xml = this.extractXMLContent(xmlContent, 'CodeUpdates');
                const doc = this.parseXML(xml);
                const updateNodes = doc.getElementsByTagName('Update');
                const results: { filePath: string; content: string; reason: string; missigPackage: string }[] = [];

                for (let i = 0; i < updateNodes.length; i++) {
                    const updateNode = updateNodes[i];
                    const filePathElement = updateNode.getElementsByTagName('FilePath')[0];
                    const contentElement = updateNode.getElementsByTagName('Content')[0];
                    const reasonElement = updateNode.getElementsByTagName('Reason')[0];
                    const missigDepe = updateNode.getElementsByTagName('MissingDependencies')[0];
                    let missigPackage = ''
                    if (missigDepe) {
                        const dependencies = missigDepe.getElementsByTagName('Dependency');
                        missigPackage = Array.from(dependencies).map(dep => dep.textContent || '').join(', ');
                    }

                    if (filePathElement && contentElement) {
                        const filePath = filePathElement.textContent || '';
                        const content = contentElement.textContent || '';
                        const reason = reasonElement ? reasonElement.textContent || '' : '';

                        results.push({
                            filePath,
                            content,
                            reason,
                            missigPackage
                        });
                    }
                }

                return results;
            }
            const updates: { filePath: string; content: string; reason: string, missigPackage: string }[] = [];
            const codeBlockRegex = /```(?:typescript|javascript|ts|js)?\s*(?:\/\/\s*([^\n]+))?\s*([\s\S]*?)```/g;
            const filePathRegex = /File\s*path\s*:\s*([^\n]+)/gi;

            let match;
            while ((match = codeBlockRegex.exec(xmlContent)) !== null) {
                let filePath = '';
                let reason = match[1] || 'Code update';
                const content = match[2].trim();
                const contextBefore = xmlContent.substring(0, match.index).split('\n').slice(-5).join('\n');
                const missigPackage = contextBefore.includes('Missing dependencies') ? 'Missing dependencies' : '';
                const filePathMatch = filePathRegex.exec(contextBefore);

                if (filePathMatch) {
                    filePath = filePathMatch[1].trim();
                }
                console.log("missigPackage", missigPackage);
                if (filePath) {
                    updates.push({ filePath, content, reason, missigPackage });
                }
            }
            return updates;
        } catch (error) {
            _logger.error(`Error extracting code updates: ${error}`);
            throw error;
        }
    }
}