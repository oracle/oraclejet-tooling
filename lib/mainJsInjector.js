/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
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

function _replaceReleasePath(buildType, config) {
  let injectContent = _getInjectContent(buildType, config.mainPathJSON);
  injectContent = injectContent.replace(/'/g, '"');
  injectContent = injectContent.replace(/\\/g, '/');

  const injectSrc = _getInjectSource(config.mainJs);
  const startTag = config.startTag;
  const endTag = config.endTag;
  const pattern = injectorUtil.getInjectorTagsRegExp(startTag, endTag);
  const lineEnding = /\r\n/.test(String(injectSrc)) ? '\r\n' : '\n';

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

  return new Promise((resolve, reject) => {
    let destDir = (buildType === 'release') ? config.destMainJs : config.mainJs;
    destDir = util.destPath(destDir);

    const injectedContent = _replaceReleasePath(buildType, config);

    fs.outputFile(destDir, injectedContent, (err) => {
      if (err) reject(err);
      resolve(config);
    });
  });
}


function _getMainPathJSON(context) {
  const config = context.opts.injectPaths;
  const newContext = context;
  return new Promise((resolve, reject) => {
    let mainPathJSON = '';
    if (context.buildType === 'release')
    {
      if (context.platform === 'windows')
      {
        mainPathJSON = util.destPath(config.mainReleasePathsWindows);
      }
      else
      {
        mainPathJSON = util.destPath(config.mainReleasePaths)
      }
    }
    else if (context.platform === 'windows')
    {
      mainPathJSON = util.destPath(config.mainDebugPathsWindows);
    }
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
  });
}


module.exports = {
  injectPaths: function _injectpaths(context) {
    return new Promise((resolve, reject) => {
      if (context.buildType !== 'release' && context.platform !== 'windows') {
        resolve(context);
      } else {
        try {
          _getMainPathJSON(context)
          .then(_writeRequirePathToFile)
          .then(() => {
            resolve(context);
          });
        } catch (error) {
          reject(error);
        }
      }
    });
  },
};
