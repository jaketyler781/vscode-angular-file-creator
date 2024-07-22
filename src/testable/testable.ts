import * as vscode from 'vscode';
import {File} from '../file';
import * as typescript from 'typescript';

export class Testable {
    constructor(uri: vscode.Uri) {
        this.ts = new File(uri);
        this.specUri = vscode.Uri.file(uri.fsPath.replace('.ts', '.spec.ts'));
        this.classDeclaration = this.ts.read().then((ts) => {
            const sourceFile = typescript.createSourceFile(
                this.ts.uri.fsPath,
                ts,
                typescript.ScriptTarget.Latest,
                true,
            );
            const classDeclarations = sourceFile.statements.filter(
                (statement): statement is typescript.ClassDeclaration =>
                    statement.kind === typescript.SyntaxKind.ClassDeclaration,
            );
            if (!classDeclarations[0]) {
                throw new Error(`Could not find a class in ${this.ts.baseName}`);
            }
            const fileBaseName = this.ts.baseName.substring(0, this.ts.baseName.indexOf('.ts')).toLowerCase();
            const matchingClassDeclaration = classDeclarations.find(
                (classDeclaration) => classDeclaration.name?.getText().toLowerCase() === fileBaseName,
            );
            const classDeclaration = matchingClassDeclaration ?? classDeclarations[0];
            if (classDeclarations.length > 1) {
                const className = classDeclaration.name?.getText() ?? 'export default class { ... }';
                vscode.window.showWarningMessage(
                    matchingClassDeclaration
                        ? `Multiple classes were found in ${this.ts.baseName}. Only the one matching the file name (${className}) will have a test generated for it.`
                        : `Multiple classes were found in ${this.ts.baseName}. Only the first one (${className}) will have a test generated for it.`,
                );
            }
            return matchingClassDeclaration ?? classDeclarations[0];
        });
    }

    protected readonly ts: File;
    protected readonly specUri: vscode.Uri;
    private readonly classDeclaration: Promise<typescript.ClassDeclaration>;

    private async getTestTemplate(): Promise<string> {
        const classDeclaration = await this.classDeclaration;
        const constructorDeclaration = classDeclaration.members.find(
            (member): member is typescript.ConstructorDeclaration => member.kind === typescript.SyntaxKind.Constructor,
        );

        const usesLucidInject = (parameter: typescript.Node): boolean =>
            parameter.getFullText().match(/lucidInject/) !== null;

        const templateFile = new File(
            usesLucidInject(classDeclaration)
                ? !constructorDeclaration || constructorDeclaration.parameters.every(usesLucidInject)
                    ? 'cake/app/webroot/ts/testing/templates/singleton.template.spec.ts'
                    : 'cake/app/webroot/ts/testing/templates/injectorcontext.template.spec.ts'
                : 'cake/app/webroot/ts/testing/templates/basic.template.spec.ts',
        );
        const template = await templateFile.read();
        const parameters =
            constructorDeclaration?.parameters.map((parameter) => parameter.name.getText()).join(',') ?? '';
        return template.replace(/new FooBar\(\)/, `new FooBar(${parameters})`);
    }

    public async createTest(): Promise<void> {
        const template = await this.getTestTemplate();
        const classDeclaration = await this.classDeclaration;
        const className = classDeclaration.name?.getText() ?? 'export default class { ... }';
        const test = template
            .replace(/FooBar/g, className) // References
            .replace(/foobar/g, this.ts.baseName.replace(/\.ts/g, '')) // Import
            .replace(/fooBar/g, className.charAt(0).toLowerCase() + className.slice(1)); // Variable name
        const spec = await File.write(this.specUri, test);
        await spec.format();
        await spec.show();
    }
}
