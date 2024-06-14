import * as vscode from 'vscode';

export class Config {
    public static get prefix(): string {
        const prefix = this.config.prefix;
        if (typeof prefix !== 'string') {
            throw new Error('prefix must be a string');
        }
        return prefix;
    }

    private static get config() {
        return vscode.workspace.getConfiguration('extension.angularFileCreator');
    }
}
