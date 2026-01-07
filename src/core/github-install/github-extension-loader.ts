import { createLogger } from "../logger";
import { GitHubUrlParser, ParsedGitHubUrl } from "./github-url-parser";

const logger = createLogger('GitHubExtensionLoader');

const ESM_SH_BASE = 'https://esm.sh';
const GITHUB_API_BASE = 'https://api.github.com';

export interface ExtensionEntryPoint {
    path: string;
    isTypeScript: boolean;
    cdnUrl: string;
}

export class GitHubExtensionLoader {
    private static readonly ENTRY_POINTS = [
        'index.ts',
        'index.tsx',
        'extension.ts',
        'extension.tsx',
        'index.js',
        'extension.js',
        'main.js',
    ];

    static toEsmShUrl(parsed: ParsedGitHubUrl, path: string): string {
        const ref = parsed.ref || 'main';
        const fullPath = path.startsWith('/') ? path.substring(1) : path;
        return `${ESM_SH_BASE}/gh/${parsed.owner}/${parsed.repo}@${ref}/${fullPath}`;
    }

    static async discoverEntryPoint(parsed: ParsedGitHubUrl): Promise<ExtensionEntryPoint> {
        const ref = parsed.ref || 'main';

        if (parsed.path) {
            const isTypeScript = parsed.path.endsWith('.ts') || parsed.path.endsWith('.tsx');
            const cdnUrl = this.toEsmShUrl(parsed, parsed.path);
            return {
                path: parsed.path,
                isTypeScript,
                cdnUrl,
            };
        }

        try {
            const packageJson = await this.fetchPackageJson(parsed);
            if (packageJson?.main) {
                const mainPath = packageJson.main;
                const isTypeScript = mainPath.endsWith('.ts') || mainPath.endsWith('.tsx');
                const cdnUrl = this.toEsmShUrl(parsed, mainPath);
                logger.debug(`Found entry point from package.json: ${mainPath}`);
                return {
                    path: mainPath,
                    isTypeScript,
                    cdnUrl,
                };
            }
        } catch (error) {
            logger.debug(`Could not fetch package.json: ${error}`);
        }

        for (const entryPoint of this.ENTRY_POINTS) {
            try {
                const testUrl = this.toEsmShUrl(parsed, entryPoint);
                const response = await fetch(testUrl, { method: 'HEAD' });
                if (response.ok) {
                    const isTypeScript = entryPoint.endsWith('.ts') || entryPoint.endsWith('.tsx');
                    logger.debug(`Found entry point: ${entryPoint}`);
                    return {
                        path: entryPoint,
                        isTypeScript,
                        cdnUrl: testUrl,
                    };
                }
            } catch (error) {
                logger.debug(`Entry point ${entryPoint} not found: ${error}`);
            }
        }

        throw new Error(
            `Could not discover entry point for ${parsed.owner}/${parsed.repo}@${ref}. ` +
            `Tried: ${this.ENTRY_POINTS.join(', ')} and package.json main field.`
        );
    }

    private static async fetchPackageJson(parsed: ParsedGitHubUrl): Promise<{ main?: string } | null> {
        const ref = parsed.ref || 'main';
        const apiUrl = `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contents/package.json?ref=${ref}`;

        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            if (data.content && data.encoding === 'base64') {
                const content = atob(data.content);
                return JSON.parse(content);
            }

            return null;
        } catch (error) {
            logger.debug(`Failed to fetch package.json from GitHub API: ${error}`);
            return null;
        }
    }

    static async resolveExtensionUrl(githubUrl: string): Promise<string> {
        const parsed = GitHubUrlParser.parse(githubUrl);
        const entryPoint = await this.discoverEntryPoint(parsed);
        logger.info(`Resolved GitHub extension URL: ${githubUrl} -> ${entryPoint.cdnUrl}`);
        return entryPoint.cdnUrl;
    }

    static isGitHubUrl(url: string): boolean {
        return GitHubUrlParser.isValid(url);
    }
}
