/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * # Dependencies
 */

/* 3rd party */
const grunt = require('grunt');

/* Node.js native */
const path = require('path');

/* Oracle */
const config = require('./config');
const serveHybridFileChangeHandler = require('./serveHybridFileChangeHandler');
const serveWebFileChangeHandler = require('./serveWebFileChangeHandler');
const util = require('./util');
const buildCommon = require('./buildCommon');
const valid = require('./validations');
const CONSTANTS = require('./constants');
/**
 * # ServeWeb procedure
 *
 * @public
 */

module.exports =
{
  init: () => 
  {
    let serveConfigs = config.get('serve');
    /* Update for cordova hooks */
    process.env['platform'] = config.get('platform');
    process.env['destination'] = serveConfigs.destination;
    process.env['livereload'] = serveConfigs.livereload;
    process.env['livereloadPort'] = serveConfigs.livereloadPort || config("defaultServeConfig").options.livereloadPort;
    process.env['port'] = serveConfigs.port || config("defaultServeConfig").options.port;
    process.env['cordovaDirectory'] = config("paths").staging.hybrid;
    
    const srcOverrideDir = (config.get('platform') === 'web') ? 
        config("paths").src.web : config("paths").src.hybrid;

    /* Prevent loading of Gruntfile.js */
    grunt.task.init = () => {};

    const watchConfig = config.get('serve').watch;
    watchConfig.sourceFiles.files.push(srcOverrideDir + "/**/*");

    /* File change watchers */
    grunt.config.init(
    {
      watch:watchConfig
    });

    if (config.get('platform') === 'web')
    {
      const connectConfig = serveConfigs.connect;

      grunt.config.merge(
      {
        /* File server */
        connect: connectConfig
      });
    }
  }
  ,
  load: () =>
  {
    return new Promise((resolve, reject) =>
    {
      util.info('Serving app...');
      
      let livereload = config.get('serve').livereload;
    
      /* Do we need to load plugins? */
      if (config.get('platform') === 'web')
      {
        /* We must load at least Connect plugin */
        loadGruntPlugins();
      }
      else
      {
        if (livereload)
        {
          /* If hybrid has livereloaded, we need Watch plugin */
          loadGruntPlugins();
        }
        else
        {
          /* We do not need Grunt plugins */
          resolve();
        }
      }
    
      function loadGruntPlugins()
      {
        let pathFlatStructure = path.resolve('node_modules/grunt-contrib-connect');

        // Flat structure
        util.fsExists(pathFlatStructure, (err) =>
        {
          if (!err)
          {
            /* Npm veriosn >= 3. Flat structure */
            console.log('Npm flat structure detected');
    
            grunt.loadNpmTasks('grunt-contrib-connect');
            if (livereload)
            {
              grunt.loadNpmTasks('grunt-contrib-watch');
            }
            resolve();
          }
          else
          {
            // Tree structure - programmatic api case
            let pathTreeStructure = path.resolve('node_modules/oraclejet-tooling/node_modules/grunt-contrib-connect');
    
            util.fsExists(pathTreeStructure, (err) =>
            {
              if (!err)
              {
                /* Npm veriosn <= 2. Tree structure */
                console.log('Npm tree structure detected');
    
                grunt.loadNpmTasks('/oraclejet-tooling/node_modules/grunt-contrib-connect');
                if (livereload)
                {
                  grunt.loadNpmTasks('/oraclejet-tooling/node_modules/grunt-contrib-watch');
                }
                resolve();
              }
              else
              {
                // Tree structure - grunt command case
                const pathTreeStructure2 = path.resolve('node_modules/grunt-oraclejet/node_modules/oraclejet-tooling/node_modules/grunt-contrib-connect');
                
                util.fsExists(pathTreeStructure2, (err) => 
                {
                  if (!err) 
                  {
                    /* Npm veriosn <= 2. Tree structure */
                    console.log('Npm tree structure detected');
                  
                    grunt.loadNpmTasks('/grunt-oraclejet/node_modules/oraclejet-tooling/node_modules/grunt-contrib-connect');
                    if (livereload) 
                    {
                      grunt.loadNpmTasks('/grunt-oraclejet/node_modules/oraclejet-tooling/node_modules/grunt-contrib-watch');
                    }
                    resolve();
                  }
                  else 
                  {
                    reject('Grunt plugins are not available');
                  }
                });
              }
            });
          }
        })
      }
    });
  },

  registerTasks: () => {
    const context = _getBuildContext();

    // compile sass when src/theme is modified 
    // then copy only the generated css from themes to staging
    grunt.registerTask('compileSass', () => {
      let done = grunt.task.current.async();
      context.changedTheme = _getThemeObjFromName(grunt.config('changedTheme').name, context.opts, grunt.config('changedTheme').platform);
      buildCommon.sass(context)
      .then(buildCommon.copyThemes)
      .then(() => {
        done();
      })
      .catch((err) => {
        console.log(err);
      });
    });

    // copy entire themes/themeName/platform to staging/css/themeName/platform
    grunt.registerTask('copyThemes', () => {
      let done = grunt.task.current.async();
      context.changedTheme = _getThemeObjFromName(grunt.config('changedTheme').name, context.opts, grunt.config('changedTheme').platform);
      buildCommon.copyThemes(context)
      .then(() => {
        done();
      })
      .catch((err) => {
        console.log(err);
      });
    });
  },

  /**
   * ## handleFileChanges
   * File changes handler
   *
   * @private
   */
  handleFileChanges: () =>
  {
    grunt.event.on("watch", function(action, filePath, target)
    {
      const buildContext = _getBuildContext();
      
      //Theme related change is handled by compileSass and copyTheme tasks
      if (['added', 'changed'].indexOf(action) > -1) 
      { 
        if (_isThemeFile(filePath)) {
          grunt.config('changedTheme', _getThemeObjFromPath(filePath));
        } else {
          if (config.get('platform') === 'web') {      
            serveWebFileChangeHandler(filePath, target, buildContext);
          } else {
            serveHybridFileChangeHandler(action, filePath, target, buildContext);
          } 
        }    
      }
    });
  }
};

function _isThemeFile(filePath) {
  const srcThemes = new RegExp(config("paths").src.themes); 
  const stagingThemes = new RegExp(config("paths").staging.themes);
  return srcThemes.test(filePath) || stagingThemes.test(filePath);
}

function _getThemeObjFromPath(filePath) {
  const allThemes = util.getAllThemes();
  let result ={};
  let themeName = allThemes.filter((singleTheme) => {
    return filePath.indexOf(singleTheme) !== -1; 
  });
  if (themeName.length === 1) {
    result.name = themeName[0];
  } else {
    // find the theme with longest legnth ['alta', 'alta_test']
    result.name = themeName.reduce((acc, cur) => {
      acc = (cur.length > acc.length) ? cur : acc;
    }, '');
  }
  let allPlatforms = CONSTANTS.SUPPORTED_PLATFORMS;
  let themePlatform = config("platform");
  allPlatforms.forEach((singlePlatform) => {
    themePlatform = (filePath.indexOf(singlePlatform) === -1) ? themePlatform : singlePlatform;
  })
  result.platform = themePlatform;
  return result;
}

function _getThemeObjFromName(themeName, opts, platform) {
  if(themeName === opts.theme.name) {
    return opts.theme;
  } else {
    return valid.getThemeObject(themeName, platform);
  }
}

function _getThemeNameFromPath(filePath) {
  const allThemes = util.getAllThemes();
  let themeName = allThemes.filter((singleTheme) => {
    return filePath.indexOf(singleTheme) !== -1; 
  });
  if (themeName.length === 1) {
    return themeName[0];
  } else {
    // find the theme with longest legnth ['alta', 'alta_test']
    return themeName.reduce((acc, cur) => {
      acc = (cur.length > acc.length) ? cur : acc;
    }, '');
  }
}

function _getThemeObjFromName(themeName, opts, platform) {
  if(themeName === opts.theme.name) {
    return opts.theme;
  } else {
    return valid.getThemeObject(themeName, platform);
  }
}

function _getBuildContext() {
  const validPlatform = config.get('platform');
  const options = valid.buildOptions(config.get('serve'), validPlatform, true);
  const validBuildType = valid.buildType(options);
  options.buildType = validBuildType; 
  options.cssonly = true;
  options.themes = undefined; //disable compiling all themes for livereload
  let context =
  {
    buildType: validBuildType,
    opts: options,
    platform: validPlatform
  }
  return context;
}

