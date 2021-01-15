/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const fs = require('fs-extra');
const glob = require('glob');
const path = require('path');
const CONSTANTS = require('../constants');
const hookRunner = require('../hookRunner');
const util = require('../util');

/**
 * ## compileComponentTypescript
 *
 * Compiles a web components Typescript to Javascript
 *
 * @public
 * @param {object} options
 * @param {object} options.context
 * @param {string} options.pack
 * @param {string} options.component
 * @returns {Promise<object>} promise that resolves with build
 * context object
 */
function compileComponentTypescript({
  context,
  pack,
  component
}) {
  const isTypescriptComponent = util.isTypescriptComponent({ pack, component }) ||
    util.isVComponent({ pack, component });
  if (util.shouldNotRunTypescriptTasks(context) || !isTypescriptComponent) {
    return Promise.resolve(context);
  }
  return _compileComponentTypescript({
    context,
    pack,
    component
  });
}

/**
 * ## _compileComponentTypescript
 *
 * Helper method that does the following:
 * 1. Compiles a component's Typescript to
 * Javascript
 * 2. Copy component's none typescript files to the
 * corresponding javascript location
 * 3. Copy a vcomponent's metadata file from <staging>/ts/components_dt
 * to the corresponding javascript location and renames it to component.json
 * 4. Organizes a component's types into a /types folder
 * @private
 * @param {object} options
 * @param {object} options.context
 * @param {string} options.pack
 * @param {string} options.component
 * @returns {Promise<object>} promise that resolves with build
 * context
 */
function _compileComponentTypescript({
  context,
  pack,
  component
}) {
  const configPaths = util.getConfiguredPaths();
  const componentName = pack ? `${pack}-${component}` : component;
  util.log(`Compile ${componentName} typescript`);
  const componentsTypescriptBasePath = util.pathJoin(
    '.',
    context.opts.stagingPath,
    configPaths.src.typescript,
    configPaths.composites,
  );
  const componentsJavascriptBasePath = util.pathJoin(
    '.',
    context.opts.stagingPath,
    configPaths.src.javascript,
    configPaths.composites,
  );
  const componentTypescriptPath = util.pathJoin(
    '.',
    ...util.generatePathToComponentRoot({
      pack,
      component,
      root: context.opts.stagingPath,
      scripts: configPaths.src.typescript
    }).split(path.sep)
  );
  // add component typescript options to build context options
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = {
    type: 'component',
    tsconfigJson: {
      include: [
        `${componentTypescriptPath}/**/*.ts`,
        `${componentTypescriptPath}/**/*.tsx`
      ],
      compilerOptions: {
        rootDir: componentsTypescriptBasePath,
        outDir: componentsJavascriptBasePath
      }
    },
    pack,
    component
  };
  const promiseFunctions = [
    // setup typescript compilation
    () => _setupTypescriptCompilation(context),
    // run before_component_typescript hook
    () => hookRunner('before_component_typescript', context),
    // compile component typescript
    () => _runTypescriptCompilation(context),
    // copy runtime resources to /js
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _copyTypescriptComponentFilesToJSFolder,
      {
        context,
        pack,
        component
      }
    ),
    // copy vcomponent component.json files to /js
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _copyVComponentComponentJsonToJs,
      { context }
    ),
    // organize type definition files
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _organizeComponentsTypeDefinitions,
      { context }
    ),
    // run after_component_typescript hook
    () => _runIfTypescriptCompilationSucceeded(
      context,
      hookRunner,
      'after_component_typescript',
      context
    ),
    // resolve with context
    () => _logTypescriptCompliationResult(context, `Compile ${componentName} typescript`)
  ];
  return util.runPromisesInSeries(promiseFunctions);
}

/**
 * ## compileApplicationTypescript
 *
 * Compiles all of the application's Typescript to Javascript
 *
 * @public
 * @param {object} context
 * @returns {Promise<object>} promise that resolves with build
 * context object
 */
function compileApplicationTypescript(context) {
  if (util.shouldNotRunTypescriptTasks(context)) {
    return Promise.resolve(context);
  }
  util.log('Compile application typescript');
  // add application typescript options to build context
  const configPaths = util.getConfiguredPaths();
  const applicationTypescriptPath = util.pathJoin(
    '.',
    context.opts.stagingPath,
    configPaths.src.typescript
  );
  const applicationJavascriptPath = util.pathJoin(
    '.',
    context.opts.stagingPath,
    configPaths.src.javascript
  );
  const typescriptOptions = context.opts.typescript || {};
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = {
    type: 'application',
    tsconfigJson: {
      include: typescriptOptions.file ?
        [util.pathJoin('.', ...typescriptOptions.file.split(path.sep))] :
        [
          `${applicationTypescriptPath}/**/*.ts`,
          `${applicationTypescriptPath}/**/*.tsx`,
        ],
      compilerOptions: {
        rootDir: applicationTypescriptPath,
        outDir: applicationJavascriptPath
      }
    }
  };
  const promiseFunctions = [
    // setup typescript compilation
    () => _setupTypescriptCompilation(context),
    // run before_app_typescript hook
    () => hookRunner('before_app_typescript', context),
    // compile app typescript
    () => _runTypescriptCompilation(context),
    // copy runtime sources to /js
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _copyTypescriptApplicationFilesToJSFolder,
      { context }
    ),
    // copy vcomponent component.json files to /js
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _copyVComponentComponentJsonToJs,
      { context }
    ),
    // organize type definition files
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _organizeComponentsTypeDefinitions,
      { context }
    ),
    // run after_app_typescript hook,
    () => _runIfTypescriptCompilationSucceeded(
      context,
      hookRunner,
      'after_app_typescript',
      context
    ),
    // resolve with context
    () => _logTypescriptCompliationResult(context, 'Compile application typescript')
  ];
  return util.runPromisesInSeries(promiseFunctions);
}

/**
 * ## _setupTypescriptCompilation
 *
 * Setups up typescript options on the build
 * context before the compilation
 *
 * @private
 * @param {object} context - build context
 */
function _setupTypescriptCompilation(context) {
  return new Promise((resolve) => {
    const tsconfigJson = util.readJsonAndReturnObject(CONSTANTS.TSCONFIG);
    const typescriptOptions = context.opts.typescript;
    const typescriptOptionsTsconfig = typescriptOptions.tsconfigJson;
    // setup tsconfig.json
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.include = typescriptOptionsTsconfig.include;
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.sourceMap = context.buildType === 'dev';
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.paths = {
      ...util.pointTypescriptPathMappingsToStaging({
        context,
        pathMappings: tsconfigJson.compilerOptions.paths
      }),
      ...util.getLocalComponentPathMappings({ context }),
      ...util.getExchangeComponentPathMappings({ context })
    };
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.rootDir = typescriptOptionsTsconfig.compilerOptions.rootDir;
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.outDir = typescriptOptionsTsconfig.compilerOptions.outDir;
    // setup typescript options for hook
    // eslint-disable-next-line no-param-reassign
    context.opts.typescript = { ...typescriptOptions, tsconfigJson };
    resolve(context);
  });
}

/**
 * ## _runTypescriptCompilation
 *
 * Runs the typescript compilation
 *
 * @private
 * @param {object} context - build context
 */
function _runTypescriptCompilation(context) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const { tsconfigJson } = context.opts.typescript;
    // eslint-disable-next-line max-len
    // eslint-disable-next-line global-require, import/newline-after-import, import/no-dynamic-require
    const CustomTypescriptCompiler = require(CONSTANTS.PATH_TO_CUSTOM_TSC);
    let files = [];
    tsconfigJson.include.forEach((pattern) => {
      files = [
        ...files,
        ...glob.sync(pattern, {
          nodir: true,
          ignore: tsconfigJson.exclude || []
        })
      ];
    });
    const compileOptions = {
      // list of input files to pass to the compiler
      files,
      // compilerOptions to be passed to compiler
      compilerOptions: tsconfigJson.compilerOptions,
      // build options to tell the transformer where to output the generated
      buildOptions: {
        debug: !!context.opts.dbg,
        dtDir: `${context.opts.stagingPath}/${configPaths.src.typescript}/${CONSTANTS.COMPONENTS_DT}`,
        version: '1.0.0',
        jetVersion: `^${util.getJETVersion()}`,
        templatePath: CONSTANTS.PATH_TO_CUSTOM_TSC_TEMPLATES,
        tsBuiltDir: `${context.opts.stagingPath}/${configPaths.src.javascript}/${configPaths.composites}`,
        mainEntryFile: 'loader.d.ts',
        typesDir: `${context.opts.stagingPath}/${configPaths.src.javascript}/${configPaths.composites}`
      }
    };
    const { errors } = CustomTypescriptCompiler.compile(compileOptions);
    if (errors.length) {
      // eslint-disable-next-line no-param-reassign
      context.opts.typescript.compilationFailed = true;
      errors.forEach((error) => {
        // only log the path starting from the staging folder i.e no need
        // for the absolute path that includes the app name since the cwd
        // is the app
        const indexOfStagingFolder = error.indexOf(`/${context.opts.stagingPath}/`);
        const formattedError = error.substring(indexOfStagingFolder + 1);
        util.log(`Typescript Error: ${formattedError}`);
      });
    }
    resolve(context);
  });
}

/**
 * ## _copyTypescriptComponentFilesToJSFolder
 *
 * Copies runtime resources from <staging>/ts/jet-composites
 * to <staging>/js/jet-composities folder. Transpiled JS files
 * are copied during compilation
 *
 * @private
 * @param {object} options
 * @param {object} options.context
 * @param {string} options.pack
 * @param {string} options.component
 * @returns {Promise<object>} promise that resolves with build context
 */
function _copyTypescriptComponentFilesToJSFolder({ context, pack, component }) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const stagingPath = context.opts.stagingPath;
    const typescriptFolder = configPaths.src.typescript;
    const javascriptFolder = configPaths.src.javascript;
    const componentName = pack ? `${pack}-${component}` : component;
    const componentSrc = util.generatePathToComponentRoot({
      pack,
      component,
      root: stagingPath,
      scripts: typescriptFolder
    });
    const componentDest = util.generatePathToComponentRoot({
      pack,
      component,
      root: stagingPath,
      scripts: javascriptFolder
    });
    const files = glob.sync('**/*', {
      cwd: componentSrc,
      nodir: true,
      ignore: ['**/*.ts', '**/*.tsx']
    });
    files.forEach((file) => {
      fs.copySync(
        path.join(componentSrc, file),
        path.join(componentDest, file)
      );
    });
    if (files.length) {
      util.log(`Copied ${componentName} runtime resources from ${componentSrc} to ${componentDest}`);
    }
    resolve(context);
  });
}

/**
 * ## _copyTypescriptApplicationFilesToJSFolder
 *
 * Copies runtime resources from <staging>/ts to
 * <staging>/js/. Transpiled JS files are copied
 * during compilation
 *
 * @private
 * @param {object} options.context build context
 * @returns {Promise} promise that resolves with build context
 */
function _copyTypescriptApplicationFilesToJSFolder({ context }) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const typescriptFolder = configPaths.src.typescript;
    const javascriptFolder = configPaths.src.javascript;
    const applicationSrc = path.join(
      context.opts.stagingPath,
      typescriptFolder
    );
    const applicationDest = path.join(
      context.opts.stagingPath,
      javascriptFolder
    );
    const files = glob.sync('**/*', {
      cwd: applicationSrc,
      nodir: true,
      ignore: ['**/*.ts', '**/*.tsx', '**/components_dt/**']
    });
    files.forEach((file) => {
      fs.copySync(
        path.join(applicationSrc, file),
        path.join(applicationDest, file)
      );
    });
    if (files.length) {
      util.log(`Copied runtime resources from /${typescriptFolder} to /${javascriptFolder}`);
    }
    resolve(context);
  });
}

/**
 * ## _copyVComponentComponentJsonToJs
 *
 * Copies *.json files generated into <staging>/ts/components_dt
 * by the custom typescript compiler. The *.json files have the name
 * and version of the associated vcomponent so we can use that to rename
 * them to component.json and copy them into vcomponents js location
 *
 * @private
 * @param {object} options.context build context
 * @returns {Promise<object>} promise that resolves with build context
 */
function _copyVComponentComponentJsonToJs({ context }) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const componentsDtBaseSrcPath = util.pathJoin(
      context.opts.stagingPath,
      configPaths.src.typescript,
      CONSTANTS.COMPONENTS_DT,
    );
    const { pack, component } = context.opts.typescript;
    let files = [];
    if (component) {
      if (context.serving && util.isVComponent({ pack, component })) {
        // changed component during "ojet serve", is a singleton or pack vcomponent
        const componentJsonPath = path.join(componentsDtBaseSrcPath, `${pack ? `${pack}-` : ''}${component}.json`);
        if (util.fsExistsSync(componentJsonPath)) {
          files.push(componentJsonPath);
        } else {
          util.log.warning(`${componentJsonPath} does not exist`);
        }
      } else if (!context.serving) {
        // running "ojet build component" which builds a singleton or pack component
        if (util.isJETPack({ pack: component })) {
          // is a pack, check if it contains vcomponents
          util.getVComponentsInJETPack({ pack: component }).forEach((vcomponent) => {
            const componentJsonPath = path.join(componentsDtBaseSrcPath, `${component}-${vcomponent}.json`);
            if (util.fsExistsSync(componentJsonPath)) {
              files.push(componentJsonPath);
            } else {
              util.log.error(`${componentJsonPath} does not exist`);
            }
          });
        } else if (util.isVComponent({ component })) {
          // is a singleton vcomponent
          const componentJsonPath = path.join(componentsDtBaseSrcPath, `${component}.json`);
          if (util.fsExistsSync(componentJsonPath)) {
            files.push(componentJsonPath);
          } else {
            util.log.error(`${componentJsonPath} does not exist`);
          }
        }
      }
    } else {
      // get all *.json files in components_dt
      files = glob.sync(path.join(componentsDtBaseSrcPath, '*.json'));
    }
    if (files.length) {
      files.forEach((filepath) => {
        const componentJson = util.readJsonAndReturnObject(filepath);
        if (util.hasProperty(componentJson, 'pack')) {
          componentJson.name = componentJson.name.replace(`${componentJson.pack}-`, '');
        }
        const componentJsonDestPath = path.join(
          util.generatePathToComponentRoot({
            pack: componentJson.pack,
            component: componentJson.name,
            root: context.opts.stagingPath,
            scripts: configPaths.src.javascript
          }),
          CONSTANTS.JET_COMPONENT_JSON
        );
        util.writeObjectAsJsonFile(componentJsonDestPath, componentJson);
        util.log(`Copied ${filepath} to ${componentJsonDestPath}`);
      });
    }
    resolve(context);
  });
}

/**
 * ## _organizeComponentsTypeDefinitions
 *
 * Organize the generated *.d.ts into component's
 * types folder for distribution
 *
 * @private
 * @param {object} options.context build context
 * @returns {Promise<object>} promise that resolves with build context
 */
function _organizeComponentsTypeDefinitions({ context }) {
  return new Promise((resolve) => {
    // only organize type definition files if declaration option
    // set to true
    const typescriptOptions = context.opts.typescript;
    if (typescriptOptions.tsconfigJson.compilerOptions.declaration) {
      const componentsCache = util.getComponentsCache();
      const { pack, component } = typescriptOptions;
      if (pack && component) {
        // only organize pack component's type definitions
        const componentCache = componentsCache[`${pack}-${component}`];
        if (componentCache &&
          (componentCache.isTypescriptComponent || componentCache.isVComponent)) {
          _organizePackComponentTypeDefinitions({ context, pack, component });
        }
      } else if (component) {
        // component can either be a singleton or a pack
        const componentCache = componentsCache[component];
        if (componentCache && componentCache.componentJson.type === 'pack') {
          // component is pack (build initiated by ojet build component <component>)
          Object.keys(componentsCache)
            .filter((fullComponentName) => {
              const hasPackPrefix = fullComponentName.startsWith(component);
              return hasPackPrefix && fullComponentName !== component;
            }).forEach((fullComponentName) => {
              const {
                isTypescriptComponent,
                isVComponent,
                componentJson
              } = componentsCache[fullComponentName];
              if (isTypescriptComponent || isVComponent) {
                _organizePackComponentTypeDefinitions({
                  context,
                  pack: componentJson.pack,
                  component: componentJson.name
                });
              }
            });
        } else if (componentCache &&
          componentCache.componentJson.type !== 'pack' &&
          (componentCache.isTypescriptComponent || componentCache.isVComponent)) {
          // component is a singleton
          _organizeSingletonComponentTypeDefinitions({ context, component });
        }
      } else {
        // organize the type definitions of all components
        Object.keys(componentsCache).forEach((fullComponentName) => {
          const componentCache = componentsCache[fullComponentName];
          if (componentCache &&
            (componentCache.isTypescriptComponent || componentCache.isVComponent)) {
            const { componentJson } = componentCache;
            if (componentJson.pack) {
              _organizePackComponentTypeDefinitions({
                context,
                pack: componentJson.pack,
                component: componentJson.name
              });
            } else if (componentJson.type !== 'pack') {
              _organizeSingletonComponentTypeDefinitions({
                context,
                component: componentJson.name
              });
            }
          }
        });
      }
    }
    resolve(context);
  });
}

/**
 * ## _organizePackComponentTypeDefinitions
 *
 * Organizes type definitiosn of a pack component
 *
 * @private
 * @param {object} options
 * @param {object} options.context
 * @param {string} options.pack
 * @param {string} options.component
 */
function _organizePackComponentTypeDefinitions({ context, pack, component }) {
  const configPaths = util.getConfiguredPaths();
  const builtComponentPath = util.generatePathToComponentRoot({
    pack,
    component,
    root: context.opts.stagingPath,
    scripts: configPaths.src.javascript
  });
  const builtPackPath = util.generatePathToComponentRoot({
    component: pack,
    root: context.opts.stagingPath,
    scripts: configPaths.src.javascript
  });
  _organizeComponentTypeDefinition({ builtComponentPath });
  const builtComponentTypesPath = path.join(builtComponentPath, 'types');
  if (util.fsExistsSync(builtComponentTypesPath)) {
    // if a /types folder was created, move it up to the pack's
    // /types folder
    fs.moveSync(
      builtComponentTypesPath,
      path.join(builtPackPath, 'types', component)
    );
    util.log(`Created types folder for ${pack}-${component}`);
  }
}

/**
 * ## _organizeSingletonComponentTypeDefinitions
 *
 * Organizes type definitiosn of a pack component
 *
 * @private
 * @param {object} options
 * @param {object} options.context
 * @param {string} options.component
 */
function _organizeSingletonComponentTypeDefinitions({ context, component }) {
  const configPaths = util.getConfiguredPaths();
  const builtComponentPath = util.generatePathToComponentRoot({
    component,
    root: context.opts.stagingPath,
    scripts: configPaths.src.javascript
  });
  _organizeComponentTypeDefinition({ builtComponentPath });
  if (util.fsExistsSync(path.join(builtComponentPath, 'types'))) {
    util.log(`Created types folder for ${component}`);
  }
}

/**
 * ## _organizeComponentTypeDefinitions
 *
 * Base method for organizing type definitiosn of a component
 *
 * @private
 * @param {object} options
 * @param {string} options.builtComponentPath
 */
function _organizeComponentTypeDefinition({ builtComponentPath }) {
  const componentTypesFolder = path.join(builtComponentPath, 'types');
  if (util.fsExistsSync(componentTypesFolder)) {
    // get all *.d.ts files not in types or min (release build)
    glob.sync(
      path.join(builtComponentPath, '**/*.d.ts'),
      { ignore: ['**/types/**', '**/min/**'] }
    ).forEach((filePath) => {
      // loop through found *.d.ts files
      if (util.fsExistsSync(path.join(
        componentTypesFolder,
        path.relative(builtComponentPath, filePath)
      ))) {
        // already exists in types folder, delete
        fs.removeSync(filePath);
      } else if (path.basename(filePath).startsWith('exports_')) {
        // speciall build time resource generated by custom-tsc, delete
        fs.removeSync(filePath);
      } else {
        // not in types folder, move into
        fs.moveSync(filePath, path.join(
          componentTypesFolder,
          path.relative(builtComponentPath, filePath)
        ));
      }
    });
  } else {
    // get all *.d.ts files not in min (release build)
    glob.sync(
      path.join(builtComponentPath, '**/*.d.ts'),
      { ignore: ['**/min/**'] }
    ).forEach((filePath) => {
      // copy *.d.ts files to types folder
      fs.moveSync(filePath, path.join(
        componentTypesFolder,
        path.relative(builtComponentPath, filePath)
      ));
    });
  }
}


/**
 * ## _runIfTypescriptCompilationSucceeded
 *
 * Run the given task with the provided parameters if the
 * typescript compilation completed successfully. Otherwise.
 * resolve immediately with the build context
 *
 * @private
 * @param {object} context build context
 * @param {Function} task task to run
 * @returns {Promise<object>} promise that resolves with build context
 */
function _runIfTypescriptCompilationSucceeded(context, task, ...parameters) {
  const typescriptOptions = context.opts.typescript;
  if (
    typescriptOptions.compilationFailed ||
    (context.serving && typescriptOptions.type === 'application')
  ) {
    // don't run task if the compilation failed or if we are processing
    // a none-component app file during "ojet serve". for the latter,
    // the only thing we need to do is compile the file
    return Promise.resolve(context);
  }
  return task(...parameters);
}

/**
 * ## _logTypescriptCompilationResult
 *
 * Log the typescript compilation result. If there
 * was a typescript compilation failure and we are not
 * serving, log the error and exit the process. Otherwise
 * just log the error and continue serving
 *
 * @private
 * @param {Object} context build context
 * @param {string} logPrefix message prefix
 * @returns {Promise} promise that resolves with build context
 */
function _logTypescriptCompliationResult(context, logPrefix) {
  const typescriptOptions = context.opts.typescript;
  const serving = context.serving;
  if (typescriptOptions.compilationFailed) {
    if (serving) {
      util.log(`${logPrefix} failed`);
    } else {
      util.log.error(`${logPrefix} failed`);
    }
  } else {
    util.log(`${logPrefix} finished`);
  }
  return Promise.resolve(context);
}

/**
 * ## cleanTypescript
 *
 * Delete typescript resources in staging folder
 *
 * @public
 * @param {object} context
 * @returns {Promise<object>}
 */
function cleanTypescript(context) {
  if (util.shouldNotRunTypescriptTasks(context)) {
    return Promise.resolve(context);
  }
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    util.log('Cleaning Typescript staging directory');
    // delete staging/ts folder
    fs.removeSync(path.join(context.opts.stagingPath, configPaths.src.typescript));
    // delete *.d.ts in staging/js folder
    glob.sync(
      path.join(context.opts.stagingPath, configPaths.src.javascript, '**/*.d.ts'),
      { ignore: ['**/libs/**', `**/${configPaths.composites}/**`] }
    ).forEach((filePath) => {
      fs.removeSync(filePath);
    });
    // delete *.d.ts in staging/js/jet-composites/*/min
    glob.sync(
      path.join(context.opts.stagingPath, configPaths.src.javascript, configPaths.composites, '**/min/**/*.d.ts'),
    ).forEach((filePath) => {
      fs.removeSync(filePath);
    });
    util.log('Cleaning Typescript staging directory finished');
    resolve(context);
  });
}

module.exports = {
  compileComponentTypescript,
  compileApplicationTypescript,
  cleanTypescript
};
