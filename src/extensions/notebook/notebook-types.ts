export interface NotebookCell {
    cell_type: 'code' | 'markdown' | 'raw';
    source: string | string[];
    outputs?: any[];
    execution_count?: number | null;
    metadata?: any;
}

export interface NotebookData {
    cells: NotebookCell[];
    metadata?: {
        required_packages?: string[];
        [key: string]: any;
    };
    nbformat?: number;
    nbformat_minor?: number;
}

export interface NotebookEditorLike {
    notebook?: NotebookData;
    focusedCellIndex: number;
    executeCell(index: number): Promise<void>;
}

export function isNotebookEditorLike(value: unknown): value is NotebookEditorLike {
    return Boolean(
        value &&
        typeof (value as NotebookEditorLike).executeCell === 'function' &&
        typeof (value as NotebookEditorLike).focusedCellIndex === 'number'
    );
}


