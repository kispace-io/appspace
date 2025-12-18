import {createLogger} from "../logger";

const logger = createLogger('OpenVSXClient');

export interface OpenVSXExtension {
    namespace: string;
    name: string;
    version: string;
    displayName?: string;
    description?: string;
    publisher?: string;
    files?: {
        download?: string;
    };
    metadata?: {
        displayName?: string;
        description?: string;
        publisher?: string;
        engines?: {
            vscode?: string;
        };
    };
}

export interface OpenVSXSearchResult {
    extensions: OpenVSXExtension[];
    offset: number;
    totalSize: number;
}

export class OpenVSXClient {
    private baseUrl: string;

    constructor(baseUrl: string = 'https://open-vsx.org/api') {
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async search(query: string, size: number = 20, offset: number = 0): Promise<OpenVSXSearchResult> {
        try {
            const url = `${this.baseUrl}/-/search?query=${encodeURIComponent(query)}&size=${size}&offset=${offset}`;
            logger.debug(`Searching Open VSX: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                extensions: data.extensions || [],
                offset: data.offset || offset,
                totalSize: data.totalSize || 0,
            };
        } catch (error) {
            logger.error(`Failed to search Open VSX: ${error}`);
            throw error;
        }
    }

    async getExtension(namespace: string, name: string, version?: string): Promise<OpenVSXExtension> {
        try {
            const url = version 
                ? `${this.baseUrl}/${namespace}/${name}/${version}`
                : `${this.baseUrl}/${namespace}/${name}`;
            
            logger.debug(`Fetching extension from Open VSX: ${url}`);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const extension = await response.json() as OpenVSXExtension;
            return extension;
        } catch (error) {
            logger.error(`Failed to get extension from Open VSX: ${error}`);
            throw error;
        }
    }

    getDownloadUrl(extension: OpenVSXExtension): string | undefined {
        if (extension.files?.download) {
            return extension.files.download;
        }

        const namespace = extension.namespace;
        const name = extension.name;
        const version = extension.version;
        
        if (namespace && name && version) {
            return `${this.baseUrl}/${namespace}/${name}/${version}/file/${namespace}.${name}-${version}.vsix`;
        }

        return undefined;
    }

    getExtensionId(extension: OpenVSXExtension): string {
        return `${extension.namespace}.${extension.name}`;
    }
}

export const openVSXClient = new OpenVSXClient();

