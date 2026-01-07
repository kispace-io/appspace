import { createLogger } from "../logger";

const logger = createLogger('GitHubUrlParser');

export interface ParsedGitHubUrl {
    owner: string;
    repo: string;
    ref?: string;
    path?: string;
}

export class GitHubUrlParser {
    private static readonly GITHUB_URL_PATTERNS = [
        /^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/([^\/]+))?(?:\/(.+))?$/,
        /^https?:\/\/(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)(?:\/(.+))?$/,
    ];

    private static readonly SHORT_FORMAT_PATTERN = /^([^\/@]+)\/([^\/@]+)(?:@([^\/]+))?(?:\/(.+))?$/;

    static parse(url: string): ParsedGitHubUrl {
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid GitHub URL: URL must be a non-empty string');
        }

        const trimmed = url.trim();

        for (const pattern of this.GITHUB_URL_PATTERNS) {
            const match = trimmed.match(pattern);
            if (match) {
                const owner = match[1];
                const repo = match[2].replace(/\.git$/, '');
                const ref = match[3] || match[4]?.split('/')[0] || undefined;
                const path = match[4]?.includes('/') ? match[4].substring(match[4].indexOf('/') + 1) : undefined;

                if (owner && repo) {
                    logger.debug(`Parsed GitHub URL: ${trimmed} -> owner=${owner}, repo=${repo}, ref=${ref || 'default'}, path=${path || 'none'}`);
                    return { owner, repo, ref, path };
                }
            }
        }

        const shortMatch = trimmed.match(this.SHORT_FORMAT_PATTERN);
        if (shortMatch) {
            const owner = shortMatch[1];
            const repo = shortMatch[2].replace(/\.git$/, '');
            const ref = shortMatch[3];
            const path = shortMatch[4];

            if (owner && repo) {
                logger.debug(`Parsed short GitHub URL: ${trimmed} -> owner=${owner}, repo=${repo}, ref=${ref || 'default'}, path=${path || 'none'}`);
                return { owner, repo, ref, path };
            }
        }

        throw new Error(`Invalid GitHub URL format: ${url}. Expected formats: owner/repo, owner/repo@ref, owner/repo@ref/path, or https://github.com/owner/repo`);
    }

    static isValid(url: string): boolean {
        try {
            this.parse(url);
            return true;
        } catch {
            return false;
        }
    }

    static toGitHubUrl(parsed: ParsedGitHubUrl): string {
        const base = `https://github.com/${parsed.owner}/${parsed.repo}`;
        if (parsed.ref) {
            return `${base}/tree/${parsed.ref}${parsed.path ? `/${parsed.path}` : ''}`;
        }
        return `${base}${parsed.path ? `/${parsed.path}` : ''}`;
    }
}
