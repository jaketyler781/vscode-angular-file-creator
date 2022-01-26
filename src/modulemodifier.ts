import * as vscode from 'vscode';

import * as path from 'path';

const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm;

function getLeadingWhitespace(text: string, startingAt: number): string {
    const lineStart = startOfLine(text, startingAt);

    let lineEnd = lineStart;

    while ((text[lineEnd] === ' ' || text[lineEnd] === '\t') && lineEnd < text.length) {
        ++lineEnd;
    }

    return text.substring(lineStart, lineEnd);
}

function startOfLine(text: string, startingAt: number): number {
    return text.lastIndexOf('\n', startingAt) + 1;
}

function nextLine(text: string, startingAt: number): number {
    const result = text.indexOf('\n', startingAt);

    if (result === -1) {
        return text.length;
    } else {
        return result + 1;
    }
}

function isOpenBrackets(char: string): boolean {
    return char === '{' || char === '(' || char === '[';
}

function isClosingBracket(char: string): boolean {
    return char === '}' || char === ')' || char === ']';
}

function stepOverBrackets(text: string, atPosition: number): number {
    if (isOpenBrackets(text[atPosition])) {
        const stack = [text[atPosition]];
        ++atPosition;

        while (stack.length > 0 && atPosition < text.length) {
            const char = text[atPosition];
            if (isOpenBrackets(char)) {
                stack.push(char);
            } else if (isClosingBracket(char)) {
                stack.pop();
            }

            ++atPosition;
        }
    }

    return atPosition;
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

    public async addToModule(group: string, className: string): Promise<boolean> {
        const textDocument = await this.textDocumentPromise;
        const text = textDocument.getText();
        const moduleLocation = text.indexOf('@NgModule(');
        if (moduleLocation === -1) {
            return false;
        }

        const contentStart = moduleLocation + '@NgModule'.length;
        const contentEnd = stepOverBrackets(text, contentStart);
        const moduleContent = text.substring(contentStart, contentEnd);
        const groupRegex = new RegExp(group + '\\s*:\\s*\\[', 'gm');
        if (!groupRegex.test(moduleContent)) {
            return false;
        }

        const arrayStart = groupRegex.lastIndex - 1;
        const arrayEnd = stepOverBrackets(moduleContent, arrayStart);
        const currentModules = moduleContent
            .substring(arrayStart + 1, arrayEnd - 1)
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name.length);

        let insertAt = 0;
        for (insertAt = 0; insertAt < currentModules.length; ++insertAt) {
            if (className < currentModules[insertAt]) {
                break;
            }
        }

        let insertionPoint = 0;
        let extraTab = false;
        if (insertAt === currentModules.length) {
            insertionPoint = arrayEnd - 1;
            extraTab = true;
        } else {
            insertionPoint = moduleContent.indexOf(currentModules[insertAt], arrayStart);
        }

        const leadingWhitespace = extraTab ? '    ' : '';
        const trailingWhitespace = getLeadingWhitespace(moduleContent, insertionPoint);
        insertionPoint += contentStart;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(
            textDocument.uri,
            textDocument.positionAt(insertionPoint),
            leadingWhitespace + className + ',\n' + trailingWhitespace,
        );
        return vscode.workspace.applyEdit(edit);
    }

    public async save(): Promise<boolean> {
        const textDocument = await this.textDocumentPromise;
        return await textDocument.save();
    }
}
