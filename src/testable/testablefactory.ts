import * as vscode from 'vscode';
import {File} from '../file';
import {Component} from './component';
import {ModuleOwnedComponent} from './moduleownedcomponent';
import {StandaloneComponent} from './standalonecomponent';
import {Testable} from './testable';

export class TestableFactory {
    public static async get(uri: vscode.Uri): Promise<Testable> {
        return uri.fsPath.endsWith('.component.ts') ? await this.getComponentTestable(uri) : new Testable(uri);
    }

    public static async getComponentTestable(uri: vscode.Uri): Promise<Component> {
        const componentExtensionIndex = uri.fsPath.indexOf('.component.');
        if (componentExtensionIndex === -1) {
            throw new Error('Must select a *.component.* file');
        }
        const tsUri = vscode.Uri.file(uri.fsPath.substring(0, componentExtensionIndex) + '.component.ts');
        const ts = new File(tsUri);
        const tsCode = await ts.read();
        return tsCode.includes('standalone: true') ? new StandaloneComponent(tsUri) : new ModuleOwnedComponent(tsUri);
    }
}
