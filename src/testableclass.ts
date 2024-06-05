import * as vscode from 'vscode';
import {TextDecoder} from 'util';
import {readFile} from './file';

/** A representation of a TypeScript class that can have a unit test generated for it. */
export class TestableClass {
    public readonly standalone: boolean = this.fileContents.includes('standalone: true');

    private constructor(
        public readonly filePath: string,
        public readonly fileContents: string,
        public readonly decorator: string,
        public readonly className: string,
        public readonly testTemplate: string,
    ) {}

    public static async create(filePath: string): Promise<TestableClass | undefined> {
        const fileBytes = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const fileContents: string = new TextDecoder().decode(fileBytes);
        const regexToTemplatesMap = getUnitTestTemplates();
        for (const [decorator, fileTemplateUri] of regexToTemplatesMap.entries()) {
            const regex = new RegExp('(?<=' + decorator + '\\((.|\n)*\\)\nexport class )(.*?)(?=\\s)', 'gmi');
            const className = regex.exec(fileContents)?.[0];
            if (className) {
                const testTemplate = await readFile(fileTemplateUri);
                if (testTemplate) {
                    return new TestableClass(filePath, fileContents, decorator, className, testTemplate);
                }
            }
        }
        return undefined;
    }
}

function getUnitTestTemplates(): ReadonlyMap<string, string> {
    const result = vscode.workspace.getConfiguration('extension.angularFileCreator').unitTestTemplates;
    return typeof result === 'object' ? new Map(Object.entries(result)) : new Map();
}
