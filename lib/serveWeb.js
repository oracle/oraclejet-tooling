/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const grunt = require('grunt');

/* Oracle */
const config = require('./config');
const gruntPlugins = require('./serveGruntPlugins');
const util = require('./util');
const defaultConfig = require('./defaultconfig');
const indexHtmlInjector = require('./indexHtmlInjector');

/**
 * # ServeWeb procedure
 *
 * @public
 */

module.exports = (build) => 
{
  build()
    .then(updateCspRuleForLivereload)
    .then(gruntPlugins.load)
    .then(() => {
      gruntPlugins.registerTasks();
      grunt.tasks(getTasks());
      if (config.get('serve').livereload)
      {
        gruntPlugins.handleFileChanges();
      }
    })
    .catch((error) =>
    {
      // Can not throw in promise catch handler
      // http://stackoverflow.com/questions/30715367/why-can-i-not-throw-inside-a-promise-catch-handler
      setTimeout(() =>
      {
        util.error(error);
      }, 0);
    });
};

/**
 * # Private functions
 * ## getTasks
 *
 * @private
 * @returns {Array} tasks - Tasks list
 */

function getTasks() 
{
  let tasks = [];
  let serveConfigs = config.get('serve');
  
  if (serveConfigs.buildType === 'release')
  {
    tasks.push('connect:webReleaseServer:keepalive');
  }
  else
  {
    if (serveConfigs.livereload)
    {
      tasks.push('connect:webDevServer');
    }
    else
    {
      tasks.push('connect:webDevServer:keepalive');
    }
  }

  if (serveConfigs.livereload)
  {
    const watchTasks = (serveConfigs.sassCompile || serveConfigs.sassCompile === undefined)
                       ? 'watch' : 'watch:sourceFiles';
    tasks.push(watchTasks);
  }
  return tasks;
}

/**
 * ## updateCspRuleForLivereload
 * 
 * If livereload is on, updates the CSP rule in index.html to allow connections
 * to the livereload server.
 *
 * @private
 * @returns {object} - resolved promise
 */

function updateCspRuleForLivereload()
{
  let serveConfigs = config.get('serve');
  
  if (!serveConfigs.livereload)
  {
    return Promise.resolve();
  }
  let opts = { stagingPath: defaultConfig.build.web.stagingPath };
  let context = { opts: opts };
  return indexHtmlInjector.injectLocalhostCspRule(context);    
}
