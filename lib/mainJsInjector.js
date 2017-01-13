/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const injectorUtil = require('./injectorUtil');

function _getInjectSource(mainJs) {
  return fs.readFileSync(mainJs, 'utf-8');
}

function _getInjectContent(buildType, mainPathJSON) {
  let injectCode = '\n{\n';
  for (const key in mainPathJSON) {
    const lib = mainPathJSON[key];
    injectCode += `  '${key}':'${lib}',\n`;
  }

  injectCode = injectCode.slice(0, -2);
  injectCode += '\n}\n';
  return injectCode;
}

function _replaceReleasePath(buildType, config, platform) {

  const injectSrc = _getInjectSource(config.mainJs);
  const startTag = config.startTag;
  const endTag = config.endTag;
  const pattern = injectorUtil.getInjectorTagsRegExp(startTag, endTag);
  const lineEnding = /\r\n/.test(String(injectSrc)) ? '\r\n' : '\n';
 
  let injectContent = '';

  if (config.mainPathJSON) {
    injectContent = _getInjectContent(buildType, config.mainPathJSON);
    injectContent = injectContent.replace(/'/g, '"');
    injectContent = injectContent.replace(/\\/g, '/');
  }
  else {
    // if no main path JSON, extract the requirejs config section from source
    let result = pattern.exec(injectSrc);
    injectContent = result[3];
  }
 
  if (platform === 'windows') {
    injectContent = _injectWindowsResourcePaths(injectContent);
  }

  // clear old content between injectors
  let injectResult = injectSrc.replace(pattern, () =>
    startTag + lineEnding + endTag
  );

   // actual injection
  injectResult = injectResult.replace(pattern, () =>
    startTag + lineEnding + injectContent + lineEnding + endTag
  );

  return injectResult;
}

function _writeRequirePathToFile(context) {
  const config = context.opts.injectPaths;
  const buildType = context.buildType;
  const platform = context.platform;

  return new Promise((resolve, reject) => {
    let destDir = (buildType === 'release') ? config.destMainJs : config.mainJs;
    destDir = util.destPath(destDir);

    let injectedContent = _replaceReleasePath(buildType, config, platform);

    fs.outputFile(destDir, injectedContent, (err) => {
      if (err) reject(err);
      resolve(config);
    });
  });
}

/**
 * _injectWindowsResourcePaths - adds extra resource path entries for windows
 * 
 * @param {string} content requirejs path config section
 * @return {string} updated content with windows resource paths
 */
function _injectWindowsResourcePaths(content) {
 
  const lineEnding = /\r\n/.test(String(content)) ? '\r\n' : '\n';
  const translationsPattern = /([\t ]*)('|")ojtranslations['"]\s*:\s*['"](.*?)['"],/gi;
  
  let result = translationsPattern.exec(content);
   
  if (!result) {
    // no match, return unchanged content
    return content;
  }
  
  const translationsEntry = result[0];
  const indentStr = result[1];
  const stringChar = result[2];
  const resourcesPath = result[3];
  
  let resourceEntries = translationsEntry + lineEnding
       + indentStr + _createResourceEntry(resourcesPath, stringChar, 'ojtranslations') + ',' + lineEnding
       + indentStr + _createResourceEntry(resourcesPath, stringChar, 'localeElements') + ',' + lineEnding
       + indentStr + _createResourceEntry(resourcesPath, stringChar, 'timezoneData') + ',';
   
  let newContent = content.replace(translationsEntry, resourceEntries);
  return newContent;
}
 
function _createResourceEntry(resourcesPath, stringChar, resource) {
  let entry = stringChar + 'ojtranslations/nls/' + resource + stringChar + ':'
            + stringChar + resourcesPath + '/root/' + resource + stringChar;
  return entry;
}

function _getMainPathJSON(context) {
  const config = context.opts.injectPaths;
  const newContext = context;
  return new Promise((resolve, reject) => {
    let mainPathJSON = '';
    if (context.buildType === 'release')
    {
      mainPathJSON = util.destPath(config.mainReleasePaths);
      fs.readJSON(mainPathJSON, (err, data) => {
        if (data === undefined) {
          reject(new Error(`JSON file corrupt ${mainPathJSON}`));
        } else if (err) {
          reject(err);
        } else {
          config.mainPathJSON = data;
          newContext.opts.injectPaths = config;
          resolve(newContext);
        }
      });
    }
    else {
      config.mainPathJSON = null;
      newContext.opts.injectPaths = config;
      resolve(newContext);
    }  
  });
}


module.exports = {
  injectPaths: function _injectpaths(context) {
    return new Promise((resolve, reject) => {
      try {
        _getMainPathJSON(context)
        .then(_writeRequirePathToFile)
        .then(() => {
          resolve(context);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
};
