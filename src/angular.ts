'use strict';
import * as vscode from 'vscode';
import * as path from 'path';

import {writeFile, findModules, makeFolder, doesFileExist} from './file';
import {ModuleModifier} from './modulemodifier';
import {
    getNameParts,
    getComponentNameParts,
    getSelectorName,
    getPrefix,
    camelCase,
    getModuleClassName,
    trimClassNameParts,
    FileType,
} from './naming';

const InvalidCharacterRegex = /[^\w\d_]|^\d/i;

const lessTemplate = `
// TODO write style code
`;

function getHTMLTemplate(name: string[]) {
    return `<link rel="stylesheet" type="text/css" href="${getFileName(name, '.component.css')}">

<!-- TODO write template code -->
`;
}

function getComponentTemplate(name: string[]) {
    return `import {Component, ChangeDetectionStrategy} from '@angular/core';

@Component({
    moduleId: module.id,
    selector: '${getSelectorName(getPrefix(), name)}',
    templateUrl: './${getFileName(name, '.component.html')}',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${getComponentClassName(name)} {
    // TODO implement component
}
`;
}

function getModuleTemplate(name: string[]) {
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
export class ${getModuleClassName(getPrefix(), name)} {};
`;
}

function getDirectiveTemplate(name: string[]) {
    const directiveSelector = camelCase(getPrefix().concat(name), false);
    return `import {Directive} from '@angular/core';

@Directive({
    moduleId: module.id,
    selector: '${directiveSelector}',
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

function getComponentClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Component';
}

function getDirectiveClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Directive';
}

async function createModule(name: string[], inFolder: string): Promise<void> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (await doesFileExist(containingFolder)) {
        throw new Error('Folder with name ' + containingFolder + ' already exists');
    }
    const modulePath = path.join(containingFolder, getFileName(name, '.module.ts'));
    await makeFolder(containingFolder);
    await writeFile(modulePath, getModuleTemplate(name));
    const textDoc = await vscode.workspace.openTextDocument(modulePath);
    await vscode.window.showTextDocument(textDoc);
}

async function createComponent(name: string[], inFolder: string): Promise<void> {
    const containingFolder = path.join(inFolder, getFolderName(name));

    if (await doesFileExist(containingFolder)) {
        throw new Error('Folder with name ' + containingFolder + ' already exists');
    }
    await makeFolder(containingFolder);
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

async function addToModule(moduleUri: string, name: string[], inFolder: string, fileType: FileType): Promise<void> {
    const module = new ModuleModifier(moduleUri);
    const containingFolder = path.join(inFolder, getFolderName(name));
    const extension = fileType === FileType.Component ? '.component' : '.directive';
    const className = fileType === FileType.Component ? getComponentClassName(name) : getDirectiveClassName(name);

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

async function promptUserForModuleToAddClassTo({
    modules,
    name,
    inFolder,
    fileType,
}: {
    modules: string[];
    name: string[];
    inFolder: string;
    fileType: FileType;
}): Promise<void> {
    const relativeModules = modules.map((mod) => path.relative(inFolder, mod));
    relativeModules.push('Do not add to a module');
    const selectResult = await vscode.window.showQuickPick(relativeModules, {placeHolder: 'Add to module'});
    if (!selectResult) {
        return;
    }
    const moduleIndex = relativeModules.indexOf(selectResult);

    if (moduleIndex >= 0 && moduleIndex < modules.length) {
        await addToModule(modules[moduleIndex], name, inFolder, fileType);
    }
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
    const componentName = await promptUserForClassName({
        defaultName: 'NewComponent',
        prompt: 'Name of component class',
        exampleName: 'TestComponent FooBarComponent',
    });
    const name = getComponentNameParts(componentName);
    await createComponent(name, uri.fsPath);
    const modules = await findModules(uri.fsPath);
    if (modules.length) {
        await promptUserForModuleToAddClassTo({modules, name, inFolder: uri.fsPath, fileType: FileType.Component});
    }
}

async function runCreateDirectiveCommand(uri: vscode.Uri): Promise<void> {
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
    const modules = await findModules(uri.fsPath);
    if (modules.length) {
        await promptUserForModuleToAddClassTo({modules, name, inFolder: uri.fsPath, fileType: FileType.Directive});
    }
}

async function runCreateModuleCommand(uri: vscode.Uri): Promise<void> {
    const moduleName = await promptUserForClassName({
        defaultName: 'NewModule',
        prompt: 'Name of module class',
        exampleName: 'TestModule FooBarModule',
    });
    const name = trimClassNameParts(getNameParts(moduleName), FileType.Module);
    await createModule(name, uri.fsPath);
}

async function runWithErrorLogging(runCommand: (uri: vscode.Uri) => Promise<void>, uri: vscode.Uri): Promise<void> {
    const fileStat = await vscode.workspace.fs.stat(uri);
    if (fileStat.type !== vscode.FileType.Directory) {
        vscode.window.showErrorMessage('Must select a folder for creating new Angular files');
        return;
    }

    try {
        await runCommand(uri);
    } catch (err) {
        vscode.window.showErrorMessage(err.toString());
        console.error(err);
    }
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-component',
        (uri: vscode.Uri) => runWithErrorLogging(runCreateComponentCommand, uri),
    );
    context.subscriptions.push(createComponentListener);

    const createDirectiveListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-directive',
        (uri: vscode.Uri) => runWithErrorLogging(runCreateDirectiveCommand, uri),
    );
    context.subscriptions.push(createDirectiveListener);

    const createModuleListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-module',
        (uri: vscode.Uri) => runWithErrorLogging(runCreateModuleCommand, uri),
    );
    context.subscriptions.push(createModuleListener);
}
