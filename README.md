# Angular File Creator

## Features

Create Angular components, modules, and directives quickly in VS Code by right clicking folders in the explorer.

![create component demo](images/create-component-demo.gif)

Create TypeScript and Angular unit tests quickly in VS Code by right clicking TypeScript files in the explorer.

![create unit test demo](images/create-unit-test-demo.gif)

## Configuration

`prefix`

Chose the words to appear before each class name, file name, and selector for Angular components, modules, and
directives.

`unitTestTemplates`

Map decorators to templates for unit tests built around the classes the decorators are applied to. The decorator
must be applied to a class following the format

```
@SomeDecorator(...)
export class MyClass ...
```

The following key words in the templates are replaced automatically with data about the class:

-   `TESTCLASS` replaced with the class name
-   `testclass` replaced with the file name of the class
-   `testClass` replaced with a camelCase variable with the same name as the class
-   `test-selector` replaced with the component's `selector` metadata attribute
-   `testSelector` replaced with the directive's `selector` metadata attribute
-   `TESTMODULE` replaced with the module class name of the component/directive
-   `./test.module` replaced with the file import of the module
