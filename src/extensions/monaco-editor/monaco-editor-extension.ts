import {html} from "lit";
import {EditorInput, editorRegistry} from "../../core/editorregistry";
import {File} from "../../core/filesys";
import {contributionRegistry} from "../../core/contributionregistry";
import {CID_PROMPT_ENHANCERS, type PromptEnhancer, type PromptEnhancerContribution} from "../ai-system";
import type {ExecutionContext} from "../../core/commandregistry";
import PYTHON_PROMPT from "./py-programming-prompt.txt?raw";
import JAVASCRIPT_PROMPT from "./js-programming-prompt.txt?raw";

editorRegistry.registerEditorInputHandler({
    lazyInit: async () => {
        await import('./k-monaco-editor');
    },
    canHandle: input => input instanceof File,
    handle: async (input: File) => {
        const editorInput = {
            title: input.getName(),
            data: input,
            key: input.getName(),
            editorId: "monaco-editor",
            icon: "file-pen",
            noOverflow: false,
            state: {},
        } as EditorInput
        editorInput.widgetFactory = () => html`
            <k-monaco-editor .input=${editorInput}></k-monaco-editor>`
        return editorInput;
    }
})

// Helper to check if active editor is a Monaco editor with specific language
function isMonacoEditorWithLanguage(context: ExecutionContext, language: string): boolean {
    const activeEditor = context.activeEditor as any;
    return activeEditor &&
        typeof activeEditor.getEditor === 'function' &&
        typeof activeEditor.getLanguage === 'function' &&
        activeEditor.getLanguage() === language;
}

// Python programming prompt enhancer
const pythonPromptEnhancer: PromptEnhancer = {
    priority: 50,
    enhance: async (prompt: string, context: ExecutionContext) => {
        if (!isMonacoEditorWithLanguage(context, 'python')) {
            return prompt;
        }
        return `${prompt}\n\n${PYTHON_PROMPT}`;
    }
};

// JavaScript programming prompt enhancer
const javascriptPromptEnhancer: PromptEnhancer = {
    priority: 50,
    enhance: async (prompt: string, context: ExecutionContext) => {
        if (!isMonacoEditorWithLanguage(context, 'javascript')) {
            return prompt;
        }
        return `${prompt}\n\n${JAVASCRIPT_PROMPT}`;
    }
};

// Register prompt enhancers for programming languages
contributionRegistry.registerContribution(CID_PROMPT_ENHANCERS, {
    label: "Python Programming Enhancer",
    enhancer: pythonPromptEnhancer
} as PromptEnhancerContribution);

contributionRegistry.registerContribution(CID_PROMPT_ENHANCERS, {
    label: "JavaScript Programming Enhancer",
    enhancer: javascriptPromptEnhancer
} as PromptEnhancerContribution);

