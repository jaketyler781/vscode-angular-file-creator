import * as path from 'path';
import * as vscode from 'vscode';
import {File} from './file';
import {Component} from './component';

export class ModuleOwnedComponent extends Component {
    public override async getComponentTest(): Promise<string> {
        const template = await this.getTestTemplate();
        const selector = await this.getSelector();
        const module = await this.findModuleForClass();
        const componentClassName = await this.getClassName();
        const name = await this.getComponentName();
        return template
            .replace(/TestFooBarComponent/g, 'Test' + componentClassName)
            .replace(/FooBarComponent/g, module.className)
            .replace(/FooBar/g, name)
            .replace(/'\.\/foobar.component.test'/g, `'./${this.ts.baseName.replace('.ts', '')}.test'`)
            .replace(/'\.\/foobar.component'/g, `'${module.relativePath}'`)
            .replace(this.templateSelectorRegex, selector);
    }

    private async findModuleForClass(): Promise<AngularImport> {
        const modulePaths = await this.findModules(path.dirname(this.ts.uri.fsPath));
        const componentClassName = await this.getClassName();

        for (const modulePath of modulePaths) {
            const module = new File(modulePath);
            const text = await module.read();
            if (text.indexOf(componentClassName) === -1) {
                continue;
            }
            const moduleNameFinder = /export\s+class\s+([\w_][\w\d_]+Module)/gim;
            const match = moduleNameFinder.exec(text);
            const moduleClassName = match?.[1];
            if (!moduleClassName) {
                continue;
            }
            const relativeModulePath = path.relative(
                path.dirname(this.ts.uri.fsPath),
                modulePath.slice(0, -'.ts'.length),
            );
            const relativePath = relativeModulePath[0] === '.' ? relativeModulePath : './' + relativeModulePath;
            return {relativePath, className: moduleClassName};
        }

        throw new Error(`Could not find module for non-standalone component in ${this.ts.baseName}`);
    }

    private async findModules(inDirectory: string): Promise<readonly string[]> {
        const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(inDirectory));
        const moduleFiles = files.filter(([file]) => file.indexOf('.module.ts') !== -1);
        const relativeModulePaths = moduleFiles.map(([file]) => path.join(inDirectory, file));

        const parentFolder = path.join(inDirectory, '..');
        if (File.inWorkspace(parentFolder)) {
            const moreModules = await this.findModules(parentFolder);
            relativeModulePaths.push(...moreModules);
        }
        return relativeModulePaths;
    }
}

interface AngularImport {
    readonly relativePath: string;
    readonly className: string;
}
