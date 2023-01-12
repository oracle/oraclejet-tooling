/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const fs = require('fs-extra');
const { exec } = require('child_process');
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
    () => _renameIndexFileInMonoPack({ context }),
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
    // generate API documentation if vcomponent
    () => _runIfTypescriptCompilationSucceeded(
      context,
      _generateApiDocumentation,
      { context }
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
    // rename the index files in vcomponents in mono-packs
    () => _renameIndexFileInMonoPack({ context }),
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
 * ## _renameIndexFileInMonoPack
 *
 * renames the vcomponent index.ts file in a mono-pack to <componentName>.ts,
 * and copies it to the mono-pack root level:
 *
 * @private
 * @param {object} context - build context
 */
function _renameIndexFileInMonoPack({ context }) {
  const compositeComponents = context.opts.component ? [context.opts.component] :
    util.getLocalCompositeComponents();
  compositeComponents.forEach((compositeComponent) => {
    const componentJson = util.getComponentJson({ component: compositeComponent });
    if (componentJson.type && componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK) {
      const vComponentsInMonoPack = util.getVComponentsInJETPack({ pack: compositeComponent });
      vComponentsInMonoPack.forEach((vComponent) => {
        const pathToComponentInTsFolder = path.join(
          context.opts.stagingPath,
          'ts',
          context.paths.components,
          compositeComponent,
          context.opts[CONSTANTS.OMIT_COMPONENT_VERSION_FLAG] ? `${vComponent}` :
            path.join(componentJson.version, vComponent)
        );
        const pathToComponentWithoutTsFolder = path.join(
          context.opts.stagingPath,
          context.paths.components,
          compositeComponent,
          context.opts[CONSTANTS.OMIT_COMPONENT_VERSION_FLAG] ? `${vComponent}` :
            path.join(componentJson.version, vComponent)
        );
        const pathToComponentsInWeb = fs.existsSync(pathToComponentInTsFolder) ?
          pathToComponentInTsFolder : pathToComponentWithoutTsFolder;
        const pathToStubFile = `${pathToComponentsInWeb}.ts`;
        const indexFile = path.join(pathToComponentsInWeb, 'index.ts');
        if (!fs.existsSync(pathToStubFile) && fs.existsSync(indexFile)) {
          const indexFileContent = fs.readFileSync(indexFile, { encoding: 'utf-8' });
          fs.writeFileSync(
            pathToStubFile,
            indexFileContent.replace(`"./${vComponent}"`, `"./${vComponent}/${vComponent}"`)
          );
          fs.removeSync(indexFile);
        }
      });
    }
  });
  return Promise.resolve(context);
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
  if (typescriptOptionsTsconfig.compilerOptions.rootDir) {
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.rootDir = typescriptOptionsTsconfig.compilerOptions.rootDir;
  }
  if (typescriptOptionsTsconfig.compilerOptions.outDir) {
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.outDir = typescriptOptionsTsconfig.compilerOptions.outDir;
  }
  if (typescriptOptionsTsconfig.compilerOptions.strict) {
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.strict = typescriptOptionsTsconfig.compilerOptions.strict;
  }
  if (typescriptOptionsTsconfig.compilerOptions.removeComments) {
    // eslint-disable-next-line no-param-reassign
    tsconfigJson.compilerOptions.removeComments =
      typescriptOptionsTsconfig.compilerOptions.removeComments;
  }
  // setup typescript options for hook
  // eslint-disable-next-line no-param-reassign
  context.opts.typescript = { ...typescriptOptions, tsconfigJson };
  return Promise.resolve(context);
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
  return Promise.resolve(context);
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
  return Promise.resolve(context);
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
        // Update component's component.json in cache. Note that the order of the spread
        // operator changes depending on the type of the pack the component is part of.
        // For the mono-packs, there is an added implementation for JET-48251 that ensures
        // that the emitted metadata from the custom_tsc is corrected in case the annotated
        // ojmetadata properties values in the <componentName>.tsx have incorrect values.
        // Therefore, the corrected info in componentJson with the same keys  in it as in the cache
        // should take precedence in updating the componentCache. Otherwise, for non-mono-packs,
        // the data already in the cache should be the one referred to.
        const packName = componentsCache[fullComponentName].componentJson.pack;
        if (packName &&
            componentsCache[packName].componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK) {
          componentsCache[fullComponentName].componentJson = {
            ...componentsCache[fullComponentName].componentJson,
            ...componentJson,
          };
        } else {
          componentsCache[fullComponentName].componentJson = {
            ...componentJson,
            ...componentsCache[fullComponentName].componentJson,
          };
        }
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
  return Promise.resolve(context);
}

/**
 * ## _generateApiDocumentation
 *
 * Generates the vcomponent API docs
 *
 * @private
 * @param {object} options.context build context
 * @returns {Promise<object>} promise that resolves with build context
 */
function _generateApiDocumentation({ context }) {
  // eslint-disable-next-line consistent-return
  return new Promise((resolve, reject) => {
    let isVComponent;
    let componentName;
    let vComponentsInPack = [];
    const { component, pack } = context.opts.typescript;
    if (component && !pack) {
      // It might be the case that the passed component is a pack
      // or stand-alone component. Therefore, we need to check if
      // it's a pack with vcomponents or just a stand-alone vcomponent
      componentName = component;
      isVComponent = util.isVComponent({ component });
      if (util.isJETPack({ pack: component })) {
        vComponentsInPack = util.getVComponentsInJETPack({ pack: component });
      }
    } else if (component && pack) {
      // In this case, we have a component in a pack. Just retrieve
      // vcomponents in the pack to generate the docs for.
      componentName = pack;
      vComponentsInPack = util.getVComponentsInJETPack({ pack });
    }
    // The APIs should be generated for vcomponents only:
    if (util.hasJsdocInstalled() && (isVComponent || vComponentsInPack !== 0)) {
      if (isVComponent && vComponentsInPack.length === 0) {
        console.log(`Generating API docs for vcomponent ${component}.`);
      } else if (vComponentsInPack !== 0) {
        vComponentsInPack.forEach((vcomponent) => {
          console.log(`Generating API docs for vcomponent ${vcomponent} in ${pack}.`);
        });
      }
      const { command, templatesFolder } = _getExecCallParameters(context, componentName);
      exec(command, { cwd: templatesFolder }, (error) => {
        if (error) {
          console.error(`Unexpected error happened while generating the API Doc: ${error}`);
          return reject(error);
        }
        return resolve(context);
      });
    } else {
      // eslint-disable-next-line consistent-return
      return resolve(context);
    }
  });
}

/**
 * ## __getExecCallParameters
 *
 * Generates the parameters for jsdoc execution call
 *
 * @private
 * @param {string} component
 * @param {object} context
 * @returns {Object} containing path to config file and destination folder
 */
function _getExecCallParameters(context, component) {
  const srcPath = path.resolve(util.getComponentPath({ context, component, built: true }));
  const templatesFolder = path.resolve(util.getOraclejetPath(), CONSTANTS.PATH_TO_JSDOC);
  // Ensure that the destination folder is docs:
  const { pathToConfigFile, destPath } = _modifyConfigFileInStaging(srcPath, templatesFolder);
  const jsdocFile = path.join(process.cwd(), CONSTANTS.NODE_MODULES_DIRECTORY, 'jsdoc', 'jsdoc.js');
  const params = `"docletSource=${srcPath}&destination=${destPath}"`;
  const command = `node ${jsdocFile} -c ${pathToConfigFile} -q ${params}`;
  return { command, templatesFolder };
}

/**
 * ## _modifyConfigFileInStaging
 *
 * Ensure that the destination folder for the generated APIs is docs
 *
 * @private
 * @param {string} srcPath
 * @returns {Object} containing path to config file and destination folder
 */
function _modifyConfigFileInStaging(srcPath, templatesFolder) {
  let destPath;
  let pathToConfigFile;
  try {
    // Read the config file copied to staging:
    pathToConfigFile = path.join(templatesFolder, CONSTANTS.JSDOC_CONFIG_JSON);
    const configFileContent = fs.readJSONSync(pathToConfigFile);
    // Modify the config json to ensure the destination folder for generated files is docs:
    configFileContent.opts.destination = './docs';
    fs.writeJSONSync(pathToConfigFile, configFileContent, { encoding: 'utf-8' });
    // Create docs path in staging:
    destPath = path.join(srcPath, 'docs');
  } catch (error) {
    util.log.error(`Modifying config file staging failed with error: ${error}`);
  }
  return { pathToConfigFile, destPath };
}

function _deleteVComponentComponentsDt({ context }) {
  const configPaths = util.getConfiguredPaths();
  const pathToComponentsDt = util.pathJoin(
    context.opts.stagingPath,
    configPaths.src.typescript,
    CONSTANTS.COMPONENTS_DT,
  );
  if (fs.existsSync(pathToComponentsDt)) {
    fs.removeSync(pathToComponentsDt);
  }
  return Promise.resolve(context);
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
      if (componentCache && (componentCache.componentJson.type === 'pack' ||
            componentCache.componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK)) {
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
        componentCache.componentJson.type !== CONSTANTS.PACK_TYPE.MONO_PACK &&
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
          } else if (componentJson.type !== 'pack' && componentJson.type !== CONSTANTS.PACK_TYPE.MONO_PACK) {
            _organizeSingletonComponentTypeDefinitions({
              context,
              component: componentJson.name
            });
          }
        }
      });
    }
    // Go through the packs' root level and move any d.ts files of non-component pack's
    // content to the types folder.
    Object.keys(componentsCache).forEach((fullComponentName) => {
      const componentJson = componentsCache[fullComponentName].componentJson;
      if (componentJson && (componentJson.type === 'pack' || componentJson.type === 'mono-pack')) {
        _organizePackNonComponentTypeDefinitions({ context, pack: componentJson.name });
      }
    });
  }
  return Promise.resolve(context);
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
 * ## _organizePackNonComponentTypeDefinitions
 *
 * Organizes type definitions of non-component pack's
 * content since we now also allow processing of pack's fo-
 * lders which are not components. For normal packs, the
 * folders could be extension and/or utils while for
 * mono-packs any other needed by the pack or stub files.
 *
 * @private
 * @param {object} options.context
 * @param {string} options.pack
 */
function _organizePackNonComponentTypeDefinitions({ context, pack }) {
  const configPaths = util.getConfiguredPaths();
  const builtPackPath = util.generatePathToComponentRoot({
    context,
    component: pack,
    root: context.opts.stagingPath,
    scripts: configPaths.src.javascript
  });
  const componentTypesFolder = path.join(builtPackPath, 'types');
  if (fs.existsSync(componentTypesFolder)) {
    glob.sync(
      path.join(builtPackPath, '**/*.d.ts'),
      { ignore: ['**/types/**', '**/min/**'] }
    ).forEach((filePath) => {
      // copy *.d.ts files to types folder
      if (util.fsExistsSync(path.join(
        componentTypesFolder,
        path.relative(builtPackPath, filePath)
      ))) {
        // already exists in types folder, delete
        fs.removeSync(filePath);
      } else {
        // not in types folder, move into
        fs.moveSync(filePath, path.join(
          componentTypesFolder,
          path.relative(builtPackPath, filePath)
        ));
      }
    });
  } else {
    glob.sync(
      path.join(builtPackPath, '**/*.d.ts'),
      { ignore: ['**/min/**'] }
    ).forEach((filePath) => {
      // copy *.d.ts files to types folder
      fs.moveSync(filePath, path.join(
        componentTypesFolder,
        path.relative(builtPackPath, filePath)
      ));
    });
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
  return Promise.resolve(context);
}

module.exports = {
  compileComponentTypescript,
  compileApplicationTypescript,
  cleanTypescript
};
