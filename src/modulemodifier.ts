import * as vscode from 'vscode';
import * as path from 'path';

const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm;

function nextLine(text: string, startingAt: number): number {
    const result = text.indexOf('\n', startingAt);

    if (result === -1) {
        return text.length;
    } else {
        return result + 1;
    }
}

export class ModuleModifier {
    private readonly textDocumentPromise = vscode.workspace.openTextDocument(this.moduleUri);

    constructor(private readonly moduleUri: string) {}

    public async addImport(classNames: string[], typescriptPath: string): Promise<boolean> {
        const textDocument = await this.textDocumentPromise;

        classNames.sort();

        const text = textDocument.getText();
        let insertionPoint = -1;
        let match = null;
        let extraNewline = false;

        const classNamesJoined = classNames.join(', ');

        while ((match = importRegex.exec(text))) {
            const imports = match[1];
            const importFrom = match[2];
            const suffixGroup = typescriptPath.substring(typescriptPath.lastIndexOf('.'));
            const suffixGroupMatch = importFrom.lastIndexOf(suffixGroup) === importFrom.length - suffixGroup.length;
            if (suffixGroupMatch) {
                if (classNamesJoined < imports) {
                    insertionPoint = importRegex.lastIndex - match[0].length;
                    break;
                } else {
                    // set the insertion point after the imports in case this is the last import
                    insertionPoint = nextLine(text, importRegex.lastIndex);
                }
            }
        }

        importRegex.lastIndex = 0;

        if (insertionPoint === -1) {
            insertionPoint = text.indexOf('@NgModule');
            extraNewline = true;
        }

        if (insertionPoint === -1) {
            return false;
        } else {
            const position = textDocument.positionAt(insertionPoint);
            let importPath = path.relative(path.dirname(this.moduleUri), typescriptPath);

            if (importPath[0] !== '.') {
                importPath = './' + importPath;
            }
            const tsExtension = '.ts';
            if (importPath.endsWith(tsExtension)) {
                importPath = importPath.substring(0, importPath.length - tsExtension.length);
            }

            const newlines = extraNewline ? '\n\n' : '\n';

            const edit = new vscode.WorkspaceEdit();
            edit.insert(textDocument.uri, position, `import {${classNamesJoined}} from '${importPath}';${newlines}`);
            return vscode.workspace.applyEdit(edit);
        }
    }

    private getSectionRegexes(section: string): {start: RegExp; end: RegExp} {
        const flags = 'gms';
        const startExpression = `.*@NgModule\\(\\{.*?${section}: \\[`;
        return {
            start: new RegExp(startExpression, flags),
            end: new RegExp(startExpression + '.*?(?=\\])', flags),
        };
    }

    public async addToModule(group: string, className: string): Promise<boolean> {
        const textDocument = await this.textDocumentPromise;
        const text = textDocument.getText();
        const {start, end} = this.getSectionRegexes(group);
        const sectionStartIndex = text.match(start)?.[0]?.length;
        const sectionEndIndex = text.match(end)?.[0]?.length;
        if (sectionStartIndex === undefined || sectionEndIndex === undefined) {
            return false;
        }
        const sectionText = text.substring(sectionStartIndex, sectionEndIndex);
        if (sectionText.includes(className)) {
            return true;
        }

        const sectionItems = sectionText
            .replace(/\s/g, '')
            .split(',')
            .filter((text) => !!text);
        const newSectionText = [...sectionItems, className].sort().join(',');
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            textDocument.uri,
            new vscode.Range(textDocument.positionAt(sectionStartIndex), textDocument.positionAt(sectionEndIndex)),
            newSectionText,
        );
        return await vscode.workspace.applyEdit(edit);
    }

    public async save(): Promise<boolean> {
        const textDocument = await this.textDocumentPromise;
        return await textDocument.save();
    }
}
