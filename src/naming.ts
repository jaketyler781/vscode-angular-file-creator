import * as vscode from 'vscode';

export enum AngularFileType {
    Component = 'component',
    Directive = 'directive',
}

/**
 * @param nameParts a list of strings to combine into a single CamelCase word
 * @param capitalizeFirst whether to capitalize the first letter
 * @returns a single CamelCase string composed of all the words from the list
 */
export function camelCase(nameParts: string[], capitalizeFirst: boolean) {
    return nameParts
        .map(
            (part, index) =>
                (capitalizeFirst || index !== 0 ? part[0].toUpperCase() : part[0].toLowerCase()) + part.substr(1),
        )
        .join('');
}

/**
 *
 * @param name camelCase text
 * @returns an list of each word in the camelCase text, converted to lowercase
 */
export function getNameParts(name: string): string[] {
    return name
        .trim()
        .replace(/([a-z](?=[A-Z]))/g, '$1\n')
        .split('\n')
        .map((part) => part.toLowerCase())
        .filter((a) => a.length > 0);
}

export function trimClassNameParts(nameParts: string[], fileType: AngularFileType): string[] {
    if (nameParts[nameParts.length - 1] === fileType) {
        nameParts.pop();
    }
    const prefix = getPrefix();
    if (prefix.every((part, index) => nameParts[index] === part)) {
        nameParts.splice(0, prefix.length);
    }
    return nameParts;
}

export function getSelectorName(nameParts: string[], angularFileType: AngularFileType): string {
    const prefix = getPrefix();
    if (angularFileType == AngularFileType.Component) {
        return prefix.length > 0 ? `${prefix.join('-')}-${nameParts.join('-')}` : nameParts.join('-');
    } else if (angularFileType === AngularFileType.Directive) {
        return camelCase(getPrefix().concat(nameParts), false);
    } else {
        return '';
    }
}

export function getPrefix(): string[] {
    const result = vscode.workspace.getConfiguration('extension.angularFileCreator').prefix;

    if (typeof result === 'string') {
        return getNameParts(result);
    } else {
        return [];
    }
}

export function getModuleClassName(prefix: string[], nameParts: string[]): string {
    return camelCase(prefix.concat(nameParts), true) + 'Module';
}
