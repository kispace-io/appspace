type TransformersModule = typeof import('@xenova/transformers');

let transformersModulePromise: Promise<TransformersModule> | null = null;
let transformersEnvConfigured = false;

export async function getTransformersModule(): Promise<TransformersModule> {
    if (!transformersModulePromise) {
        transformersModulePromise = import('@xenova/transformers');
    }
    const module = await transformersModulePromise;
    if (!transformersEnvConfigured) {
        module.env.allowRemoteModels = true;
        module.env.allowLocalModels = false;
        (module.env as any).remoteHost = 'https://huggingface.co';
        transformersEnvConfigured = true;
    }
    return module;
}

export async function setTransformersAuthToken(token: string | null): Promise<void> {
    const { env } = await getTransformersModule();
    if (token && token.trim()) {
        (env as any).useAuthToken = token.trim();
    } else {
        (env as any).useAuthToken = null;
    }
}


