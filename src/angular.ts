'use strict';
import * as vscode from 'vscode';
import * as path from 'path';

import {File, assertFolder} from './file';
import {getNameParts, getSelectorName, camelCase, trimClassNameParts} from './naming';
import {runWithErrorLogging} from './util';
import {TextEncoder} from 'util';

const InvalidCharacterRegex = /[^\w\d_]|^\d/i;

const lessTemplate = `:host {
    display: flex;
}
`;

function getBazelTemplate(name: string[]) {
    return `load("//cake/build/bazel:ng_project.bzl", "ng_project")

ng_project(
    name = "${getFolderName(name)}",
    deps = [
        "@npm//@angular/common",
        "@npm//@angular/core",
    ],
)
`;
}

function getHTMLTemplate(name: string[]) {
    return `<link rel="stylesheet" type="text/css" href="${getFileName(name, '.component.css')}">

<!-- TODO write template code -->
`;
}

function getComponentTemplate(name: string[]) {
    return `import {CommonModule} from '@angular/common';
import {Component, ChangeDetectionStrategy} from '@angular/core';

@Component({
    selector: '${getSelectorName(name)}',
    standalone: true,
    templateUrl: './${getFileName(name, '.component.html')}',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
})
export class ${getClassName(name)} {
    // TODO implement component
}
`;
}
function getFolderName(nameParts: string[]): string {
    return nameParts.join('');
}

function getFileName(nameParts: string[], ext: string): string {
    return getFolderName(nameParts) + ext;
}

function getClassName(nameParts: string[]): string {
    return camelCase(nameParts, true) + 'Component';
}

async function writeFile(path: string, content: string): Promise<void> {
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path), new TextEncoder().encode(content));
}

async function createComponent(name: string[], containingFolder: string): Promise<void> {
    const bazelPath = path.join(containingFolder, 'BUILD.bazel');
    const componentPath = path.join(containingFolder, getFileName(name, '.component.ts'));
    const templatePath = path.join(containingFolder, getFileName(name, '.component.html'));
    const stylesheetPath = path.join(containingFolder, getFileName(name, '.component.less'));
    await Promise.all([
        writeFile(bazelPath, getBazelTemplate(name)),
        writeFile(componentPath, getComponentTemplate(name)),
        writeFile(templatePath, getHTMLTemplate(name)),
        writeFile(stylesheetPath, lessTemplate),
    ]);
    const textDoc = await vscode.workspace.openTextDocument(componentPath);
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
        exampleName: 'FooBarComponent',
    });
    const name = trimClassNameParts(getNameParts(componentName));
    const componentFolder = path.join(uri.fsPath, getFolderName(name));
    if (await File.exists(componentFolder)) {
        throw new Error('Folder with name ' + componentFolder + ' already exists');
    }
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(componentFolder));
    await createComponent(name, componentFolder);
}

export function activate(context: vscode.ExtensionContext) {
    const createComponentListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-component',
        (uri: vscode.Uri) => runWithErrorLogging(() => runCreateComponentCommand(uri)),
    );
    context.subscriptions.push(createComponentListener);
}
