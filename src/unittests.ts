import * as vscode from 'vscode';
import * as path from 'path';
import {writeFile, findModules, doesFileExist} from './file';
import {getSelectorName, getPrefix, getNameParts, FileType, trimClassNameParts} from './naming';
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

    for (const modulePath of modulesToCheck) {
        const doc = await vscode.workspace.openTextDocument(modulePath);
        const text = doc.getText();

        if (text.indexOf(className) !== -1) {
            const moduleNameFinder = /export\s+class\s+([\w_][\w\d_]+Module)/gim;
            const match = moduleNameFinder.exec(text);

            if (match) {
                const relativeModulePath = path.relative(path.dirname(filename), modulePath.slice(0, -'.ts'.length));

                return {
                    modulePath: relativeModulePath[0] === '.' ? relativeModulePath : './' + relativeModulePath,
                    moduleName: match[1],
                };
            }
        }
    }

    return null;
}

function generateClasslessTest() {
    return `import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {setupInjector} from '@lucid/testing/testsetup';


describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector(mockProvides);

        // TODO write test code
    });
});`;
}

function generateClassTest(className: string, filename: string) {
    return `import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {setupInjector} from '@lucid/testing/testsetup';

import {${className}} from './${path.basename(filename, '.ts')}';


describe(module.id, () => {
    it('should work', () => {
        const injector = setupInjector([
            mockProvides,
            // Providing the class here ensures that a mock version isn't injected instead
            ${className},
        ]);

        const ${toLowerCamelCase(className)} = injector.get(${className});

        // TODO write test code
    });
});`;
}

function generateInjectorClassTest(className: string, filename: string) {
    return `import {ReflectiveInjector} from '@angular/core';
import {ng2AutoProvides} from '@lucid/angular/testing/injector';
import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {ngMockProvides} from '@lucid/injector/mock/ngmockprovides';

import {${className}} from './${path.basename(filename, '.ts')}';


describe(module.id, () => {
    it('should work', () => {
        const injector = ReflectiveInjector.resolveAndCreate([
            ng2AutoProvides(mockProvides, ngMockProvides),
            // Providing the class here ensures that a mock version isn't injected instead
            ${className},
        ]);

        const ${toLowerCamelCase(className)} = injector.get(${className});

        // TODO write test code
    });
});`;
}

function generateComponentTest(className: string, moduleName: ModuleInfo) {
    const nameParts = trimClassNameParts(getNameParts(className), FileType.Component);
    const selectorName = getSelectorName(getPrefix(), nameParts);

    return `import {Component, NgModule} from '@angular/core';
import {TestEnvironment} from '@lucid/angular/testing/testenvironment';
import {testComponent, testModule} from '@lucid/angular/testing/testmodule';
import {mockProvides} from '@lucid/injector/mock/mockprovides';
import {ngMockProvides} from '@lucid/injector/mock/ngmockprovides';
import {asyncAwaitMockClock} from '@lucid/pipelinedeps/test/asyncmockclock';
import {AsyncMockInteractions} from '@lucid/angular/testing/asyncmockinteractions';

import {${moduleName.moduleName}} from '${moduleName.modulePath}';

@Component({
    template: '<${selectorName}></${selectorName}>',
})
class Test${className} {
}

@NgModule({
    declarations: [Test${className}],
    imports: [${moduleName.moduleName}],
})
class TestModule {}

describe(
    module.id,
    testModule(
        {
            module: TestModule,
            lucidProvides: mockProvides,
            ngProvides: ngMockProvides,
        },
        () => {
            it('should show calendar on click', testComponent({}, async (testEnv: TestEnvironment) => {
                await asyncAwaitMockClock(async mockClock => {
                    const interactions = new AsyncMockInteractions(mockClock);
                    const fixture = testEnv.createComponent(Test${className});
                    fixture.detectChanges();
                });
            }));
        }
    )
);`;
}

async function generateAngularTest(className: string, filename: string): Promise<string> {
    const moduleInfo = await findModuleForClass(filename, className);
    if (!moduleInfo) {
        throw new Error('Could not find module for Angular unit being tested');
    }

    return generateComponentTest(className, moduleInfo);
}

async function getTestContent(uri: vscode.Uri): Promise<string> {
    const filename = uri.fsPath;
    const classMetadata = await findPrimaryExport(filename);
    const className = classMetadata.name;
    const tsProjectDir = await findTsProject(filename);
    if (filename.endsWith('.component.ts') && className && tsProjectDir) {
        return await generateAngularTest(className, filename);
    } else if (className) {
        switch (classMetadata.injector) {
            case InjectorType.Angular:
                return generateInjectorClassTest(className, filename);
            case InjectorType.Lucid:
                return generateClassTest(className, filename);
            case InjectorType.None:
                return generateClasslessTest();
        }
    } else {
        return generateClasslessTest();
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
