import {Component} from './component';
import {File} from '../file';

export class StandaloneComponent extends Component {
    public override async getComponentTest(): Promise<string> {
        const templateFile = new File('cake/app/webroot/ts/testing/templates/foobar/foobar.component.spec.ts');
        const template = await templateFile.read();
        const selector = await this.getSelector();
        const name = await this.getComponentName();
        return template
            .replace(/FooBar/g, name)
            .replace(/foobar.component/g, this.ts.baseName.replace('.ts', ''))
            .replace(this.templateSelectorRegex, selector);
    }
}
