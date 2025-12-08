import { appLoaderService, type AppDefinition } from './api/index';
import { html, render } from 'lit';
import './components/k-app-selector';

const app: AppDefinition = {
    id: 'dev-standard-app',
    name: 'Default App',
    version: '0.0.0',
    description: 'Default app!space application',
    extensions: [
        'system.commandpalette',
        'system.mdeditor',
        'system.monaco',
        'system.mediaviewer',
        'system.settings-tree',
        'system.memoryusage',
        'system.ai-system',
    ],
    render: () => html`<k-standard-app ?show-bottom-sidebar=${false} ?show-bottom-panel=${false}></k-standard-app>`,
};

appLoaderService.registerApp(app);

async function initializeApp() {
    const preferredAppId = await appLoaderService.getPreferredAppId();
    
    if (!preferredAppId) {
        render(html`<k-app-selector></k-app-selector>`, document.body);
        return;
    }
    
    try {
        await appLoaderService.start();
    } catch (error) {
        console.error('Failed to start app:', error);
        render(html`<k-app-selector></k-app-selector>`, document.body);
    }
}

initializeApp();

