'use strict';
import * as vscode from 'vscode';
import * as path from 'path';

import {writeFile, findModules, makeFolder, doesFileExist, assertFolder} from './file';
import {ModuleModifier} from './modulemodifier';
import {
    getNameParts,
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
export class ${getClassName(name, FileType.Component)} {
    // TODO implement component
}
`;
}

function getModuleTemplate(name: string[]) {
    return `import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';

@NgModule({
    declarations: [],
    exports: [],
    imports: [CommonModule],
})
export class ${getClassName(name, FileType.Module)} {};
`;
}

function getDirectiveTemplate(name: string[]) {
    const directiveSelector = camelCase(getPrefix().concat(name), false);
    return `import {Directive} from '@angular/core';

@Directive({
    moduleId: module.id,
    selector: '${directiveSelector}',
})
export class ${getClassName(name, FileType.Directive)} {
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

function getClassName(nameParts: string[], fileType: FileType): string {
    switch (fileType) {
        case FileType.Component:
            return camelCase(nameParts, true) + 'Component';
        case FileType.Directive:
            return camelCase(nameParts, true) + 'Directive';
        case FileType.Module:
            return getModuleClassName(getPrefix(), nameParts);
    }
}

async function createModule(name: string[], containingFolder: string): Promise<string> {
    const modulePath = path.join(containingFolder, getFileName(name, '.module.ts'));
    await writeFile(modulePath, getModuleTemplate(name));
    const textDoc = await vscode.workspace.openTextDocument(modulePath);
    await vscode.window.showTextDocument(textDoc);
    return modulePath;
}

async function createComponent(name: string[], containingFolder: string): Promise<string> {
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
    return componentPath;
}

async function createDirective(name: string[], inFolder: string): Promise<string> {
    const directivePath = path.join(inFolder, getFileName(name, '.directive.ts'));

    if (await doesFileExist(directivePath)) {
        throw new Error(`File with name ${directivePath} already exists`);
    }
    await writeFile(directivePath, getDirectiveTemplate(name));
    const textDoc = await vscode.workspace.openTextDocument(directivePath);
    await vscode.window.showTextDocument(textDoc);
    return directivePath;
}

async function addToModule(moduleUri: string, className: string, classAbsolutePath: string): Promise<void> {
    const module = new ModuleModifier(moduleUri);
    const successAddingExport = await module.addToModule('exports', className);
    const successAddingDeclaration = await module.addToModule('declarations', className);
    const successAddingImport = await module.addImport([className], classAbsolutePath);
    const successSaving = await module.save();
    const issues = [
        successAddingImport ? undefined : 'adding import',
        successAddingDeclaration ? undefined : 'adding declaration',
        successAddingExport ? undefined : 'adding export',
        successSaving ? undefined : 'saving file',
    ].filter((text): text is string => !!text);
    if (issues.length > 0) {
        // Only show warning instead of error since most of the command completed successfully before adding to module
        vscode.window.showWarningMessage('Failed modifying the module file: ' + issues.join(','));
    }
}

enum AddToModule {
    DoNot = 'Do not add to a module',
    CreateNew = 'Create new module',
}

async function promptUserForModuleToAddClassTo({
    classAbsolutePath,
    name,
    inFolder,
    fileType,
}: {
    classAbsolutePath: string;
    name: string[];
    inFolder: string;
    fileType: FileType;
}): Promise<void> {
    const modules = await findModules(inFolder);
    const relativeModules = [
        AddToModule.CreateNew,
        ...modules.map((mod) => path.relative(inFolder, mod)),
        AddToModule.DoNot,
    ];
    const selectResult = await vscode.window.showQuickPick(relativeModules, {placeHolder: 'Add to module'});
    if (!selectResult || selectResult === AddToModule.DoNot) {
        return;
    }
    const moduleAbsolutePath =
        selectResult === AddToModule.CreateNew
            ? await createModule(name, inFolder)
            : path.resolve(inFolder, selectResult);
    const className = getClassName(name, fileType);
    await addToModule(moduleAbsolutePath, className, classAbsolutePath);
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
    const name = trimClassNameParts(getNameParts(componentName), FileType.Component);
    const componentFolder = path.join(uri.fsPath, getFolderName(name));
    if (await doesFileExist(componentFolder)) {
        throw new Error('Folder with name ' + componentFolder + ' already exists');
    }
    await makeFolder(componentFolder);
    const componentAbsolutePath = await createComponent(name, componentFolder);
    await promptUserForModuleToAddClassTo({
        name,
        inFolder: componentFolder,
        fileType: FileType.Component,
        classAbsolutePath: componentAbsolutePath,
    });
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

    const directiveAbsolutePath = await createDirective(name, uri.fsPath);
    await promptUserForModuleToAddClassTo({
        name,
        inFolder: uri.fsPath,
        fileType: FileType.Directive,
        classAbsolutePath: directiveAbsolutePath,
    });
}

async function runCreateModuleCommand(uri: vscode.Uri): Promise<void> {
    await assertFolder(uri);
    const moduleName = await promptUserForClassName({
        defaultName: 'NewModule',
        prompt: 'Name of module class',
        exampleName: 'TestModule FooBarModule',
    });
    const name = trimClassNameParts(getNameParts(moduleName), FileType.Module);
    const containingFolder = path.join(uri.fsPath, getFolderName(name));
    if (await doesFileExist(containingFolder)) {
        throw new Error('Folder with name ' + containingFolder + ' already exists');
    }
    await makeFolder(containingFolder);
    await createModule(name, containingFolder);
}

async function runWithErrorLogging(runCommand: (uri: vscode.Uri) => Promise<void>, uri: vscode.Uri): Promise<void> {
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
