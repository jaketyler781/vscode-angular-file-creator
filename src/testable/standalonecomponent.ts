import {Component} from './component';

export class StandaloneComponent extends Component {
    public override async getComponentTest(): Promise<string> {
        const template = await this.getTestTemplate();
        const selector = await this.getSelector();
        const name = await this.getComponentName();
        return template
            .replace(/FooBar/g, name)
            .replace(/foobar.component/g, this.ts.baseName.replace('.ts', ''))
            .replace(this.templateSelectorRegex, selector);
    }
}
