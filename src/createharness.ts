import * as vscode from 'vscode';
import {runWithErrorLogging} from './util';
import {TestableFactory} from './testable/testablefactory';

export function activate(context: vscode.ExtensionContext) {
    const createHarnessListener = vscode.commands.registerCommand(
        'extension.angularFileCreator.create-harness',
        async (uri: vscode.Uri) =>
            runWithErrorLogging(async () => {
                const component = await TestableFactory.getComponentTestable(uri);
                await component.createHarness();
            }),
    );
    context.subscriptions.push(createHarnessListener);
}
