/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
"use strict";

/**
 * # Dependencies
 */

/* 3rd party */
const fs = require("fs-extra"); 

/* Node.js native */
const path = require('path');

/* Oracle */
const config = require('./config');
const CONSTANTS = require("./constants");
const indexHtmlInjector = require("./indexHtmlInjector");
const mainJsInjector = require("./mainJsInjector");
const hookInjector = require("../hooks/jetInjector");
const util = require("./util");

/**
 * # serveHybrid file change procedure
 *
 * @private 
 * @param {string} action   - Change event name
 * @param {string} filePath - Path to the file
 * @param {string} target   - Watch 'job' name == watched folder
 */

module.exports = (action, filePath, target, buildContext) =>
{
  // console.log('File changed');
  // console.log('Action: ' + action);
  // console.log('Filepath: ' + filePath);
  // console.log('Target: ' + target);
  
  if (target === "sourceFiles")
  {
    /* From source directory to hybrid/www and platform directories */
    copyFileOver(filePath, buildContext);
  }
};

/**
 * ## copyFileOver
 *
 * @private 
 * @param {string} filePath - Path to the file
 * @param {object} buildContext - build context
 */

function copyFileOver(filePath, buildContext)
{
  /* Copies file over for the watch events */
  const pathComponents = util.getPathComponents(filePath);
  
  if (_isFileOverridden(pathComponents))
  {
    console.log('Overridden file not changed: ' + filePath);
    return;
  }
  copyFileToWWW(filePath, pathComponents['beg'], pathComponents['end']);

  /* Index.html needs an additional step of performing inject */
  var splitted = filePath.split(path.sep);
  var length = splitted.length;
     
  if (length > 1 && splitted[length-1] === "index.html" &&
      splitted[length-2] === pathComponents['mid'])
  {
    /* Inject the cordova.js script and use the new file as the source for copy */
    indexHtmlInjector.injectScriptTags(
      {
        updatePlatformFile: false,
        platform: config.get('platform'),
        opts: {
          destination: config.get('serve').destination
        }
      }
    );
    /* Inject Theme Path to wwww/index.html*/
    indexHtmlInjector.injectThemePath(buildContext)
    .catch ((err) => {
      console.log(err);
    });
    
    var newIndexSrc = pathComponents['beg'] + config("paths").staging.hybrid + '/www/' + pathComponents['end'];
    copyFileToPlatforms(newIndexSrc, pathComponents['beg'], pathComponents['end']);
    /* This updates the file in platform folder */
    indexHTMLPlatformInjection(); 
  }
  else if (length > 1 && splitted[length-1] === "main.js" && splitted[length-2] === "js"
          && splitted[length-3] === pathComponents['mid'])
  {
    // inject js/main.js paths
    mainJsInjector.injectPaths(buildContext)
    .then(() => {
      var newMainJsSrc = pathComponents['beg'] + config("paths").staging.hybrid + '/www/' + pathComponents['end'];
      copyFileToPlatforms(newMainJsSrc, pathComponents['beg'], pathComponents['end']);
    })
    .catch ((err) => {
      console.log(err);
    });  
  }
  else {
    copyFileToPlatforms(filePath, pathComponents['beg'], pathComponents['end']);
  }
}

/**
 * ## copyFileToWWW
 *
 * @private 
 * @param {string} filePath - Path to the file
 * @param {string} begPath
 * @param {string} endPath
 */

function copyFileToWWW(filePath, begPath, endPath)
{
  fs.copySync(filePath, begPath + config("paths").staging.hybrid + '/www' + endPath);
}

/**
 * ## copyFileToPlatforms
 *
 * @private
 * @param {string} filePath - Path to the file
 * @param {string} begPath
 * @param {string} endPath
 */

function copyFileToPlatforms(filePath, begPath, endPath)
{
  var platforms = getInstalledPlatforms();
  // console.log('Installed platforms: ' + platforms)
  platforms.forEach(function(platform)
  {
    if (config('defaultPlatformsConfig')[platform] === undefined)
    {
      return;
    }

    var path = getCopyPath(platform, begPath, endPath);
    // console.log(platform + ' platform path: ' + path)
    path.forEach(function(currPath)
    {
      var exists = fs.existsSync(currPath);

      if (exists)
      {
        fs.copySync(filePath, currPath);
      }
    });
  });
}

/**
 * ## indexHTMLPlatformInjection
 *
 * @private 
 */

function indexHTMLPlatformInjection()
{
  var platforms = getInstalledPlatforms();
  platforms.forEach(function(platform)
  {
    hookInjector.updateIndexHtml(platform, true); 
  });
}

/**
 * ## getInstalledPlatforms
 *
 * @private 
 */

function getInstalledPlatforms()
{
  var platforms = [];
  var platformJsonPath = path.resolve(config("paths").staging.hybrid + "/platforms/platforms.json");
  var parsed = JSON.parse(fs.readFileSync(platformJsonPath), 'utf8');

  Object.keys(parsed).forEach(function(platform)
  {
    platforms.push(platform);
  });

  return platforms;
}



/**
 * ## getCopyPaths
 * Get path to where hybrid platforms keeps original files
 * 
 * @private
 */

function getCopyPath(platform, begPath, endPath) 
{
  return [
    path.resolve(begPath + config('defaultPlatformsConfig')[platform].root + endPath)
  ];
}

/**
 * # _isFileOverridden
 * Checks if the source file modified under livereload is potentially overridden
 * in the src-web directory in which case the change should not be propagated
 * to the served content.
 * 
 * @private
 * @param {object} pathComponents - file path specification
 * @returns {boolean}
 */

function _isFileOverridden(pathComponents)
{
  var srcDir = pathComponents['mid'];
  
  if (srcDir === config("paths").src.hybrid)
  {
    return false;
  }
  var path = pathComponents['beg'] + config("paths").staging.hybrid + pathComponents['end'];
  
  return util.fsExistsSync(path);
}