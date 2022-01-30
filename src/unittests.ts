import * as vscode from 'vscode';
import * as path from 'path';
import {writeFile, findModules, doesFileExist, getAngularFileType} from './file';
import {getSelectorName, getPrefix, getNameParts, AngularFileType, trimClassNameParts} from './naming';
import {runWithErrorLogging} from './util';

function toLowerCamelCase(upperCamelCase: string): string {
    return upperCamelCase[0].toLowerCase() + upperCamelCase.slice(1);
}

async function findTsProject(filename: string): Promise<string | null> {
    const dir = path.dirname(filename);

    if (
        (await doesFileExist(path.join(dir, 'tsconfig.json'))) ||
        (await doesFileExist(path.join(dir, 'tsconfig.src.json')))
    ) {
        return dir;
    } else if (dir === '.') {
        return null;
    } else {
        return findTsProject(dir);
    }
}

enum InjectorType {
    Angular = 'Angular',
    Lucid = 'Lucid',
    None = 'None',
}

interface ClassMetadata {
    name: string | undefined;
    injector: InjectorType;
}

function getInjectorType(docText: string): InjectorType {
    if (docText.indexOf('@Injectable') !== -1) {
        return InjectorType.Angular;
    } else if (docText.indexOf('@LucidInjectable') !== -1) {
        return InjectorType.Lucid;
    } else {
        return InjectorType.None;
    }
}

async function findPrimaryExport(inFile: string): Promise<ClassMetadata> {
    let expectedClassName = path.basename(inFile, '.ts');

    if (expectedClassName.endsWith('.component')) {
        expectedClassName = expectedClassName.slice(0, -'.component'.length) + 'component';
    } else if (expectedClassName.endsWith('.injectable')) {
        expectedClassName = expectedClassName.slice(0, -'.injectable'.length) + '(injectable)?';
    }

    const doc = await vscode.workspace.openTextDocument(inFile);

    const regex = new RegExp(`export class (${expectedClassName})`, 'gmi');

    const docText = doc.getText();

    const match = regex.exec(docText);

    return {
        name: match?.[1],
        injector: getInjectorType(docText),
    };
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

function generateLucidInjectorClasslessTest() {
    return `import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {setupInjector} from '@lucid/testing/testsetup';

describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector(mockProvides);
        // TODO write test code
    });
});
`;
}

function generateLucidInjectableClassTest(className: string, filename: string) {
    return `import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {setupInjector} from '@lucid/testing/testsetup';
import {${className}} from './${path.basename(filename, '.ts')}';

describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector(mockProvides);
        const ${toLowerCamelCase(className)} = injector.get(${className});
        // TODO write test code
    });
});
`;
}

function generateAngularInjectableClassTest(className: string, filename: string) {
    return `import {
    inAngularEnvironment,
    TestEnvironmentConfiguration,
} from '@lucid/angular/testing/angularenvironment/testangular';
import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {ngMockProvides} from '@lucid/injector/mock/ngmockprovides';
import {${className}} from './${path.basename(filename, '.ts')}';

describe(module.id, () => {
    const getConfig = (): TestEnvironmentConfiguration => ({
        lucidProvides: mockProvides,
        ngProvides: ngMockProvides,
    });

    it('should load injectable', async () => {
        await inAngularEnvironment(getConfig(), async (testBedWrapper, lucidInjector) => {
            const ${toLowerCamelCase(className)} = testBedWrapper.inject(${className});
            // TODO write test code
        });
    });
});
`;
}

function generateComponentTest(className: string, moduleName: ModuleInfo) {
    const nameParts = trimClassNameParts(getNameParts(className), AngularFileType.Component);
    const selectorName = getSelectorName(getPrefix(), nameParts);

    return `import {Component, NgModule} from '@angular/core';
import {
    inAngularEnvironment,
    TestEnvironmentConfiguration,
} from '@lucid/angular/testing/angularenvironment/testangular';
import {AsyncMockInteractions} from '@lucid/angular/testing/asyncmockinteractions';
import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {ngMockProvides} from '@lucid/injector/mock/ngmockprovides';
import {${moduleName.moduleName}} from '${moduleName.modulePath}';

@Component({
    template: '<${selectorName}></${selectorName}>',
})
class Test${className} {}

@NgModule({
    declarations: [Test${className}],
    imports: [${moduleName.moduleName}],
})
class TestModule {}

describe(module.id, () => {
    const getConfig = (): TestEnvironmentConfiguration => ({
        ngModule: TestModule,
        lucidProvides: mockProvides,
        ngProvides: ngMockProvides,
    });

    it('should load view', async () => {
        await inAngularEnvironment(getConfig(), async (testBedWrapper, lucidInjector) => {
            const interactions = new AsyncMockInteractions();
            const fixture = testBedWrapper.createComponent(Test${className});
            fixture.detectChanges();
            // TODO write test code
        });
    });
});
`;
}

async function generateAngularTest(
    className: string,
    filename: string,
    angularFileType: AngularFileType,
): Promise<string> {
    if (angularFileType === AngularFileType.Module) {
        throw new Error('Cannot create tests for Angular modules');
    }

    const moduleInfo = await findModuleForClass(filename, className);
    if (!moduleInfo) {
        throw new Error('Could not find module for Angular unit being tested');
    }

    if (angularFileType === AngularFileType.Component) {
        return generateComponentTest(className, moduleInfo);
    } else {
        return generateComponentTest(className, moduleInfo); // TODO generate Angular Directive tests
    }
}

async function getTestContent(uri: vscode.Uri): Promise<string> {
    const filename = uri.fsPath;
    const classMetadata = await findPrimaryExport(filename);
    const className = classMetadata.name;
    const tsProjectDir = await findTsProject(filename);
    const angularFileType = getAngularFileType(filename);
    if (angularFileType && className && tsProjectDir) {
        return await generateAngularTest(className, filename, angularFileType);
    } else if (className) {
        switch (classMetadata.injector) {
            case InjectorType.Angular:
                return generateAngularInjectableClassTest(className, filename);
            case InjectorType.Lucid:
                return generateLucidInjectableClassTest(className, filename);
            case InjectorType.None:
                return generateLucidInjectorClasslessTest();
        }
    } else {
        return generateLucidInjectorClasslessTest();
    }
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
