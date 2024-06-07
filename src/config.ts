import * as vscode from 'vscode';

export class Config {
    public static get prefix(): string {
        const prefix = this.config.prefix;
        if (typeof prefix !== 'string') {
            throw new Error('prefix must be a string');
        }
        return prefix;
    }

    public static get staticHarnessTemplate(): string {
        const templatePath = this.config.harnessTemplate.static;
        if (typeof templatePath !== 'string') {
            throw new Error('harnessTemplate.static must be a string');
        }
        return templatePath;
    }

    public static get dynamicHarnessTemplate(): string {
        const templatePath = this.config.harnessTemplate.dynamic;
        if (typeof templatePath !== 'string') {
            throw new Error('harnessTemplate.dynamic must be a string');
        }
        return templatePath;
    }

    public static get unitTestTemplates(): ReadonlyMap<string, string> {
        const result = this.config.unitTestTemplates;
        return typeof result === 'object' ? new Map(Object.entries(result)) : new Map();
    }

    private static get config() {
        return vscode.workspace.getConfiguration('extension.angularFileCreator');
    }
}
