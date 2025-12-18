import JSZip from "jszip";
import {createLogger} from "../logger";
import {persistenceService} from "../persistenceservice";
import {openVSXClient, OpenVSXExtension} from "./openvsx-client";

const logger = createLogger('VSIXLoader');

const VSIX_STORAGE_PREFIX = "vsix_extensions/";

interface VSIXManifest {
    name: string;
    displayName?: string;
    version: string;
    main?: string;
    activationEvents?: string[];
    contributes?: any;
    engines?: {
        vscode?: string;
    };
    extensionKind?: string[];
    browser?: string;
    [key: string]: any;
}

export interface LoadedVSIX {
    manifest: VSIXManifest;
    extensionId: string;
    namespace: string;
    name: string;
    version: string;
    files: Map<string, string>;
    entryPoint?: string;
    isWebExtension?: boolean;
}

export class VSIXLoader {
    private loadedExtensions: Map<string, LoadedVSIX> = new Map();

    async loadFromOpenVSX(extension: OpenVSXExtension): Promise<LoadedVSIX> {
        const extensionId = openVSXClient.getExtensionId(extension);
        const cached = this.loadedExtensions.get(extensionId);
        if (cached && cached.version === extension.version) {
            logger.debug(`Using cached VSIX for ${extensionId}`);
            return cached;
        }

        const downloadUrl = openVSXClient.getDownloadUrl(extension);
        if (!downloadUrl) {
            throw new Error(`No download URL available for extension ${extensionId}`);
        }

        logger.info(`Loading VSIX from Open VSX: ${extensionId} v${extension.version}`);
        return await this.loadFromUrl(downloadUrl, extension);
    }

    async loadFromUrl(url: string, extension?: OpenVSXExtension): Promise<LoadedVSIX> {
        try {
            logger.debug(`Downloading VSIX from: ${url}`);
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const blob = await response.blob();
            return await this.extractVSIX(blob, extension);
        } catch (error) {
            logger.error(`Failed to load VSIX from URL ${url}: ${error}`);
            throw error;
        }
    }

    private async extractVSIX(blob: Blob, extension?: OpenVSXExtension): Promise<LoadedVSIX> {
        try {
            logger.debug("Extracting VSIX file...");
            const zip = await JSZip.loadAsync(blob);
            
            const manifestEntry = zip.file("extension/package.json") || zip.file("package.json");
            if (!manifestEntry) {
                throw new Error("VSIX file does not contain package.json");
            }

            const manifestText = await manifestEntry.async("string");
            const manifest: VSIXManifest = JSON.parse(manifestText);

            const extensionId = extension 
                ? openVSXClient.getExtensionId(extension)
                : `${manifest.publisher || 'unknown'}.${manifest.name}`;
            
            const namespace = extension?.namespace || manifest.publisher || 'unknown';
            const name = extension?.name || manifest.name;
            const version = extension?.version || manifest.version;

            const files = new Map<string, string>();
            let entryPoint: string;
            
            if (manifest.browser) {
                entryPoint = manifest.browser;
                logger.debug(`Using browser entry point (web extension): ${entryPoint}`);
            } else if (manifest.main) {
                entryPoint = manifest.main;
                logger.debug(`Using main entry point (Node.js extension): ${entryPoint}`);
            } else {
                entryPoint = "extension.js";
                logger.debug(`No entry point specified, using default: ${entryPoint}`);
            }
            
            entryPoint = entryPoint.replace(/^\.\//, '');

            logger.debug(`Processing VSIX files for ${extensionId}, entry point: ${entryPoint}`);

            for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
                if (zipEntry.dir) {
                    continue;
                }

                try {
                    const content = await zipEntry.async("string");
                    files.set(relativePath, content);
                } catch (error) {
                    try {
                        const blob = await zipEntry.async("blob");
                        const text = await blob.text();
                        files.set(relativePath, text);
                    } catch (blobError) {
                        logger.warn(`Failed to extract file ${relativePath}: ${blobError}`);
                    }
                }
            }
            
            logger.info(`Extracted ${files.size} files from VSIX`);
            
            const jsFiles = Array.from(files.keys()).filter(f => f.endsWith('.js') && !f.includes('node_modules'));
            logger.info(`JavaScript files in VSIX (${jsFiles.length}): ${jsFiles.slice(0, 20).join(', ')}${jsFiles.length > 20 ? '...' : ''}`);
            
            const largeJsFiles = jsFiles.filter(f => {
                const content = files.get(f);
                return content && content.length > 1000;
            });
            logger.info(`Large JavaScript files (>1KB, ${largeJsFiles.length}): ${largeJsFiles.join(', ')}`);
            
            const entryPointFiles = Array.from(files.keys()).filter(path => 
                path.includes(entryPoint) || path.endsWith(entryPoint) || path.endsWith('/' + entryPoint)
            );
            if (entryPointFiles.length > 0) {
                logger.debug(`Found potential entry point files: ${entryPointFiles.join(', ')}`);
            } else {
                const allJsFiles = Array.from(files.keys()).filter(path => path.endsWith('.js')).slice(0, 10);
                logger.debug(`Available JS files (first 10): ${allJsFiles.join(', ')}`);
            }

            const isWebExtension = this.isWebExtension(manifest);
            if (!isWebExtension) {
                logger.warn(`Extension ${extensionId} is not a web extension. It may require Node.js APIs that are not available in the browser.`);
            }

            const loadedVSIX: LoadedVSIX = {
                manifest,
                extensionId,
                namespace,
                name,
                version,
                files,
                entryPoint,
                isWebExtension,
            };

            await this.cacheVSIX(loadedVSIX);
            this.loadedExtensions.set(extensionId, loadedVSIX);

            logger.info(`Successfully extracted VSIX: ${extensionId} v${version}`);
            return loadedVSIX;
        } catch (error) {
            logger.error(`Failed to extract VSIX: ${error}`);
            throw error;
        }
    }

    private async cacheVSIX(loadedVSIX: LoadedVSIX): Promise<void> {
        try {
            const cacheKey = `${VSIX_STORAGE_PREFIX}${loadedVSIX.extensionId}/${loadedVSIX.version}`;
            await persistenceService.persistObject(cacheKey, {
                manifest: loadedVSIX.manifest,
                extensionId: loadedVSIX.extensionId,
                namespace: loadedVSIX.namespace,
                name: loadedVSIX.name,
                version: loadedVSIX.version,
                files: Object.fromEntries(loadedVSIX.files),
                entryPoint: loadedVSIX.entryPoint,
                isWebExtension: loadedVSIX.isWebExtension,
            });
        } catch (error) {
            logger.warn(`Failed to cache VSIX: ${error}`);
        }
    }

    async getCachedVSIX(extensionId: string, version: string): Promise<LoadedVSIX | null> {
        try {
            const cacheKey = `${VSIX_STORAGE_PREFIX}${extensionId}/${version}`;
            const cached = await persistenceService.getObject(cacheKey);
            
            if (cached) {
                const loadedVSIX: LoadedVSIX = {
                    manifest: cached.manifest,
                    extensionId: cached.extensionId,
                    namespace: cached.namespace,
                    name: cached.name,
                    version: cached.version,
                    files: new Map(Object.entries(cached.files || {})),
                    entryPoint: cached.entryPoint,
                };
                this.loadedExtensions.set(extensionId, loadedVSIX);
                return loadedVSIX;
            }
        } catch (error) {
            logger.debug(`No cached VSIX found for ${extensionId} v${version}`);
        }
        return null;
    }

    getLoadedVSIX(extensionId: string): LoadedVSIX | undefined {
        return this.loadedExtensions.get(extensionId);
    }

    getEntryPointCode(loadedVSIX: LoadedVSIX): string | null {
        let entryPoint = loadedVSIX.entryPoint || "extension.js";
        
        entryPoint = entryPoint.replace(/^\.\//, '');
        
        logger.info(`Looking for entry point: ${entryPoint} for extension ${loadedVSIX.extensionId}`);
        
        const possiblePaths = [
            `extension/${entryPoint}`,
            entryPoint,
            `extension/out/${entryPoint}`,
            `out/${entryPoint}`,
            `extension/extension/${entryPoint}`,
            `extension/browser/${entryPoint}`,
            `browser/${entryPoint}`,
        ];

        for (const path of possiblePaths) {
            const code = loadedVSIX.files.get(path);
            if (code) {
                logger.info(`Found entry point at: ${path} (${code.length} chars)`);
                logger.info(`Entry point content: ${code.substring(0, 200)}${code.length > 200 ? '...' : ''}`);
                return code;
            }
        }

        const allFiles = Array.from(loadedVSIX.files.keys());
        logger.info(`Entry point not found in standard paths. Available files (${allFiles.length} total):`);
        logger.info(`First 50 files: ${allFiles.slice(0, 50).join(', ')}`);
        
        const matchingFiles = allFiles.filter(path => 
            path.endsWith(entryPoint) || 
            path.endsWith('/' + entryPoint) ||
            path.includes('/' + entryPoint) ||
            path === entryPoint
        );

        if (matchingFiles.length > 0) {
            logger.info(`Found matching file: ${matchingFiles[0]}`);
            const code = loadedVSIX.files.get(matchingFiles[0]);
            if (code) {
                logger.info(`Loaded entry point from: ${matchingFiles[0]} (${code.length} chars)`);
                return code;
            }
        }

        logger.error(`Entry point not found for ${loadedVSIX.extensionId}: ${entryPoint}`);
        logger.error(`Searched paths: ${possiblePaths.join(', ')}`);
        logger.error(`Files containing '${entryPoint}': ${matchingFiles.join(', ') || 'none'}`);
        return null;
    }

    getFile(loadedVSIX: LoadedVSIX, relativePath: string): string | null {
        return loadedVSIX.files.get(relativePath) || null;
    }

    private isWebExtension(manifest: VSIXManifest): boolean {
        if (manifest.browser) {
            return true;
        }
        
        if (manifest.extensionKind) {
            if (manifest.extensionKind.includes('web') || manifest.extensionKind.includes('ui')) {
                return true;
            }
        }
        
        if (!manifest.main && !manifest.browser) {
            return true;
        }
        
        return false;
    }
    
    isUniversalExtension(manifest: VSIXManifest): boolean {
        if (manifest.main && manifest.browser) {
            return true;
        }
        
        if (manifest.extensionKind) {
            const kinds = manifest.extensionKind;
            const hasWeb = kinds.includes('web') || kinds.includes('ui');
            const hasWorkspace = kinds.includes('workspace');
            if (hasWeb && hasWorkspace) {
                return true;
            }
        }
        
        return false;
    }
}

export const vsixLoader = new VSIXLoader();

