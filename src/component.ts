import * as path from 'path';
import * as vscode from 'vscode';
import {Config} from './config';
import {File} from './file';
import {Testable} from './testable';

export abstract class Component extends Testable {
    constructor(uri: vscode.Uri) {
        super(uri);
        this.harnessUri = vscode.Uri.file(uri.fsPath.replace('.ts', '.test.ts'));
    }

    protected readonly harnessUri: vscode.Uri;
    protected readonly templateSelectorRegex = new RegExp(`${Config.prefix}-foo-bar`, 'g');

    public override async createTest(): Promise<void> {
        const alreadyHasTest = await File.exists(this.specUri);
        if (alreadyHasTest) {
            throw new Error(`${path.basename(this.specUri.fsPath)} already exists`);
        }

        const alreadyHasHarness = await File.exists(this.harnessUri);
        if (!alreadyHasHarness) {
            await this.createHarness();
        }

        const test = await this.getComponentTest();
        const spec = await File.write(this.specUri, test);
        await spec.show();
    }

    protected abstract getComponentTest(): Promise<string>;

    public async createHarness(): Promise<void> {
        const harnessUri = vscode.Uri.file(this.ts.uri.fsPath.replace('.component.ts', '.component.test.ts'));
        const alreadyHasHarness = await File.exists(harnessUri.fsPath);
        if (alreadyHasHarness) {
            throw new Error(`A file with the name ${harnessUri.fsPath} already exists`);
        }

        const selector = await this.getSelector();
        const name = await this.getComponentName();

        const harnessTemplateFile = new File('cake/app/webroot/ts/testing/templates/foobar/foobar.component.test.ts');
        const harnessTemplate = await harnessTemplateFile.read();
        const harness = harnessTemplate.replace(this.templateSelectorRegex, selector).replace(/FooBar/g, name);
        const harnessFile = await File.write(harnessUri, harness);
        await harnessFile.show();
    }

    protected async getSelector(): Promise<string> {
        const ts = await this.ts.read();
        const selector = ts.match(/(?<=selector: ('|")).*(?=('|"))/gim)?.[0];
        if (!selector) {
            throw new Error(`Could not find a selector in the TypeScript file`);
        }
        return selector;
    }

    protected async getComponentName(): Promise<string> {
        const className = await this.getClassName();
        return className.replace('Component', '');
    }
}
