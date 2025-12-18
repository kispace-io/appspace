export const nodePolyfills: Record<string, any> = {
    'path': {
        join: (...paths: string[]) => {
            return paths.filter(p => p).join('/').replace(/\/+/g, '/');
        },
        resolve: (...paths: string[]) => {
            return paths.filter(p => p).join('/').replace(/\/+/g, '/');
        },
        dirname: (path: string) => {
            const parts = path.split('/');
            parts.pop();
            return parts.join('/') || '.';
        },
        basename: (path: string, ext?: string) => {
            const parts = path.split('/');
            let name = parts[parts.length - 1] || path;
            if (ext && name.endsWith(ext)) {
                name = name.slice(0, -ext.length);
            }
            return name;
        },
        extname: (path: string) => {
            const parts = path.split('/');
            const name = parts[parts.length - 1] || path;
            const dotIndex = name.lastIndexOf('.');
            return dotIndex > 0 ? name.slice(dotIndex) : '';
        },
        sep: '/',
        delimiter: ':',
    },
    
    'node:path': null,
    
    'fs': {
        readFileSync: () => {
            throw new Error('fs.readFileSync not supported in browser');
        },
        writeFileSync: () => {
            throw new Error('fs.writeFileSync not supported in browser');
        },
        existsSync: () => false,
        statSync: () => {
            throw new Error('fs.statSync not supported in browser');
        },
        readdirSync: () => [],
        mkdirSync: () => {},
        constants: {
            O_RDONLY: 0,
            O_WRONLY: 1,
            O_RDWR: 2,
        },
    },
    
    'node:fs': null,
    
    'os': {
        platform: () => 'browser',
        arch: () => 'x64',
        homedir: () => '/',
        tmpdir: () => '/tmp',
        EOL: '\n',
        cpus: () => [{ model: 'Browser CPU' }],
        totalmem: () => 0,
        freemem: () => 0,
    },
    
    'node:os': null,
    
    'events': (() => {
        class EventEmitter {
            private listeners: Map<string, Function[]> = new Map();
            
            on(event: string, listener: Function) {
                if (!this.listeners.has(event)) {
                    this.listeners.set(event, []);
                }
                this.listeners.get(event)!.push(listener);
                return this;
            }
            
            once(event: string, listener: Function) {
                const onceWrapper = (...args: any[]) => {
                    listener(...args);
                    this.off(event, onceWrapper);
                };
                return this.on(event, onceWrapper);
            }
            
            off(event: string, listener: Function) {
                const listeners = this.listeners.get(event);
                if (listeners) {
                    const index = listeners.indexOf(listener);
                    if (index > -1) {
                        listeners.splice(index, 1);
                    }
                }
                return this;
            }
            
            emit(event: string, ...args: any[]) {
                const listeners = this.listeners.get(event);
                if (listeners) {
                    listeners.forEach(listener => {
                        try {
                            listener(...args);
                        } catch (error) {
                            console.error(`Error in event listener for ${event}:`, error);
                        }
                    });
                }
                return this;
            }
            
            removeAllListeners(event?: string) {
                if (event) {
                    this.listeners.delete(event);
                } else {
                    this.listeners.clear();
                }
                return this;
            }
        }
        
        return {
            EventEmitter,
            default: EventEmitter,
        };
    })(),
    
    'node:events': null,
    
    'stream': (() => {
        class Readable {
            read() { return null; }
            pipe() { return this; }
            on() { return this; }
            once() { return this; }
            emit() { return this; }
        }
        
        class Writable {
            write() { return true; }
            end() { return this; }
            on() { return this; }
            once() { return this; }
            emit() { return this; }
        }
        
        class Transform extends Readable {
            write() { return true; }
        }
        
        return {
            Readable,
            Writable,
            Transform,
        };
    })(),
    
    'node:stream': null,
    
    'util': {
        promisify: (fn: Function) => {
            return (...args: any[]) => {
                return new Promise((resolve, reject) => {
                    try {
                        fn(...args, (err: any, result: any) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    } catch (error) {
                        reject(error);
                    }
                });
            };
        },
        inspect: (obj: any) => JSON.stringify(obj, null, 2),
        inherits: () => {},
    },
    
    'node:util': null,
    
    'crypto': {
        createHash: () => ({
            update: () => ({ digest: () => '' }),
        }),
        randomBytes: (size: number) => new Uint8Array(size),
    },
    
    'node:crypto': null,
    
    'url': {
        URL: globalThis.URL,
        URLSearchParams: globalThis.URLSearchParams,
        parse: (url: string) => {
            try {
                return new URL(url);
            } catch {
                return null;
            }
        },
    },
    
    'node:url': null,
    
    'querystring': {
        parse: (str: string) => {
            const params = new URLSearchParams(str);
            const result: Record<string, string> = {};
            params.forEach((value, key) => {
                result[key] = value;
            });
            return result;
        },
        stringify: (obj: Record<string, any>) => {
            const params = new URLSearchParams();
            Object.entries(obj).forEach(([key, value]) => {
                params.append(key, String(value));
            });
            return params.toString();
        },
    },
    
    'node:querystring': null,
};

nodePolyfills['node:path'] = nodePolyfills['path'];
nodePolyfills['node:fs'] = nodePolyfills['fs'];
nodePolyfills['node:os'] = nodePolyfills['os'];
nodePolyfills['node:events'] = nodePolyfills['events'];
nodePolyfills['node:stream'] = nodePolyfills['stream'];
nodePolyfills['node:util'] = nodePolyfills['util'];
nodePolyfills['node:crypto'] = nodePolyfills['crypto'];
nodePolyfills['node:url'] = nodePolyfills['url'];
nodePolyfills['node:querystring'] = nodePolyfills['querystring'];

export function getNodePolyfill(moduleName: string): any {
    return nodePolyfills[moduleName] || null;
}

