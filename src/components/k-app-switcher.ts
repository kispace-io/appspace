import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { KElement } from "../parts/k-element";
import { appLoaderService, type AppDefinition } from "../core/apploader";
import { contributionRegistry } from "../core/contributionregistry";
import { CLOSE_BUTTON, DIALOG_CONTRIBUTION_TARGET, dialogService } from "../core/dialogservice";

const APP_SWITCHER_DIALOG_ID = 'app-switcher';

contributionRegistry.registerContribution(DIALOG_CONTRIBUTION_TARGET, {
    id: APP_SWITCHER_DIALOG_ID,
    label: "Switch Application",
    buttons: [CLOSE_BUTTON],
    component: (state?: any) => {
        const apps: AppDefinition[] = state?.apps || [];
        const currentAppId: string | undefined = state?.currentAppId;
        const selectApp = state?.selectApp as (app: AppDefinition) => void;

        return html`
            <style>
                .app-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding: 1rem;
                    min-width: 300px;
                    max-height: 400px;
                    overflow-y: auto;
                }
                
                .app-item {
                    display: flex;
                    flex-direction: column;
                    padding: 0.75rem;
                    border-radius: var(--wa-border-radius-small);
                    cursor: pointer;
                    transition: background-color 0.2s;
                    border: 1px solid transparent;
                }
                
                .app-item:hover {
                    background-color: var(--wa-color-neutral-fill-quiet);
                    border-color: var(--wa-color-brand-border-loud);
                }
                
                .app-item.active {
                    background-color: var(--wa-color-brand-fill-quiet);
                    border-color: var(--wa-color-brand-border-loud);
                    font-weight: 600;
                }
                
                .app-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 0.25rem;
                }
                
                .app-name {
                    font-weight: 600;
                    color: var(--wa-color-neutral-foreground-loud);
                }
                
                .app-version {
                    font-size: 0.75rem;
                    color: var(--wa-color-neutral-foreground-quiet);
                    padding: 0.125rem 0.375rem;
                    background: var(--wa-color-neutral-fill-loud);
                    border-radius: var(--wa-border-radius-small);
                }
                
                .app-description {
                    font-size: 0.875rem;
                    color: var(--wa-color-neutral-foreground-base);
                    margin: 0;
                    line-height: 1.4;
                }
                
                .app-id {
                    font-size: 0.75rem;
                    color: var(--wa-color-neutral-foreground-quiet);
                    font-family: monospace;
                    margin-top: 0.25rem;
                }
            </style>
            
            <div class="app-list">
                ${apps.map(app => html`
                    <div 
                        class="app-item ${app.id === currentAppId ? 'active' : ''}"
                        @click=${() => selectApp(app)}>
                        <div class="app-header">
                            <span class="app-name">${app.name}</span>
                            ${app.version ? html`<span class="app-version">v${app.version}</span>` : ''}
                        </div>
                        ${app.description ? html`<p class="app-description">${app.description}</p>` : ''}
                        <div class="app-id">ID: ${app.id}</div>
                    </div>
                `)}
            </div>
        `;
    },
    onButton: async () => true,
});

const showAppSwitcherDialog = async (): Promise<void> => {
    const apps = appLoaderService.getRegisteredApps();
    const currentApp = appLoaderService.getCurrentApp();

    if (apps.length === 0) {
        return;
    }

    const state = {
        apps,
        currentAppId: currentApp?.id,
        selectApp: async (app: AppDefinition) => {
            if (app.id === currentApp?.id) {
                state.close?.();
                return;
            }

            try {
                await appLoaderService.setPreferredAppId(app.id);
                await appLoaderService.loadApp(app.id, document.body);
            } catch (error) {
                console.error('Failed to switch app:', error);
            } finally {
                state.close?.();
            }
        },
        close: undefined as (() => void) | undefined,
    };

    await dialogService.open(APP_SWITCHER_DIALOG_ID, state);
};

@customElement('k-app-switcher')
export class KAppSwitcher extends KElement {
    @state()
    private currentApp: AppDefinition | undefined;

    protected doBeforeUI() {
        this.currentApp = appLoaderService.getCurrentApp();
        
        const updateCurrentApp = () => {
            this.currentApp = appLoaderService.getCurrentApp();
            this.requestUpdate();
        };
        
        window.addEventListener('app-loaded', updateCurrentApp);
        
        return () => {
            window.removeEventListener('app-loaded', updateCurrentApp);
        };
    }

    protected render() {
        const apps = appLoaderService.getRegisteredApps();
        const appName = this.currentApp?.name || 'No App';
        
        if (apps.length <= 1) {
            return html``;
        }
        
        return html`
            <wa-button 
                appearance="plain" 
                size="small"
                title="Current app: ${appName}. Click to switch applications."
                @click=${() => showAppSwitcherDialog()}>
                <wa-icon name="grip" style="margin-right: 0.5rem;"></wa-icon>
                ${appName}
            </wa-button>
        `;
    }

    static styles = css`
        :host {
            display: inline-block;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'k-app-switcher': KAppSwitcher;
    }
}

