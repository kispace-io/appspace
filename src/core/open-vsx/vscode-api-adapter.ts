import {createLogger} from "../logger";
import {commandRegistry, Handler, Command} from "../commandregistry";
import {workspaceService, File, FileContentType} from "../filesys";
import {LoadedVSIX} from "./vsixloader";

const logger = createLogger('VSCodeAPIAdapter');

export interface ExtensionContext {
    extensionPath: string;
    subscriptions: { dispose(): void }[];
    workspaceState: any;
    globalState: any;
    extensionUri: any;
    extension: {
        id: string;
        extensionPath: string;
    };
}

export class VSCodeAPIAdapter {
    private extensionContext: ExtensionContext;
    private loadedVSIX: LoadedVSIX;
    private commandHandlers: Map<string, Function> = new Map();

    constructor(loadedVSIX: LoadedVSIX) {
        this.loadedVSIX = loadedVSIX;
        this.extensionContext = this.createExtensionContext();
    }

    private createExtensionContext(): ExtensionContext {
        return {
            extensionPath: `vsix:${this.loadedVSIX.extensionId}`,
            subscriptions: [],
            workspaceState: {},
            globalState: {},
            extensionUri: null,
            extension: {
                id: this.loadedVSIX.extensionId,
                extensionPath: `vsix:${this.loadedVSIX.extensionId}`,
            },
        };
    }

    getContext(): ExtensionContext {
        return this.extensionContext;
    }

    createVSCodeAPI(): any {
        const adapter = this;
        
        return {
            commands: {
                registerCommand: (commandId: string, callback: Function, thisArg?: any) => {
                    logger.info(`[VS Code API] registerCommand called: ${commandId}`);
                    logger.debug(`[VS Code API] Callback type: ${typeof callback}, thisArg: ${thisArg ? 'provided' : 'none'}`);
                    logger.debug(`[VS Code API] Callback: ${callback.toString().substring(0, 200)}...`);
                    
                    if (typeof callback !== 'function') {
                        logger.error(`[VS Code API] registerCommand called with non-function callback for ${commandId}`);
                        throw new Error(`registerCommand callback must be a function`);
                    }
                    
                    const handler: Handler = {
                        canExecute: () => true,
                        execute: async (context) => {
                            try {
                                logger.debug(`[VS Code API] Executing command handler: ${commandId}`);
                                const args = context.params ? Object.values(context.params) : [];
                                const result = await callback.apply(thisArg, args);
                                logger.debug(`[VS Code API] Command ${commandId} executed successfully`);
                                return result;
                            } catch (error) {
                                logger.error(`Error executing VS Code command ${commandId}: ${error}`);
                                throw error;
                            }
                        },
                    };

                    if (!commandRegistry.hasCommand(commandId)) {
                        const command = new Command(
                            commandId,
                            commandId,
                            `VS Code command: ${commandId}`
                        );
                        commandRegistry.registerCommand(command);
                    }
                    
                    commandRegistry.registerHandler(commandId, handler);
                    adapter.commandHandlers.set(commandId, callback);

                    const disposable = {
                        dispose: () => {
                            logger.debug(`Disposing VS Code command: ${commandId}`);
                            adapter.commandHandlers.delete(commandId);
                        },
                    };

                    adapter.extensionContext.subscriptions.push(disposable);
                    return disposable;
                },

                executeCommand: async (commandId: string, ...args: any[]) => {
                    logger.debug(`Executing VS Code command: ${commandId}`);
                    return await commandRegistry.execute(commandId, { params: args });
                },

                getCommands: async (): Promise<string[]> => {
                    return Array.from(adapter.commandHandlers.keys());
                },
            },

            workspace: {
                workspaceFolders: [],

                getConfiguration: (section?: string) => {
                    return {
                        get: (key: string, defaultValue?: any) => {
                            logger.debug(`Getting config: ${section}.${key}`);
                            return defaultValue;
                        },
                        update: async (key: string, value: any) => {
                            logger.debug(`Updating config: ${section}.${key}`);
                        },
                        has: (key: string) => false,
                        inspect: (key: string) => undefined,
                    };
                },

                onDidChangeConfiguration: (listener: Function) => {
                    const disposable = {
                        dispose: () => {},
                    };
                    adapter.extensionContext.subscriptions.push(disposable);
                    return disposable;
                },

                openTextDocument: async (uriOrFileName: any) => {
                    logger.debug(`Opening text document: ${uriOrFileName}`);
                    const fileName = typeof uriOrFileName === 'string' 
                        ? uriOrFileName 
                        : uriOrFileName.fsPath || uriOrFileName.path;
                    
                    const workspace = await workspaceService.getWorkspace();
                    if (!workspace) {
                        throw new Error('No workspace available');
                    }

                    const file = await workspace.getResource(fileName);
                    if (!file || !(file instanceof File)) {
                        throw new Error(`File not found: ${fileName}`);
                    }

                    return {
                        uri: { fsPath: fileName, path: fileName },
                        fileName,
                        getText: async () => {
                            return await file.getContents({ contentType: FileContentType.TEXT });
                        },
                    };
                },

                fs: {
                    readFile: async (uri: any) => {
                        const path = uri.fsPath || uri.path || uri;
                        const workspace = await workspaceService.getWorkspace();
                        if (!workspace) {
                            throw new Error('No workspace available');
                        }
                        const file = await workspace.getResource(path);
                        if (file && file instanceof File) {
                            const contents = await file.getContents({ contentType: FileContentType.TEXT });
                            return typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
                        }
                        throw new Error(`File not found: ${path}`);
                    },
                    writeFile: async (uri: any, content: Uint8Array) => {
                        const path = uri.fsPath || uri.path || uri;
                        const workspace = await workspaceService.getWorkspace();
                        if (!workspace) {
                            throw new Error('No workspace available');
                        }
                        const file = await workspace.getResource(path, { create: true });
                        if (file && file instanceof File) {
                            await file.saveContents(content, { contentType: FileContentType.BINARY });
                        }
                    },
                },
            },

            window: {
                showInformationMessage: (message: string, ...items: string[]) => {
                    logger.info(`[VS Code Extension] ${message}`);
                    return Promise.resolve(undefined);
                },
                showWarningMessage: (message: string, ...items: string[]) => {
                    logger.warn(`[VS Code Extension] ${message}`);
                    return Promise.resolve(undefined);
                },
                showErrorMessage: (message: string, ...items: string[]) => {
                    logger.error(`[VS Code Extension] ${message}`);
                    return Promise.resolve(undefined);
                },
                createOutputChannel: (name: string) => {
                    return {
                        append: (value: string) => logger.debug(`[${name}] ${value}`),
                        appendLine: (value: string) => logger.debug(`[${name}] ${value}`),
                        show: () => {},
                        hide: () => {},
                        dispose: () => {},
                    };
                },
                activeTextEditor: undefined,
                onDidChangeActiveTextEditor: (listener: Function) => {
                    const disposable = { dispose: () => {} };
                    adapter.extensionContext.subscriptions.push(disposable);
                    return disposable;
                },
            },

            extensions: {
                getExtension: (extensionId: string) => {
                    if (extensionId === adapter.loadedVSIX.extensionId) {
                        return {
                            id: adapter.loadedVSIX.extensionId,
                            extensionPath: adapter.extensionContext.extensionPath,
                            packageJSON: adapter.loadedVSIX.manifest,
                        };
                    }
                    return undefined;
                },
            },

            ExtensionContext: class {
                constructor(public extensionPath: string) {}
            },
        };
    }

    dispose(): void {
        for (const subscription of this.extensionContext.subscriptions) {
            try {
                subscription.dispose();
            } catch (error) {
                logger.warn(`Error disposing subscription: ${error}`);
            }
        }
        this.extensionContext.subscriptions = [];
    }
}

export function createVSCodeAPI(loadedVSIX: LoadedVSIX): { vscode: any; context: ExtensionContext } {
    const adapter = new VSCodeAPIAdapter(loadedVSIX);
    const vscode = adapter.createVSCodeAPI();
    return { vscode, context: adapter.getContext() };
}

