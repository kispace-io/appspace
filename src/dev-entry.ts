import { appLoaderService, type AppDefinition } from './api/index';
import { html } from 'lit';

const app: AppDefinition = {
    id: 'dev-standard-app',
    name: 'Development Standard App',
    version: '0.0.0',
    description: 'Dummy entry point for running the standard app during development',
    extensions: [
        'system.commandpalette',
        'system.mdeditor',
        'system.monaco',
        'system.mediaviewer',
        'system.settings-tree',
        'system.memoryusage',
        'system.ai-system',
    ],
    render: () => html`<k-standard-app></k-standard-app>`,
};

appLoaderService.registerApp(app, {
    autoStart: true,
});

