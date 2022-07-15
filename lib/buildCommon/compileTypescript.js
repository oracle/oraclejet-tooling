/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
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
    configPaths.components,
  );
  const componentsJavascriptBasePath = util.pathJoin(
    '.',
    context.opts.stagingPath,
    configPaths.src.javascript,
    configPaths.components,
  );
  const componentTypescriptPath = util.pathJoin(
    '.',
    ...util.generatePathToComponentRoot({
      context,
      pack,
      component,
      root: context.opts.stagingPath,
      scripts: configPaths.src.typescript
    }).split(path.sep)
  );
  // add component typescript options to build context options
  const typescriptOptions = context.opts.typescript || {};
  // if present, only compile the file that has changed (ojet serve)
  // otherwise compile all files in component
  const include = typescriptOptions.file ?
    [
      util.pathJoin('.', ...typescriptOptions.file.split(path.sep))
    ] :
    [
      `${componentTypescriptPath}/**/*.ts`,
      `${componentTypescriptPath}/**/*.tsx`
    ];
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = {
    type: 'component',
    tsconfigJson: {
      include,
      exclude: CONSTANTS.JEST_TEST_FILE_AND_LIBS_GLOBS.map(testFileGlob => (
        `${componentTypescriptPath}/${testFileGlob}`
      )),
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
    () => _runTypescriptCompilation({ context, pack, component }),
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
    // delete components_dt after copying component.json files
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _deleteVComponentComponentsDt,
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
  // if present, only compile the file that has changed (ojet serve)
  // otherwise compile all files in application
  const include = typescriptOptions.file ?
    [
      util.pathJoin('.', ...typescriptOptions.file.split(path.sep))
    ] :
    [
      `${applicationTypescriptPath}/**/*.ts`,
      `${applicationTypescriptPath}/**/*.tsx`,
    ];
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = {
    type: 'application',
    tsconfigJson: {
      include,
      exclude: CONSTANTS.JEST_TEST_FILE_AND_LIBS_GLOBS.map(testFileGlob => (
        `${applicationTypescriptPath}/${testFileGlob}`
      )),
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
    () => _runTypescriptCompilation({ context }),
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
    // delete components_dt after copying component.json files
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _deleteVComponentComponentsDt,
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
    const configPaths = util.getConfiguredPaths();
    const tsconfigJson = util.readJsonAndReturnObject(CONSTANTS.TSCONFIG);
    const typescriptOptions = context.opts.typescript;
    const typescriptOptionsTsconfig = typescriptOptions.tsconfigJson;
    // setup tsconfig.json
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.include = typescriptOptionsTsconfig.include;
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.exclude = typescriptOptionsTsconfig.exclude;
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.sourceMap = context.buildType === 'dev';
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.paths = {
      [`${configPaths.components}/*`]: [util.pathJoin(
        '.',
        context.opts.stagingPath,
        configPaths.src.typescript,
        configPaths.components,
        '*'
      )],
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
function _runTypescriptCompilation({ context, pack, component }) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const { tsconfigJson } = context.opts.typescript;
    // eslint-disable-next-line max-len
    const customCompiler = path.join(util.getOraclejetPath(), CONSTANTS.PATH_TO_CUSTOM_TSC);
    // eslint-disable-next-line max-len
    // eslint-disable-next-line global-require, import/newline-after-import, import/no-dynamic-require
    const CustomTypescriptCompiler = require(customCompiler);

    let apiDocDir;
    const components = path.join(context.opts.stagingPath, configPaths.src.javascript,
      configPaths.components);
    if (component && pack) {
      apiDocDir = path.join(components, pack, component);
    } else if (component) {
      apiDocDir = path.join(components, component);
    } else {
      apiDocDir = null;
    }
    // For component(s) in a pack, the version number is between the pack and component:
    if (apiDocDir && !context.opts[CONSTANTS.OMIT_COMPONENT_VERSION_FLAG]) {
      const componentVersion = util.getComponentVersion({ pack, component });
      if (component && pack) {
        apiDocDir = path.join(components, pack, componentVersion, component);
      } else if (component) {
        apiDocDir = path.join(apiDocDir, componentVersion);
      }
    }
    const compileOptions = {
      // tsconfig JSON to use for compilation
      tsconfigJson,
      // Build options - tell the transformer where to output the generated
      // Initialize version and jetVersion to the empty string,
      // providing indicators for deriving missing versions for pack components.
      // Missing version/jetVersion information is derived after typescript
      // compilation in _copyVComponentComponentJsonToJs().
      buildOptions: {
        debug: !!context.opts.dbg,
        dtDir: `${context.opts.stagingPath}/${configPaths.src.typescript}/${CONSTANTS.COMPONENTS_DT}`,
        apiDocDir,
        version: '',
        jetVersion: '',
        templatePath: path.join(
          util.getOraclejetPath(),
          CONSTANTS.PATH_TO_CUSTOM_TSC_TEMPLATES
        ),
        tsBuiltDir: `${context.opts.stagingPath}/${configPaths.src.javascript}/${configPaths.components}`,
        mainEntryFile: 'loader.d.ts',
        typesDir: `${context.opts.stagingPath}/${configPaths.src.javascript}/${configPaths.components}`
      }
    };

    const { errors, parsedTsconfigJson } = CustomTypescriptCompiler.compile(compileOptions);
    // Replace tsconfigJson with version used by custom-tsc. This is needed if the tsconfigJson
    // had inherited properties from other tsconfig.json files via the "extends" option.
    // The version returned by custom-tsc contains all the local and inherited options and
    // the full list of files that were compiled
    // eslint-disable-next-line no-param-reassign
    context.opts.typescript.tsconfigJson = parsedTsconfigJson;
    if (errors.length) {
      // eslint-disable-next-line no-param-reassign
      context.opts.typescript.compilationFailed = true;
      errors.forEach((error) => {
        let errorMessage;
        if (typeof error === 'string') {
          // error is a Typescript error string. only log the path starting from the staging folder
          // i.e no need for the absolute path that includes the app name since the cwd
          // is the app
          const indexOfStagingFolder = error.indexOf(`/${context.opts.stagingPath}/`);
          errorMessage = error.substring(indexOfStagingFolder + 1);
        } else {
          // error is a TransformerError object
          errorMessage = error.toString();
        }
        util.log(`Typescript Error: ${errorMessage}`);
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
      context,
      pack,
      component,
      root: stagingPath,
      scripts: typescriptFolder
    });
    const componentDest = util.generatePathToComponentRoot({
      context,
      pack,
      component,
      root: stagingPath,
      scripts: javascriptFolder
    });
    if (componentSrc !== componentDest) {
      const files = glob.sync('**', {
        cwd: componentSrc,
        nodir: true,
        ignore: ['**/*.ts', '**/*.tsx']
      });
      if (files.length) {
        files.forEach((file) => {
          fs.copySync(
            path.join(componentSrc, file),
            path.join(componentDest, file)
          );
        });
        util.log(`Copied ${componentName} runtime resources from ${componentSrc} to ${componentDest}`);
      }
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
    const stagingPath = context.opts.stagingPath;
    const typescriptFolder = configPaths.src.typescript;
    const javascriptFolder = configPaths.src.javascript;
    const applicationSrc = path.join(
      stagingPath,
      typescriptFolder
    );
    const applicationDest = path.join(
      stagingPath,
      javascriptFolder
    );
    if (applicationSrc !== applicationDest) {
      const files = glob.sync('**/*', {
        cwd: applicationSrc,
        nodir: true,
        ignore: ['**/*.ts', '**/*.tsx', '**/components_dt/**']
      });
      if (files.length) {
        files.forEach((file) => {
          fs.copySync(
            path.join(applicationSrc, file),
            path.join(applicationDest, file)
          );
        });
        util.log(`Copied runtime resources from /${typescriptFolder} to /${javascriptFolder}`);
      }
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
    if (fs.existsSync(componentsDtBaseSrcPath)) {
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
      files.forEach((filepath) => {
        let componentJson = util.readJsonAndReturnObject(filepath);
        const componentsCache = util.getComponentsCache();
        // VDOM architecture supports components where the component.json is not needed.
        // For example, we can have src/components/app.tsx which contains a custom element
        // vcomponent used to define the HTML of the app. Because it is a custom element vcomponent,
        // the compiler will create a *.json file for it in components_dt
        // but we don't care about it. We verify this
        // by checking the cache which contains entries for all "valid" components
        // Due to change in component json generation by custom-tsc, if the simple
        // componentJson.name isn't found in the cache, then try the custom element
        // tag name (componentJson.pack-componentJson.name)
        const fullComponentName = (componentsCache[componentJson.name] || !componentJson.pack) ?
          componentJson.name : `${componentJson.pack}-${componentJson.name}`;

        if (componentsCache[fullComponentName]) {
          // Update component's component.json in cache
          componentsCache[fullComponentName].componentJson = {
            ...componentJson,
            ...componentsCache[fullComponentName].componentJson
          };
          componentJson = componentsCache[fullComponentName].componentJson;
          const componentJsonDestPath = path.join(
            util.generatePathToComponentRoot({
              context,
              pack: componentJson.pack,
              component: componentJson.name,
              root: context.opts.stagingPath,
              scripts: configPaths.src.javascript
            }),
            CONSTANTS.JET_COMPONENT_JSON
          );
          // TODO: in next major release, stop writing component.json since
          // it will be written after runAllComponentHooks
          util.writeObjectAsJsonFile(componentJsonDestPath, componentJson);
          util.log(`Copied ${filepath} to ${componentJsonDestPath}`);
        }
      });
    }
    resolve(context);
  });
}

function _deleteVComponentComponentsDt({ context }) {
  return new Promise((resolve) => {
    const configPaths = util.getConfiguredPaths();
    const pathToComponentsDt = util.pathJoin(
      context.opts.stagingPath,
      configPaths.src.typescript,
      CONSTANTS.COMPONENTS_DT,
    );
    if (fs.existsSync(pathToComponentsDt)) {
      fs.removeSync(pathToComponentsDt);
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
    context,
    pack,
    component,
    root: context.opts.stagingPath,
    scripts: configPaths.src.javascript
  });
  const builtPackPath = util.generatePathToComponentRoot({
    context,
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
      path.join(builtPackPath, 'types', component), { overwrite: true }
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
    context,
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
        // special build time resource generated by custom-tsc, delete
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
    util.log('Cleaning Typescript staging directory');
    const configPaths = util.getConfiguredPaths();
    const stagingPath = path.normalize(context.opts.stagingPath);
    const typescriptStagingPath = path.join(stagingPath, configPaths.src.typescript);
    const javascriptStagingPath = path.join(stagingPath, configPaths.src.javascript);
    let filePaths;
    if (stagingPath !== typescriptStagingPath) {
      filePaths = [
        // add <staging>/<ts>
        typescriptStagingPath,
        // add *.d.ts files in <staging>/<js>
        ...glob.sync(
          `${javascriptStagingPath}/**/*.d.ts`,
          { ignore: ['libs/**', '**/types/**'] }
        )
      ];
    } else {
      // add *.ts files in <staging>
      filePaths = glob.sync(
        `${stagingPath}/**/*.{ts,tsx}`,
        { ignore: ['libs/**', '**/types/**'] }
      );
    }
    if (filePaths.length) {
      filePaths.forEach((filePath) => {
        fs.removeSync(filePath);
      });
      util.log('Cleaning Typescript staging directory finished');
    }
    resolve(context);
  });
}

module.exports = {
  compileComponentTypescript,
  compileApplicationTypescript,
  cleanTypescript
};
