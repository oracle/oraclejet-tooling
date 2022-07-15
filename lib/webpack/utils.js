/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const glob = require('glob');
const fs = require('fs-extra');
const ojetUtils = require('../util');

const configPaths = ojetUtils.getConfiguredPaths();
const exchangeComponentsPath = path.resolve(configPaths.exchangeComponents);
const localComponentsPath = path.resolve(
  configPaths.src.common,
  configPaths.src.typescript,
  configPaths.components
);
const oracleJetDistPath = path.join(ojetUtils.getOraclejetPath(), 'dist');
const oracleJetDistCssPath = path.join(oracleJetDistPath, 'css');
const oracleJetDistJsLibsPath = path.join(oracleJetDistPath, 'js/libs');
const pathToSrcHTML = path.resolve(configPaths.src.common, 'index.html');
const pathToTempSrcHTML = path.resolve(configPaths.src.common, 'temp-index.html');
// eslint-disable-next-line no-useless-escape
const htmlTokenPattern = /(<!--\s*|@@)(css|js|img|injector):([\w-\/]+)(\s*-->)?/g;
// eslint-disable-next-line no-useless-escape
const htmlEndInjectorTokenPattern = /(<!--\s*|@@)([\w\/]+)(\s*-->)/g;
const htmlTokenResources = {
  css: {
    redwood: `./${configPaths.src.styles}/redwood/oj-redwood-min.css`,
  },
  injector: {
    theme: `./${configPaths.src.styles}/redwood/oj-redwood-min.css`,
  }
};
const htmlTokenTEmplates = {
  css: '<link rel="stylesheet" type="text/css" href="%s">',
  injector: '<link rel="stylesheet" type="text/css" href="%s">'
};
// eslint-disable-next-line no-unused-vars
function htmlTokenReplacementFunction(match, $1, type, file, $4, index, input) {
  // those formal parameters could be:
  // match: <-- css:bootstrap-->
  // type: css
  // file: redwood
  // Then fetch css link from some resource object
  // var url = resources['css']['redwood']

  // Replace <!-- endinjector --> with empty string:
  if (type === 'endinjector') {
    return '';
  }
  // Replace <!-- injector:scripts --> with empty string, too.
  // We do not need this injector since webpack automatically
  // injects the required file link:
  if (type === 'injector' && file === 'scripts') {
    return '';
  }
  const url = htmlTokenResources[type][file];
  // $1==='@@' <--EQ--> $4===undefined
  return ($4 === undefined ? url : htmlTokenTEmplates[type].replace('%s', url));
}

function isWebComponent(resourcePath) {
  let component;
  const normalizedResourcePath = path.normalize(resourcePath);
  if (normalizedResourcePath.startsWith(exchangeComponentsPath)) {
    component = path.relative(exchangeComponentsPath, normalizedResourcePath).split(path.sep)[0];
  } else if (normalizedResourcePath.startsWith(localComponentsPath)) {
    component = path.relative(localComponentsPath, normalizedResourcePath).split(path.sep)[0];
  }
  return component === undefined ? false : !!ojetUtils.getComponentsCache()[component];
}

function makeTempSrcIndexHTML() {
  fs.copyFileSync(pathToSrcHTML, pathToTempSrcHTML);
}

function deleteTempSrcIndexHTML() {
  // Restore the original index.html in src before deleting temp-index.html:
  fs.copyFileSync(pathToTempSrcHTML, pathToSrcHTML);
  fs.removeSync(pathToTempSrcHTML);
}

function modifySrcIndexHTML() {
  let htmlContent = fs.readFileSync(pathToSrcHTML, {
    encoding: 'utf8'
  });
  // Same link tag will be used for replacing the matched comment tags below.
  // The link is <link rel="stylesheet" type="text/css" href="./css/redwood/oj-redwood-min.css">:
  const redwoodMinPath = htmlTokenReplacementFunction(undefined, undefined, 'css', 'redwood', '-->', undefined);

  // Replace <!-- css:redwood --> with link to redwood-min.css:
  // eslint-disable-next-line no-useless-escape
  const regexCSS = /(<!--\s*|@@)(css|js|img):([\w\/]+)(\s*-->)?/g;
  htmlContent = htmlContent.replace(regexCSS, redwoodMinPath);

  // Replace <!-- injector:theme --> with link to redwood-min.css, too, if present:
  // eslint-disable-next-line no-useless-escape
  const regexInjector = /(<!--\s*|@@)(injector):theme(\s*-->)?/g;
  htmlContent = htmlContent.replace(regexInjector, redwoodMinPath);

  // Note: No need to delete/replace <!-- injector:scripts --> and <!-- endinjector -->
  // with empty string: these are going to be delete by the webpack plugin anyway.
  fs.writeFileSync(pathToSrcHTML, htmlContent);
}

function organizeTypeDefinitions() {
  const tsFilesTypesFolder = path.resolve(configPaths.staging.stagingPath, 'types');
  ojetUtils.ensureDir(tsFilesTypesFolder);
  if (fs.existsSync(tsFilesTypesFolder)) {
    // get all *.d.ts files not in types or min (release build)
    glob.sync(
      path.join(configPaths.src.common, '**/*.d.ts'), {
        ignore: ['**/types/**', '**/min/**']
      }
    ).forEach((filePath) => {
      // loop through found *.d.ts files
      if (ojetUtils.fsExistsSync(path.join(
        tsFilesTypesFolder,
        path.relative(configPaths.src.common, filePath)
      ))) {
        // already exists in types folder, delete
        fs.removeSync(filePath);
      } else if (path.basename(filePath).startsWith('exports_')) {
        // special build time resource generated by custom-tsc, delete
        fs.removeSync(filePath);
      } else {
        // not in types folder, move into
        fs.moveSync(filePath, path.join(
          tsFilesTypesFolder,
          path.relative(configPaths.src.common, filePath)
        ));
      }
    });
  }
}

function getEntryFilePath() {
  if (ojetUtils.isVDOMApplication()) {
    return path.resolve(configPaths.src.common, 'index.ts');
  }
  if (ojetUtils.isTypescriptApplication()) {
    return path.resolve(configPaths.src.common, 'ts', 'root.ts');
  }
  return path.resolve(configPaths.src.common, 'js', 'root.js');
}

function getRootPath() {
  if (ojetUtils.isVDOMApplication()) {
    return path.resolve(configPaths.staging.web,
      configPaths.src.javascript);
  }
  if (ojetUtils.isTypescriptApplication()) {
    return path.resolve(configPaths.src.common,
      configPaths.src.typescript);
  }
  return path.resolve(configPaths.src.common,
    configPaths.src.javascript);
}

module.exports = {
  isWebComponent,
  localComponentsPath,
  exchangeComponentsPath,
  oracleJetDistPath,
  oracleJetDistCssPath,
  oracleJetDistJsLibsPath,
  htmlTokenPattern,
  htmlEndInjectorTokenPattern,
  htmlTokenReplacementFunction,
  getEntryFilePath,
  makeTempSrcIndexHTML,
  deleteTempSrcIndexHTML,
  modifySrcIndexHTML,
  organizeTypeDefinitions,
  getRootPath
};
