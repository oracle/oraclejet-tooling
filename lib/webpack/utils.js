/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
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
// eslint-disable-next-line no-useless-escape
const htmlTokenPattern = /(<!--\s*|@@)(css|js|img):([\w-\/]+)(\s*-->)?/g;
const htmlTokenResources = {
  css: {
    redwood: './styles/redwood/oj-redwood-min.css'
  }
};
const htmlTokenTEmplates = {
  css: '<link rel="stylesheet" type="text/css" href="%s">'
};
// eslint-disable-next-line no-unused-vars
function htmlTokenReplacementFunction(match, $1, type, file, $4, index, input) {
  // those formal parameters could be:
  // match: <-- css:bootstrap-->
  // type: css
  // file: redwood
  // Then fetch css link from some resource object
  // var url = resources['css']['redwood']
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

function injectRedwoodThemeFileLink(context) {
  if (context.opts.theme.name === 'redwood') {
    const htmlContent = fs.readFileSync(pathToSrcHTML, { encoding: 'utf8' });
    // eslint-disable-next-line no-useless-escape
    const regex = new RegExp(/(<!--\s*|@@)(css|js|img):([\w\/]+)(\s*-->)?/, 'g');
    const redwoodMinPath = htmlTokenReplacementFunction(undefined, undefined, 'css', 'redwood', '-->', undefined);
    fs.writeFileSync(pathToSrcHTML, htmlContent.replace(regex, redwoodMinPath));
  }
}

function restoreRedwoodTag(context) {
  if (context.buildType === 'release') {
    // eslint-disable-next-line quotes
    const regex = new RegExp(/<link\s.*redwood-min.css">/, 'g');
    const htmlContent = fs.readFileSync(pathToSrcHTML, { encoding: 'utf8' });
    fs.writeFileSync(pathToSrcHTML, htmlContent.replace(regex, '<!-- css:redwood -->'));
  }
}

module.exports = {
  isWebComponent,
  localComponentsPath,
  exchangeComponentsPath,
  oracleJetDistPath,
  oracleJetDistCssPath,
  oracleJetDistJsLibsPath,
  htmlTokenPattern,
  htmlTokenReplacementFunction,
  injectRedwoodThemeFileLink,
  restoreRedwoodTag
};
