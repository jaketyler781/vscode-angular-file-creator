import * as vscode from 'vscode';
import * as path from 'path';
import {writeFile, findModules, doesFileExist} from './file';
import {getNameParts, camelCase} from './naming';
import {runWithErrorLogging} from './util';

export function getUnitTestTemplates(): ReadonlyMap<string, string> {
    const result = vscode.workspace.getConfiguration('extension.angularFileCreator').unitTestTemplates;
    if (typeof result !== 'object') {
        return new Map();
    }
    return new Map(Object.entries(result));
}

type ModuleInfo = {modulePath: string; moduleName: string};

async function findModuleForClass(filename: string, className: string): Promise<ModuleInfo | null> {
    const modulesToCheck = await findModules(path.dirname(filename));

    for (const potentialModulePath of modulesToCheck) {
        const doc = await vscode.workspace.openTextDocument(potentialModulePath);
        const text = doc.getText();
        if (text.indexOf(className) === -1) {
            continue;
        }
        const moduleNameFinder = /export\s+class\s+([\w_][\w\d_]+Module)/gim;
        const match = moduleNameFinder.exec(text);
        const moduleName = match?.[1];
        if (!moduleName) {
            continue;
        }
        const relativeModulePath = path.relative(path.dirname(filename), potentialModulePath.slice(0, -'.ts'.length));
        const modulePath = relativeModulePath[0] === '.' ? relativeModulePath : './' + relativeModulePath;
        return {modulePath, moduleName};
    }

    return null;
}

interface TemplateWithClass {
    readonly className: string;
    readonly fileTemplateUri: string;
}

function getUnitTestTemplateWithClass(docText: string): TemplateWithClass | undefined {
    const regexToTemplatesMap = getUnitTestTemplates();
    const results = Array.from(regexToTemplatesMap.entries())
        .map(([regexText, fileTemplateUri]): TemplateWithClass | undefined => {
            const regex = new RegExp('(?<=' + regexText + '\\((.|\n)*\\)\nexport class )(.*?)(?=\\s)', 'gmi');
            const match = regex.exec(docText);
            const className = match?.[0];
            if (!className) {
                return undefined;
            }
            return {className, fileTemplateUri};
        })
        .filter((result): result is TemplateWithClass => !!result);
    return results[0];
}

async function getTemplateContent(fileTemplateUri: string): Promise<string | undefined> {
    const workspaceRootFolders = vscode.workspace.workspaceFolders ?? [];
    const fileTemplateAbsoluteUris = workspaceRootFolders.map((workspaceRootFolder) =>
        path.resolve(workspaceRootFolder.uri.fsPath, fileTemplateUri),
    );
    const fileTemplateAbsoluteUri = fileTemplateAbsoluteUris[0];
    if (!fileTemplateAbsoluteUri) {
        return undefined;
    }
    const templateDoc = await vscode.workspace.openTextDocument(fileTemplateAbsoluteUri);
    return templateDoc.getText();
}

async function populateTemplateWithModule(
    templateDocText: string,
    filename: string,
    className: string,
): Promise<string> {
    const moduleInfo = await findModuleForClass(filename, className);
    return moduleInfo
        ? templateDocText
              .replace(/TESTMODULE/g, moduleInfo.moduleName) // References
              .replace(/\.\/test.module/g, moduleInfo.modulePath) // Import
        : templateDocText;
}

const selectorRegex = /(?<=selector: ('|")).*(?=('|"))/gim;
function populateTemplateWithSelector(templateDocText: string, docText: string): string {
    const selector = selectorRegex.exec(docText)?.[0];
    return selector
        ? templateDocText
              .replace(/test-selector/g, selector) // Components
              .replace(/testSelector/g, selector) // Directives
        : templateDocText;
}

function populateTemplateWithClass(templateDocText: string, filename: string, className: string): string {
    return templateDocText
        .replace(/TESTCLASS/g, className) // References
        .replace(/testclass/g, (filename.split('/').pop() ?? filename).replace(/\.ts/g, '')) // Import
        .replace(/testClass/g, camelCase(getNameParts(className), false)); // Variable name
}

const basicTest = `describe(module.id, () => {
    it('should work', () => {
    });
});`;

async function getTestContent(uri: vscode.Uri): Promise<string> {
    const filename = uri.fsPath;
    const doc = await vscode.workspace.openTextDocument(uri.fsPath);
    const docText = doc.getText();
    const result = getUnitTestTemplateWithClass(docText);
    let templateText = result ? await getTemplateContent(result.fileTemplateUri) : undefined;
    if (!result || !templateText) {
        return basicTest;
    }
    const {className} = result;
    templateText = await populateTemplateWithModule(templateText, filename, className);
    templateText = populateTemplateWithSelector(templateText, docText);
    return populateTemplateWithClass(templateText, filename, className);
}

async function runCreateUnitTestCommand(uri: vscode.Uri) {
    if (!uri.fsPath || path.extname(uri.fsPath) !== '.ts') {
        throw new Error('Must select a .ts file to create a unit test');
    }

    const componentPath = uri.fsPath.slice(0, -3) + '.spec.ts';
    const testFileAlreadyExists = await doesFileExist(componentPath);
    if (testFileAlreadyExists) {
        throw new Error(`A test file with the name ${componentPath} already exists`);
    }

    const testContent = await getTestContent(uri);
    await writeFile(componentPath, testContent);
    const textDoc = await vscode.workspace.openTextDocument(componentPath);
    await vscode.window.showTextDocument(textDoc);
}

export function activate(context: vscode.ExtensionContext) {
    const createUnitTestListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-unit-test',
        async (uri: vscode.Uri) => runWithErrorLogging(() => runCreateUnitTestCommand(uri)),
    );
    context.subscriptions.push(createUnitTestListener);
}
