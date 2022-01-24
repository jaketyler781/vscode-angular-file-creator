'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {writeFile, findModules, makeFolder} from './file';
import {ModuleModifier} from './modulemodifier';
import {getNameParts, getComponentNameParts, getSelectorName, getPrefix, camelCase, getModuleClassName} from './naming';

const InvalidCharacterRegex = /[^\w\d_]|^\d/i;

enum FileType {
    Component,
    Directive,
}

function getLessTemplate(name: string[]) {
    return `
// TODO write style code
`;
}

function getHTMLTemplate(name: string[]) {
    return `<link rel="stylesheet" type="text/css" href="${getFileName(name, '.component.css')}">

<!-- TODO write template code -->
`;
}

function getComponentTemplate(prefix: string[], name: string[]) {
    return `import {Component, ChangeDetectionStrategy} from '@angular/core';

@Component({
    moduleId: module.id,
    selector: '${getSelectorName(prefix, name)}',
    templateUrl: './${getFileName(name, '.component.html')}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${getClassName(name)} {
    // TODO implement component
}
`;
}

function getModuleTemplate(prefix: string[], name: string[]) {
    return `import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

@NgModule({
    declarations: [
    ],
    entryComponents: [
    ],
    exports: [
    ],
    imports: [
        CommonModule,
    ],
})
export class ${getModuleClassName(prefix, name)} {};
`;
}

function getDirectiveTemplate(prefix: string[], name: string[]) {
    return `import {Directive} from '@angular/core';

@Directive({
    moduleId: module.id,
    selector: '${getDirectiveSelectorName(prefix, name)}',
})
export class ${getDirectiveClassName(name)} {
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

function getModuleName(nameParts: string[]): string {
    return getFolderName(nameParts) + '.module.ts';
}

function getClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Component';
}

function getDirectiveSelectorName(prefix: string[], nameParts: string[]): string {
    return camelCase(prefix.concat(nameParts), false);
}

function getDirectiveClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Directive';
}

async function createModule(prefix: string[], name: string[], inFolder: string): Promise<void> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (fs.existsSync(containingFolder)) {
        throw new Error('File or folder with name ' + containingFolder + ' already exists');
    }
    const modulePath = path.join(containingFolder, getModuleName(name));
    await makeFolder(containingFolder);
    await writeFile(modulePath, getModuleTemplate(prefix, name));
    const textDoc = await vscode.workspace.openTextDocument(modulePath);
    await vscode.window.showTextDocument(textDoc);
}

async function createComponent(prefix: string[], name: string[], inFolder: string): Promise<void> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (fs.existsSync(containingFolder)) {
        throw new Error('File or folder with name ' + containingFolder + ' already exists');
    }
    await makeFolder(containingFolder);
    const componentPath = path.join(containingFolder, getFileName(name, '.component.ts'));
    const templatePath = path.join(containingFolder, getFileName(name, '.component.html'));
    const stylesheetPath = path.join(containingFolder, getFileName(name, '.component.less'));
    await Promise.all([
        writeFile(componentPath, getComponentTemplate(prefix, name)),
        writeFile(templatePath, getHTMLTemplate(name)),
        writeFile(stylesheetPath, getLessTemplate(name)),
    ]);
    const textDoc = await vscode.workspace.openTextDocument(componentPath);
    await vscode.window.showTextDocument(textDoc);
}

async function createDirective(prefix: string[], name: string[], inFolder: string): Promise<void> {
    const directivePath = path.join(inFolder, getFileName(name, '.directive.ts'));

    if (fs.existsSync(directivePath)) {
        throw new Error(`File with name ${directivePath} already exists`);
    }
    await writeFile(directivePath, getDirectiveTemplate(prefix, name));
    const textDoc = await vscode.workspace.openTextDocument(directivePath);
    await vscode.window.showTextDocument(textDoc);
}

async function addToModule(moduleUri: string, name: string[], inFolder: string, fileType: FileType): Promise<void> {
    const module = new ModuleModifier(moduleUri);
    const containingFolder = path.join(inFolder, getFolderName(name));
    const extension = fileType === FileType.Component ? '.component' : '.directive';
    const className = fileType === FileType.Component ? getClassName(name) : getDirectiveClassName(name);

    const result = await module.addImport(
        [className],
        path.join(containingFolder, getFileName(name, extension)),
        extension,
    );

    if (!result) {
        vscode.window.showWarningMessage('Could not add import to module');
    }

    const declarationAdd = await module.addToModule('declarations', className);

    if (!declarationAdd) {
        vscode.window.showWarningMessage('Could not add class to declarations');
    }

    const exportsAdd = await module.addToModule('exports', className);

    if (!exportsAdd) {
        vscode.window.showWarningMessage('Could not add class to exports');
    }
}

function checkAddToModule(modules: string[], name: string[], inFolder: string, fileType: FileType): Promise<void> {
    const relativeModules = modules.map((mod) => path.relative(inFolder, mod));
    relativeModules.push('Do not add to a module');
    return Promise.resolve(
        vscode.window
            .showQuickPick(relativeModules, {
                placeHolder: 'Add to module',
            })
            .then((selectResult) => {
                if (!selectResult) {
                    return;
                }
                const moduleIndex = relativeModules.indexOf(selectResult);

                if (moduleIndex >= 0 && moduleIndex < modules.length) {
                    return addToModule(modules[moduleIndex], name, inFolder, fileType);
                }
            }),
    );
}

async function getNameOfObject(defaultName: string, prompt: string, exampleName: string): Promise<string> {
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
    if (!uri.fsPath) {
        vscode.window.showErrorMessage('No folder selected to contain new component');
        return;
    }

    try {
        const componentName = await getNameOfObject(
            'NewComponent',
            'Name of component class',
            'TestComponent FooBarComponent',
        );
        const name = getComponentNameParts(componentName);
        const prefix = getPrefix();
        await createComponent(prefix, name, uri.fsPath);
        const modules = await findModules(uri.fsPath);
        if (modules.length) {
            await checkAddToModule(modules, name, uri.fsPath, FileType.Component);
        }
    } catch (err) {
        vscode.window.showErrorMessage(err.toString());
        console.error(err);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-component',
        (uri: vscode.Uri) => runCreateComponentCommand(uri),
    );
    context.subscriptions.push(createComponentListener);

    const createDirectiveListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-directive',
        (uri: vscode.Uri) => {
            if (!uri.fsPath) {
                vscode.window.showErrorMessage('No folder selected to contain new directive');
                return;
            }

            const prefix = getPrefix();

            getNameOfObject('NewDirective', 'Name of directive class', 'TestDirective, FooBarDirective')
                .then((directiveName) => {
                    const name = getNameParts(directiveName);

                    if (name[name.length - 1] === 'directive') {
                        name.pop();
                    }

                    return createDirective(prefix, name, uri.fsPath).then(() => {
                        return findModules(uri.fsPath).then((modules) => {
                            if (modules.length) {
                                return checkAddToModule(modules, name, uri.fsPath, FileType.Directive);
                            }
                        });
                    });
                })
                .catch((err) => {
                    vscode.window.showErrorMessage(err.toString());
                    console.error(err);
                });
        },
    );
    context.subscriptions.push(createDirectiveListener);

    const createModuleListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-module',
        (uri: vscode.Uri) => {
            if (!uri.fsPath) {
                vscode.window.showErrorMessage('No folder selected to contain new module');
                return;
            }

            const prefix = getPrefix();

            getNameOfObject('NewModule', 'Name of module class', 'TestModule FooBarModule')
                .then((moduleName) => {
                    const name = getNameParts(moduleName);

                    if (name[name.length - 1] === 'module') {
                        name.pop();
                    }

                    if (prefix.every((part, index) => name[index] === part)) {
                        name.splice(0, prefix.length);
                    }

                    return createModule(prefix, name, uri.fsPath);
                })
                .catch((err) => {
                    vscode.window.showErrorMessage(err.toString());
                    console.error(err);
                });
        },
    );
    context.subscriptions.push(createModuleListener);
}
