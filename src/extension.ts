import * as vscode from 'vscode';
import * as angular from './angular';
import * as unittests from './unittests';
import * as createharness from './createharness';

export function activate(context: vscode.ExtensionContext) {
    angular.activate(context);
    unittests.activate(context);
    createharness.activate(context);
}
