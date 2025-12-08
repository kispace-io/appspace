import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { KElement } from "../parts/k-element";
import { appLoaderService, type AppDefinition } from "../core/apploader";

@customElement('k-app-selector')
export class KAppSelector extends KElement {
    @state()
    private apps: AppDefinition[] = [];
    
    @state()
    private loading = true;
    
    @state()
    private error: string | null = null;

    protected async doBeforeUI() {
        await this.loadApps();
    }

    private async loadApps() {
        try {
            this.loading = true;
            this.apps = appLoaderService.getRegisteredApps();
            this.loading = false;
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to load apps';
            this.loading = false;
        }
    }

    private async selectApp(app: AppDefinition) {
        try {
            await appLoaderService.setPreferredAppId(app.id);
            await appLoaderService.loadApp(app.id, document.body);
        } catch (err) {
            this.error = err instanceof Error ? err.message : 'Failed to load app';
        }
    }

    protected render() {
        if (this.loading) {
            return html`
                <div class="selector-container">
                    <wa-spinner></wa-spinner>
                    <p>Loading available apps...</p>
                </div>
            `;
        }

        if (this.error) {
            return html`
                <div class="selector-container">
                    <wa-icon name="triangle-exclamation" class="error-icon"></wa-icon>
                    <p class="error-message">${this.error}</p>
                    <wa-button @click=${() => this.loadApps()}>Retry</wa-button>
                </div>
            `;
        }

        if (this.apps.length === 0) {
            return html`
                <div class="selector-container">
                    <wa-icon name="folder-open" class="empty-icon"></wa-icon>
                    <h2>No Apps Available</h2>
                    <p>No applications are currently registered.</p>
                </div>
            `;
        }

        return html`
            <div class="selector-container">
                <div class="header">
                    <h1>Select an Application</h1>
                    <p>Choose an application to load</p>
                </div>
                
                <div class="app-list">
                    ${this.apps.map(app => html`
                        <div 
                            class="app-card" 
                            @click=${() => this.selectApp(app)}
                            @keydown=${(e: KeyboardEvent) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    this.selectApp(app);
                                }
                            }}
                            tabindex="0"
                            role="button">
                            <div class="app-header">
                                <h3 class="app-name">${app.name}</h3>
                                ${app.version ? html`<span class="app-version">v${app.version}</span>` : ''}
                            </div>
                            ${app.description ? html`<p class="app-description">${app.description}</p>` : ''}
                            <div class="app-id">ID: ${app.id}</div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }

    static styles = css`
        :host {
            display: flex;
            flex-direction: column;
            width: 100%;
            height: 100vh;
            align-items: center;
            justify-content: center;
            background: var(--wa-color-neutral-background-base);
        }

        .selector-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            max-width: 800px;
            width: 100%;
            padding: 2rem;
            box-sizing: border-box;
        }

        .header {
            text-align: center;
            margin-bottom: 2rem;
        }

        .header h1 {
            margin: 0 0 0.5rem 0;
            font-size: 2rem;
            font-weight: 600;
            color: var(--wa-color-neutral-foreground-loud);
        }

        .header p {
            margin: 0;
            color: var(--wa-color-neutral-foreground-quiet);
        }

        .app-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
            width: 100%;
        }

        .app-card {
            display: flex;
            flex-direction: column;
            padding: 1.5rem;
            border: 1px solid var(--wa-color-neutral-border-loud);
            border-radius: var(--wa-border-radius-medium);
            background: var(--wa-color-neutral-background-base);
            cursor: pointer;
            transition: all 0.2s ease;
            box-sizing: border-box;
        }

        .app-card:hover {
            border-color: var(--wa-color-brand-border-loud);
            background: var(--wa-color-brand-fill-quiet);
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .app-card:focus {
            outline: 2px solid var(--wa-color-brand-border-loud);
            outline-offset: 2px;
        }

        .app-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.75rem;
        }

        .app-name {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--wa-color-neutral-foreground-loud);
            flex: 1;
        }

        .app-version {
            font-size: 0.875rem;
            color: var(--wa-color-neutral-foreground-quiet);
            padding: 0.25rem 0.5rem;
            background: var(--wa-color-neutral-fill-quiet);
            border-radius: var(--wa-border-radius-small);
        }

        .app-description {
            margin: 0 0 0.75rem 0;
            color: var(--wa-color-neutral-foreground-base);
            line-height: 1.5;
        }

        .app-id {
            font-size: 0.75rem;
            color: var(--wa-color-neutral-foreground-quiet);
            font-family: monospace;
            margin-top: auto;
        }

        .empty-icon,
        .error-icon {
            font-size: 4rem;
            color: var(--wa-color-neutral-foreground-quiet);
            margin-bottom: 1rem;
        }

        .error-message {
            color: var(--wa-color-danger-foreground-loud);
            margin-bottom: 1rem;
        }

        wa-spinner {
            margin-bottom: 1rem;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'k-app-selector': KAppSelector;
    }
}

