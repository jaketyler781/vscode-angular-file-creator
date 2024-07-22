import * as vscode from 'vscode';
import {File} from './file';
import {runWithErrorLogging, runWithProgressNotification} from './util';
import {TestableFactory} from './testable/testablefactory';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const createUnitTestListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-unit-test',
        async (uri: vscode.Uri) =>
            runWithErrorLogging(async () => {
                if (!uri.fsPath.endsWith('.ts')) {
                    throw new Error('Must select a .ts file to create a unit test');
                }

                const specPath = uri.fsPath.replace('.ts', '.spec.ts');
                const baseName = path.basename(specPath);
                if (await File.exists(specPath)) {
                    throw new Error(`${baseName} already exists`);
                }

                await runWithProgressNotification(`Creating ${baseName}`, async () => {
                    const testable = await TestableFactory.get(uri);

                    await testable.createTest();
                });
            }),
    );
    context.subscriptions.push(createUnitTestListener);
}
