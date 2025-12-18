import {createLogger} from "../logger";
import {vsixLoader, LoadedVSIX} from "./vsixloader";
import {openVSXClient, OpenVSXExtension} from "./openvsx-client";
import {createVSCodeAPI} from "./vscode-api-adapter";
import {commandRegistry, Command, Handler} from "../commandregistry";
import {getNodePolyfill} from "./nodejs-polyfills";

const logger = createLogger('VSIXExtensionLoader');

export class VSIXExtensionLoader {
    async loadFromOpenVSX(extension: OpenVSXExtension): Promise<void> {
        try {
            logger.info(`Loading VSIX extension from Open VSX: ${extension.namespace}.${extension.name}`);
            
            const loadedVSIX = await vsixLoader.loadFromOpenVSX(extension);
            await this.activateExtension(loadedVSIX);
        } catch (error) {
            logger.error(`Failed to load VSIX extension: ${error}`);
            throw error;
        }
    }

    async loadFromUrl(url: string, extension?: OpenVSXExtension): Promise<void> {
        try {
            logger.info(`Loading VSIX extension from URL: ${url}`);
            
            const loadedVSIX = await vsixLoader.loadFromUrl(url, extension);
            await this.activateExtension(loadedVSIX);
        } catch (error) {
            logger.error(`Failed to load VSIX extension from URL: ${error}`);
            throw error;
        }
    }

    private async activateExtension(loadedVSIX: LoadedVSIX): Promise<void> {
        try {
            logger.debug(`Activating VSIX extension: ${loadedVSIX.extensionId}`);
            
            const isUniversal = vsixLoader.isUniversalExtension(loadedVSIX.manifest);
            
            if (loadedVSIX.isWebExtension === false && !isUniversal) {
                const errorMsg = `Extension ${loadedVSIX.extensionId} is not a web extension and requires Node.js APIs that are not available in the browser.`;
                logger.error(errorMsg);
                throw new Error(errorMsg);
            }
            
            if (isUniversal) {
                logger.info(`Loading Universal extension ${loadedVSIX.extensionId} in web context`);
            }
            
            const entryPointCode = vsixLoader.getEntryPointCode(loadedVSIX);
            if (!entryPointCode) {
                throw new Error(`Entry point not found for extension ${loadedVSIX.extensionId}`);
            }

            const {vscode, context} = createVSCodeAPI(loadedVSIX);
            
            this.registerCommandsFromManifest(loadedVSIX, vscode);
            
            const activateFunction = this.createActivateFunction(entryPointCode, vscode, context, loadedVSIX);
            
            if (activateFunction && typeof activateFunction === 'function') {
                try {
                    logger.info(`Calling activate function for ${loadedVSIX.extensionId}...`);
                    
                    const originalConsoleLog = console.log;
                    const originalConsoleError = console.error;
                    const extensionLogs: string[] = [];
                    
                    console.log = (...args: any[]) => {
                        extensionLogs.push(`[EXT LOG] ${args.map(a => String(a)).join(' ')}`);
                        originalConsoleLog.apply(console, args);
                    };
                    console.error = (...args: any[]) => {
                        extensionLogs.push(`[EXT ERROR] ${args.map(a => String(a)).join(' ')}`);
                        originalConsoleError.apply(console, args);
                    };
                    
                    try {
                        const result = await activateFunction(context);
                        logger.info(`Activate function completed for ${loadedVSIX.extensionId}, result: ${result}`);
                        
                        if (extensionLogs.length > 0) {
                            logger.debug(`Extension console output (${extensionLogs.length} lines): ${extensionLogs.slice(0, 10).join('; ')}${extensionLogs.length > 10 ? '...' : ''}`);
                        }
                        
                        const handlersAfterActivation = commandRegistry.getHandler('quarto.newDocument');
                        const allHandlers = handlersAfterActivation?.length || 0;
                        logger.info(`Handlers for quarto.newDocument after activation: ${allHandlers} (expected: 2 - manifest + extension)`);
                        
                        if (allHandlers === 1) {
                            logger.warn(`Extension did not register handlers via vscode.commands.registerCommand() - commands may not work`);
                        }
                    } finally {
                        console.log = originalConsoleLog;
                        console.error = originalConsoleError;
                    }
                    
                    logger.info(`Successfully activated VSIX extension: ${loadedVSIX.extensionId}`);
                } catch (activationError) {
                    logger.error(`Extension ${loadedVSIX.extensionId} activation function threw an error: ${activationError}`);
                    logger.error(`Activation error stack: ${activationError instanceof Error ? activationError.stack : String(activationError)}`);
                    logger.debug(`This may be expected if the extension uses a different activation pattern`);
                }
            } else {
                logger.info(`Extension ${loadedVSIX.extensionId} loaded (no activate function, may use declarative contributions only)`);
            }
        } catch (error) {
            logger.error(`Failed to activate VSIX extension: ${error}`);
            throw error;
        }
    }

    private registerCommandsFromManifest(loadedVSIX: LoadedVSIX, vscode: any): void {
        const contributes = loadedVSIX.manifest.contributes;
        if (!contributes || !contributes.commands) {
            logger.debug(`No commands found in manifest for ${loadedVSIX.extensionId}`);
            return;
        }

        logger.info(`Registering ${contributes.commands.length} command metadata from manifest for ${loadedVSIX.extensionId}`);
        logger.info(`Extension will register actual handlers via vscode.commands.registerCommand()`);
        
        for (const commandDef of contributes.commands) {
            if (typeof commandDef === 'object' && commandDef.command && commandDef.title) {
                const commandId = commandDef.command;
                const command = new Command(
                    commandId,
                    commandDef.title,
                    commandDef.category || commandDef.title
                );
                commandRegistry.registerCommand(command);
                logger.debug(`Registered command metadata from manifest: ${commandId} - ${commandDef.title}`);
            } else {
                logger.warn(`Invalid command definition in manifest: ${JSON.stringify(commandDef)}`);
            }
        }
        
        logger.info(`Successfully registered ${contributes.commands.length} command metadata entries from manifest`);
        logger.info(`Note: Commands will only appear in palette after extension registers handlers via vscode.commands.registerCommand()`);
    }

    private createActivateFunction(
        code: string,
        vscode: any,
        context: any,
        loadedVSIX: LoadedVSIX
    ): Function {
        const moduleExports: any = {};
        const moduleRequire = (moduleName: string): any => {
            logger.info(`[Module Require] Requesting module: ${moduleName}`);
            
            if (moduleName === 'vscode') {
                logger.info(`[Module Require] Returning vscode API`);
                return vscode;
            }
            
            const nodePolyfill = getNodePolyfill(moduleName);
            if (nodePolyfill !== null) {
                logger.info(`[Module Require] Returning Node.js polyfill for: ${moduleName}`);
                if (typeof nodePolyfill === 'function') {
                    return nodePolyfill();
                }
                return nodePolyfill;
            }
            
            if (moduleName === 'Buffer' || moduleName === 'buffer') {
                logger.info(`[Module Require] Returning Buffer polyfill`);
                return this.getBufferPolyfill();
            }
            
            const file = this.resolveModulePath(loadedVSIX, moduleName);
            if (file) {
                logger.info(`[Module Require] Found file for module: ${moduleName} -> ${file.path} (${file.content.length} chars)`);
                return this.evaluateModule(file.content, vscode, context, loadedVSIX);
            }
            
            logger.warn(`[Module Require] Module not found: ${moduleName}`);
            return {};
        };

        try {
            const BufferPolyfill = this.getBufferPolyfill();
            
            logger.info(`Creating activate function for ${loadedVSIX.extensionId}, code length: ${code.length} chars`);
            logger.info(`First 500 chars of extension code: ${code.substring(0, 500)}${code.length > 500 ? '...' : ''}`);
            
            const factory = new Function('exports', 'require', 'module', '__filename', '__dirname', 'vscode', 'context', 'Buffer', code);
            
            logger.info(`Executing extension code for ${loadedVSIX.extensionId}...`);
            
            const originalError = console.error;
            const originalLog = console.log;
            const errors: any[] = [];
            const logs: any[] = [];
            
            console.error = (...args: any[]) => {
                errors.push(args);
                originalError.apply(console, args);
            };
            console.log = (...args: any[]) => {
                logs.push(args);
                originalLog.apply(console, args);
            };
            
            try {
                factory(moduleExports, moduleRequire, {exports: moduleExports}, '', '', vscode, context, BufferPolyfill);
                logger.info(`Extension code executed successfully`);
                
                if (errors.length > 0) {
                    logger.warn(`Extension code had ${errors.length} console.error calls during execution`);
                    errors.slice(0, 5).forEach((err, idx) => {
                        logger.warn(`Extension error ${idx + 1}: ${err.map((e: any) => String(e)).join(' ')}`);
                    });
                }
                
                if (logs.length > 0) {
                    logger.info(`Extension code had ${logs.length} console.log calls during execution`);
                    logs.slice(0, 5).forEach((log, idx) => {
                        logger.info(`Extension log ${idx + 1}: ${log.map((e: any) => String(e)).join(' ')}`);
                    });
                }
            } catch (execError) {
                logger.error(`Error executing extension code: ${execError}`);
                logger.error(`Stack: ${execError instanceof Error ? execError.stack : String(execError)}`);
                throw execError;
            } finally {
                console.error = originalError;
                console.log = originalLog;
            }
            
            const exportKeys = Object.keys(moduleExports);
            logger.info(`Extension ${loadedVSIX.extensionId} exports: ${exportKeys.join(', ') || 'none'}`);
            
            if (typeof moduleExports.activate === 'function') {
                logger.info(`Found activate function for ${loadedVSIX.extensionId}`);
                return moduleExports.activate;
            }
            
            if (typeof moduleExports.default === 'function') {
                logger.debug(`Found default export function, using as activate for ${loadedVSIX.extensionId}`);
                return moduleExports.default;
            }
            
            if (exportKeys.length > 0) {
                logger.debug(`Extension ${loadedVSIX.extensionId} exports: ${exportKeys.join(', ')} (no activate function, may be declarative only)`);
            } else {
                logger.debug(`Extension ${loadedVSIX.extensionId} has no exports (may be declarative only - contributions registered from manifest)`);
            }
            return () => {};
        } catch (error) {
            logger.error(`Failed to create activate function: ${error}`);
            logger.error(`Error details: ${error instanceof Error ? error.stack : String(error)}`);
            if (error instanceof Error && error.message.includes('not a constructor')) {
                logger.error(`This error typically indicates the extension requires Node.js APIs that are not available in the browser.`);
                logger.error(`Extension ${loadedVSIX.extensionId} may not be a web extension.`);
            }
            throw error;
        }
    }

    private resolveModulePath(loadedVSIX: LoadedVSIX, moduleName: string): { path: string; content: string } | null {
        const possiblePaths = [
            moduleName,
            `extension/${moduleName}`,
            `extension/out/${moduleName}`,
            `extension/out/browser/${moduleName}`,
            `out/${moduleName}`,
            `out/browser/${moduleName}`,
            `browser/${moduleName}`,
            moduleName.replace(/^\.\//, ''),
            `extension/${moduleName.replace(/^\.\//, '')}`,
        ];
        
        for (const path of possiblePaths) {
            const content = loadedVSIX.files.get(path);
            if (content) {
                return { path, content };
            }
        }
        
        const allFiles = Array.from(loadedVSIX.files.keys());
        const matchingFiles = allFiles.filter(f => 
            f.endsWith(moduleName) || 
            f.endsWith('/' + moduleName) ||
            f.includes('/' + moduleName.replace(/^\.\//, ''))
        );
        
        if (matchingFiles.length > 0) {
            const content = loadedVSIX.files.get(matchingFiles[0]);
            if (content) {
                return { path: matchingFiles[0], content };
            }
        }
        
        return null;
    }

    private evaluateModule(
        code: string,
        vscode: any,
        context: any,
        loadedVSIX: LoadedVSIX
    ): any {
        const moduleExports: any = {};
        const moduleRequire = (moduleName: string): any => {
            if (moduleName === 'vscode') {
                return vscode;
            }
            
            const nodePolyfill = getNodePolyfill(moduleName);
            if (nodePolyfill !== null) {
                if (typeof nodePolyfill === 'function') {
                    return nodePolyfill();
                }
                return nodePolyfill;
            }
            
            if (moduleName === 'Buffer' || moduleName === 'buffer') {
                return this.getBufferPolyfill();
            }
            
            const file = vsixLoader.getFile(loadedVSIX, moduleName);
            if (file) {
                return this.evaluateModule(file, vscode, context, loadedVSIX);
            }
            return {};
        };

        try {
            const factory = new Function('exports', 'require', 'module', '__filename', '__dirname', 'vscode', 'context', 'Buffer', code);
            const BufferPolyfill = this.getBufferPolyfill();
            factory(moduleExports, moduleRequire, {exports: moduleExports}, '', '', vscode, context, BufferPolyfill);
            return moduleExports;
        } catch (error) {
            logger.warn(`Failed to evaluate module: ${error}`);
            return {};
        }
    }

    private getBufferPolyfill(): any {
        if (typeof globalThis.Buffer !== 'undefined') {
            return globalThis.Buffer;
        }
        
        class BufferPolyfill extends Uint8Array {
            static from(data: any, encoding?: string): BufferPolyfill {
                if (typeof data === 'string') {
                    const encoder = new TextEncoder();
                    return new BufferPolyfill(encoder.encode(data));
                }
                if (data instanceof ArrayBuffer) {
                    return new BufferPolyfill(data);
                }
                if (Array.isArray(data)) {
                    return new BufferPolyfill(new Uint8Array(data));
                }
                return new BufferPolyfill(new Uint8Array(0));
            }
            
            static alloc(size: number, fill?: number | string): BufferPolyfill {
                const buffer = new BufferPolyfill(new Uint8Array(size));
                if (fill !== undefined) {
                    if (typeof fill === 'number') {
                        buffer.fill(fill);
                    } else {
                        const encoder = new TextEncoder();
                        const encoded = encoder.encode(fill);
                        for (let i = 0; i < size && i < encoded.length; i++) {
                            buffer[i] = encoded[i];
                        }
                    }
                }
                return buffer;
            }
            
            toString(encoding: string = 'utf8'): string {
                const decoder = new TextDecoder(encoding === 'utf8' ? 'utf-8' : encoding);
                return decoder.decode(this);
            }
            
            slice(start?: number, end?: number): BufferPolyfill {
                return new BufferPolyfill(super.slice(start, end));
            }
        }
        
        return BufferPolyfill;
    }
}

export const vsixExtensionLoader = new VSIXExtensionLoader();

