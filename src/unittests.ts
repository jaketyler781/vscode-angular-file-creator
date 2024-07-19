import * as vscode from 'vscode';
import {File} from './file';
import {Testable} from './testable/testable';
import {runWithErrorLogging} from './util';
import {getComponentTestable} from './testable/componenttestable';

export function activate(context: vscode.ExtensionContext) {
    const createUnitTestListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-unit-test',
        async (uri: vscode.Uri) =>
            runWithErrorLogging(async () => {
                if (!uri.fsPath.endsWith('.ts')) {
                    throw new Error('Must select a .ts file to create a unit test');
                }

                const specPath = uri.fsPath.replace('.ts', '.spec.ts');
                if (await File.exists(specPath)) {
                    throw new Error(`A test file with the name ${specPath} already exists`);
                }

                const testable = uri.fsPath.endsWith('.component.ts')
                    ? await getComponentTestable(uri)
                    : new Testable(uri);

                await testable.createTest();
            }),
    );
    context.subscriptions.push(createUnitTestListener);
}
