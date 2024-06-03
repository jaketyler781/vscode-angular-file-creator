'use strict';
import * as vscode from 'vscode';
import * as path from 'path';

import {doesFileExist, assertFolder} from './file';
import {getNameParts, getSelectorName, camelCase, trimClassNameParts, AngularFileType} from './naming';
import {runWithErrorLogging} from './util';
import {TextEncoder} from 'util';

const InvalidCharacterRegex = /[^\w\d_]|^\d/i;

const lessTemplate = '// TODO write style code\n';

function getHTMLTemplate(name: string[]) {
    return `<link rel="stylesheet" type="text/css" href="${getFileName(name, '.component.css')}">

<!-- TODO write template code -->
`;
}

function getComponentTemplate(name: string[]) {
    return `import {CommonModule} from '@angular/common';
import {Component, ChangeDetectionStrategy} from '@angular/core';

@Component({
    selector: '${getSelectorName(name, AngularFileType.Component)}',
    standalone: true,
    templateUrl: './${getFileName(name, '.component.html')}',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
})
export class ${getClassName(name, AngularFileType.Component)} {
    // TODO implement component
}
`;
}

function getDirectiveTemplate(name: string[]) {
    const directiveSelector = getSelectorName(name, AngularFileType.Directive);
    return `import {Directive} from '@angular/core';

@Directive({
    selector: '${directiveSelector}',
    standalone: true,
})
export class ${getClassName(name, AngularFileType.Directive)} {
    // TODO implement directive
}
`;
}

function getFolderName(nameParts: string[]): string {
    return nameParts.join('');
}

function getFileName(nameParts: string[], ext: string): string {
    return getFolderName(nameParts) + ext;
}

function getClassName(nameParts: string[], fileType: AngularFileType): string {
    switch (fileType) {
        case AngularFileType.Component:
            return camelCase(nameParts, true) + 'Component';
        case AngularFileType.Directive:
            return camelCase(nameParts, true) + 'Directive';
    }
}

async function writeFile(path: string, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path), new TextEncoder().encode(content));
}

async function createComponent(name: string[], containingFolder: string): Promise<void> {
    const componentPath = path.join(containingFolder, getFileName(name, '.component.ts'));
    const templatePath = path.join(containingFolder, getFileName(name, '.component.html'));
    const stylesheetPath = path.join(containingFolder, getFileName(name, '.component.less'));
    await Promise.all([
        writeFile(componentPath, getComponentTemplate(name)),
        writeFile(templatePath, getHTMLTemplate(name)),
        writeFile(stylesheetPath, lessTemplate),
    ]);
    const textDoc = await vscode.workspace.openTextDocument(componentPath);
    await vscode.window.showTextDocument(textDoc);
}

async function createDirective(name: string[], inFolder: string): Promise<void> {
    const directivePath = path.join(inFolder, getFileName(name, '.directive.ts'));

    if (await doesFileExist(directivePath)) {
        throw new Error(`File with name ${directivePath} already exists`);
    }
    await writeFile(directivePath, getDirectiveTemplate(name));
    const textDoc = await vscode.workspace.openTextDocument(directivePath);
    await vscode.window.showTextDocument(textDoc);
}

async function promptUserForClassName({
    defaultName,
    prompt,
    exampleName,
}: {
    defaultName: string;
    prompt: string;
    exampleName: string;
}): Promise<string> {
    const result = await vscode.window.showInputBox({
        prompt: prompt,
        value: defaultName,
        validateInput: (currentName) => {
            if (!currentName) {
                return 'Name is required';
            } else if (InvalidCharacterRegex.test(currentName)) {
                return 'Name should be valid javascript token with letter numbers and underscores and no spaces';
            } else if (currentName[0].toUpperCase() != currentName[0]) {
                return 'Name should be upper camel case eg ' + exampleName;
            } else {
                return undefined; // The user provided a valid name
            }
        },
    });
    if (!result) {
        throw new Error('Name should be a valid upper camel case javascript token');
    }
    return result;
}

async function runCreateComponentCommand(uri: vscode.Uri): Promise<void> {
    await assertFolder(uri);
    const componentName = await promptUserForClassName({
        defaultName: 'NewComponent',
        prompt: 'Name of component class',
        exampleName: 'TestComponent FooBarComponent',
    });
    const name = trimClassNameParts(getNameParts(componentName), AngularFileType.Component);
    const componentFolder = path.join(uri.fsPath, getFolderName(name));
    if (await doesFileExist(componentFolder)) {
        throw new Error('Folder with name ' + componentFolder + ' already exists');
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(componentFolder));
    await createComponent(name, componentFolder);
}

async function runCreateDirectiveCommand(uri: vscode.Uri): Promise<void> {
    await assertFolder(uri);
    const directiveName = await promptUserForClassName({
        defaultName: 'NewDirective',
        prompt: 'Name of directive class',
        exampleName: 'TestDirective, FooBarDirective',
    });
    const name = getNameParts(directiveName);
    if (name[name.length - 1] === 'directive') {
        name.pop();
    }

    await createDirective(name, uri.fsPath);
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-component',
        (uri: vscode.Uri) => runWithErrorLogging(() => runCreateComponentCommand(uri)),
    );
    context.subscriptions.push(createComponentListener);

    const createDirectiveListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-directive',
        (uri: vscode.Uri) => runWithErrorLogging(() => runCreateDirectiveCommand(uri)),
    );
    context.subscriptions.push(createDirectiveListener);
}
