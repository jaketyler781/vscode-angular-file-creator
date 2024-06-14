import * as vscode from 'vscode';
import {File} from './file';
import {getNameParts, camelCase} from './naming';
import {Config} from './config';

export class Testable {
    constructor(public readonly uri: vscode.Uri) {
        this.ts = new File(uri);
        this.specUri = vscode.Uri.file(uri.fsPath.replace('.ts', '.spec.ts'));
    }

    protected readonly ts: File;
    protected readonly specUri: vscode.Uri;

    private static readonly unitTestTemplates = [
        ['@Component', 'cake/app/webroot/ts/testing/templates/foobar/foobar.component.spec.ts'],
        ['@Injectable', 'cake/app/webroot/ts/testing/templates/angularinjectable.template.spec.ts'],
        ['@LucidInjectable', 'cake/app/webroot/ts/testing/templates/lucidinjectable.template.spec.ts'],
    ];

    protected async getTestTemplate(): Promise<string> {
        const ts = await this.ts.read();
        const matches = ts.match(/export class/g) ?? [];
        if (matches.length !== 1) {
            throw new Error('File must have exactly one exported class');
        }
        for (const [decorator, templatePath] of Testable.unitTestTemplates) {
            const regex = new RegExp('(?<=' + decorator + '\\((.|\n)*\\)\nexport class )(.*?)(?=\\s)', 'gmi');
            const className = regex.exec(ts)?.[0];
            if (!className) {
                continue;
            }

            const template = new File(templatePath);
            return await template.read();
        }
        throw new Error('Could not find a matching test template');
    }

    public async createTest(): Promise<void> {
        const template = await this.getTestTemplate();
        const className = await this.getClassName();
        const test = template
            .replace(/TESTCLASS/g, className) // References
            .replace(/testclass/g, this.ts.baseName.replace(/\.ts/g, '')) // Import
            .replace(/testClass/g, camelCase(getNameParts(className), false)); // Variable name
        const spec = await File.write(this.specUri, test);
        await spec.show();
    }

    protected async getClassName(): Promise<string> {
        const ts = await this.ts.read();
        const classes = /export class (.*?)\s/gim.exec(ts);
        const className = classes?.[1];
        if (!className) {
            throw new Error(`Could not find a class in ${this.ts.baseName}`);
        }
        return className;
    }
}
