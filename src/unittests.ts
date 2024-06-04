import * as vscode from 'vscode';
import * as path from 'path';
import {getNameParts, camelCase} from './naming';
import {runWithErrorLogging} from './util';
import {TestableClass} from './testableclass';
import {TextEncoder} from 'util';
import {doesFileExist} from './file';

interface ModuleInfo {
    readonly modulePath: string;
    readonly moduleName: string;
}

async function findModules(inDirectory: string): Promise<readonly string[]> {
    const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(inDirectory));

    const moduleFiles = files.filter(([file]) => file.indexOf('.module.ts') !== -1);
    const relativeModulePaths = moduleFiles.map(([file]) => path.join(inDirectory, file));

    const parentFolder = path.join(inDirectory, '..');
    const workspaceRootFolders = vscode.workspace.workspaceFolders ?? [];
    const isParentFolderInWorkspace = workspaceRootFolders.some(
        (workspaceRootFolder) => path.relative(workspaceRootFolder.uri.fsPath, parentFolder).substring(0, 2) !== '..',
    );
    if (isParentFolderInWorkspace) {
        const moreModules = await findModules(parentFolder);
        return relativeModulePaths.concat(moreModules);
    }
    return relativeModulePaths;
}

async function findModuleForClass(filename: string, className: string): Promise<ModuleInfo | null> {
    const modulesToCheck = await findModules(path.dirname(filename));

    for (const potentialModulePath of modulesToCheck) {
        const text = vscode.workspace.fs.readFile(vscode.Uri.file(potentialModulePath)).toString();
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

async function populateTemplateWithAngularImport(test: string, testableClass: TestableClass): Promise<string> {
    if (!['@Component', '@Directive'].includes(testableClass.decorator)) {
        return test;
    } else if (testableClass.standalone) {
        return test
            .replace(/TESTCOMPONENT/g, testableClass.className)
            .replace(
                /test.component/g,
                (testableClass.filePath.split('/').pop() ?? testableClass.filePath).replace(/\.ts/g, ''),
            );
    } else {
        const moduleInfo = await findModuleForClass(testableClass.filePath, testableClass.className);
        return moduleInfo
            ? test
                  .replace(/TESTCOMPONENT/g, moduleInfo.moduleName)
                  .replace(/\.\/test.component/g, moduleInfo.modulePath)
            : test;
    }
}

const selectorRegex = /(?<=selector: ('|")).*(?=('|"))/gim;
function populateTemplateWithSelector(test: string, testableClass: TestableClass): string {
    const selector = selectorRegex.exec(testableClass.fileContents)?.[0];
    return selector
        ? test
              .replace(/test-selector/g, selector) // Components
              .replace(/testSelector/g, selector) // Directives
        : test;
}

function populateTemplateWithClass(test: string, testableClass: TestableClass): string {
    return test
        .replace(/TESTCLASS/g, testableClass.className) // References
        .replace(/testclass/g, (testableClass.filePath.split('/').pop() ?? testableClass.filePath).replace(/\.ts/g, '')) // Import
        .replace(/testClass/g, camelCase(getNameParts(testableClass.className), false)); // Variable name
}

const basicTest = `describe(module.id, () => {
    it('should work', () => {
    });
});`;

async function getTestContent(uri: vscode.Uri): Promise<string> {
    const testableClass = await TestableClass.create(uri.fsPath);
    if (!testableClass) {
        return basicTest;
    }
    let test = testableClass.testTemplate;
    test = await populateTemplateWithAngularImport(test, testableClass);
    test = populateTemplateWithSelector(test, testableClass);
    return populateTemplateWithClass(test, testableClass);
}

async function runCreateUnitTestCommand(uri: vscode.Uri) {
    if (!uri.fsPath || path.extname(uri.fsPath) !== '.ts') {
        throw new Error('Must select a .ts file to create a unit test');
    }

    const specUri = vscode.Uri.file(uri.fsPath.slice(0, -3) + '.spec.ts');
    if (await doesFileExist(specUri.fsPath)) {
        throw new Error(`A test file with the name ${specUri} already exists`);
    }

    const testCode = await getTestContent(uri);
    const fileBytes = new TextEncoder().encode(testCode);
    await vscode.workspace.fs.writeFile(specUri, fileBytes);
    return specUri;
}

export function activate(context: vscode.ExtensionContext) {
    const createUnitTestListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-unit-test',
        async (uri: vscode.Uri) =>
            runWithErrorLogging(async () => {
                const specPath = await runCreateUnitTestCommand(uri);
                const specDocument = await vscode.workspace.openTextDocument(specPath);
                await vscode.window.showTextDocument(specDocument);
            }),
    );
    context.subscriptions.push(createUnitTestListener);
}
