/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
const CONSTANT = require('./constants');
const util = require('./util');

module.exports = {

  build: {

    web: {

      stagingPath: CONSTANT.WEB_DIRECTORY,

      injectPaths: {
        startTag: '//injector:mainReleasePaths',
        endTag: '//endinjector',
        mainJs: CONSTANT.WEB_DIRECTORY + '/js/main.js',
        destMainJs: CONSTANT.WEB_DIRECTORY + '/js/main-temp.js',
        mainReleasePaths: CONSTANT.APP_SRC_DIRECTORY + '/js/main-release-paths.json'
      },

      uglify: {
        fileList: [
          {
            cwd: CONSTANT.APP_SRC_DIRECTORY + '/js',
            src: ['**/*.js', '!libs/**', '!main.js'],
            dest: CONSTANT.WEB_DIRECTORY + '/js'
          },
          {
            cwd: CONSTANT.WEB_DIRECTORY + '/js',
            src: ['main-temp.js'],
            dest: CONSTANT.WEB_DIRECTORY + '/js'
          }
        ],
        options: {
          banner: '',
          footer: '',
          compress: {
            warnings: false
          },
          mangle: {
            // Disable mangling requirejs config to avoid optimization errors
            except:['require']
          },
          beautify: false,
          report: 'min',
          expression: false,
          maxLineLen: 32000,
          ASCIIOnly: false,
          screwIE8: false,
          quoteStyle: 0
        }
      },

      copyToStaging: {
        fileList: [
          {
            buildType: 'release',
            cwd: CONSTANT.APP_SRC_DIRECTORY,
            src: [
              '**',
              '!js/**/*.js',
              'js/main.js',
              'js/libs/**',
              '!js/libs/**/*debug*',
              '!js/libs/**/*debug*/**',
              '!js/main-release-paths.json',
              '!js/main-debug-paths-windows.json',
              '!js/main-release-paths-windows.json',
              '!themes/**'
            ],
            dest: CONSTANT.WEB_DIRECTORY
          },
          {
            buildType: 'dev',
            cwd: CONSTANT.APP_SRC_DIRECTORY,
            src: [
              '**', 
              '!js/main-release-paths.json',
              '!js/main-debug-paths-windows.json',
              '!js/main-release-paths-windows.json',
              '!themes/**',
              ],
            dest: CONSTANT.WEB_DIRECTORY
          },
          {
            cwd: 'src-web',
            src: ['**'],
            dest: CONSTANT.WEB_DIRECTORY
          },
          {
            cwd: 'src/themes',
            src: ['**', '!**/*.scss', '!**.map'],
            dest: CONSTANT.APP_THEMES_DIRECTORY
          }
        ],
      },

      requireJs: {
        baseUrl: CONSTANT.WEB_DIRECTORY + '/js',
        name: 'main-temp',
        mainConfigFile: CONSTANT.WEB_DIRECTORY + '/js/main-temp.js',
        optimize: 'none',
        out: CONSTANT.WEB_DIRECTORY + '/js/main.js'
      },

      sass: {
        fileList: [
          {
            cwd: function (context) {
              return `src/themes/${context.theme.name}/${context.theme.platform}`;
            },
            src:['**/*.scss', '!**/_*.scss'],
            dest: function (context) {
              return `themes/${context.theme.name}/${context.theme.platform}`
            }
          }
        ]
      },

      injectTheme: {
        startTag: '<!-- injector:theme -->',
        endTag: '<!-- endinjector -->'
      }
    },

    hybrid: {

      stagingPath: CONSTANT.CORDOVA_DIRECTORY + '/www',

      injectPaths: {
        startTag: '//injector:mainReleasePaths',
        endTag: '//endinjector',
        mainJs: CONSTANT.CORDOVA_DIRECTORY + '/www' + '/js/main.js',  
        destMainJs: CONSTANT.CORDOVA_DIRECTORY + '/www' + '/js/main-temp.js',
        mainReleasePaths: 'src/js/main-release-paths.json',
        mainDebugPathsWindows: 'src/js/main-debug-paths-windows.json',
        mainReleasePathsWindows: 'src/js/main-release-paths-windows.json',
      },

      uglify: {
        fileList: [
          {
            cwd: CONSTANT.APP_SRC_DIRECTORY + '/js',
            src: ['**/*.js', '!libs/**', '!main.js'],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/www/js',
          },
          {
            cwd: CONSTANT.CORDOVA_DIRECTORY + '/www/js',
            src: ['main-temp.js'],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/www/js',
          },
        ],
        options: {
          compress: {
            warnings: false,
          },
          mangle: {},
          beautify: false,
          report: 'min',
          expression: false,
          maxLineLen: 32000,
          ASCIIOnly: false,
          screwIE8: false,
          quoteStyle: 0,
        },
      },

      copyToStaging: {
        fileList: [
          {
            buildType: 'release',
            cwd: CONSTANT.APP_SRC_DIRECTORY,
            src:
            [
              '**',
              '!js/**/*.js',
              'js/main.js',
              'js/libs/**',
              '!js/libs/**/*debug*',
              '!js/libs/**/*debug*/**',
              '!cordova.js',
              '!js/main-release-paths.json',
              '!js/main-debug-paths-windows.json',
              '!js/main-release-paths-windows.json',
              '!themes/**',
            ],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/www',
          },

          {
            buildType: 'dev',
            cwd: CONSTANT.APP_SRC_DIRECTORY,
            src: [
              '**', 
              '*', 
              '!js/main-release-paths.json',
              '!js/main-debug-paths-windows.json',
              '!js/main-release-paths-windows.json',
              '!themes/**',
            ],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/www',   
          },

          {
            cwd: 'src-hybrid',
            src: ['**', '*'],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/www',
          },

          {
            cwd: function() {
              return util.templatePath('hooks');
            },
            src: ['**'],
            dest: CONSTANT.CORDOVA_DIRECTORY + '/scripts/hooks',
          },
          {
            cwd: 'src/themes',
            src: ['**', '!**/*.scss', '!**.map'],
            dest: CONSTANT.APP_THEMES_DIRECTORY
          }
        ],
      },

      requireJs: {
        baseUrl: CONSTANT.CORDOVA_DIRECTORY + '/www/js',
        name: 'main-temp',
        mainConfigFile: CONSTANT.CORDOVA_DIRECTORY + '/www/js/main-temp.js',
        optimize: 'none',
        out: CONSTANT.CORDOVA_DIRECTORY + '/www/js/main.js', 
      },

      sass: {
        fileList: [
          {
            cwd: function (context) {
              return `src/themes/${context.theme.name}/${context.theme.platform}`;
            },
            src:['**/*.scss', '!**/_*.scss'],
            dest: function (context) {
              return `themes/${context.theme.name}/${context.theme.platform}`
            }
          }
        ]
      },

      injectTheme: {
        startTag: '<!-- injector:theme -->',
        endTag: '<!-- endinjector -->'
      }

    },
  },

  /* Serve Config */
  serve: {
    defaultHybridPlatform: 'browser',
    //Serve API overall default options
    options: {
      livereload: true,
      build: true,
      port: 8000,
      livereloadPort: 35729,
    },

    //Sub task connect default options
    connect: {
      webDevServer: {
        options: {
          hostname: '*',
          port: 8000,
          livereload: true,
          base: CONSTANT.WEB_DIRECTORY,
          open: true
        }
      },
      webReleaseServer: {
        options: {
          hostname:'*',
          port: 8000,
          base: CONSTANT.WEB_DIRECTORY,
          keepalive: true,
          open: true
        }
      }
    }, 

    //Sub task watch default options
    watch:
    {
      sourceFiles:
      {
        files: [
          CONSTANT.APP_SRC_DIRECTORY + "/css/!(libs)/**/*.css",
          CONSTANT.APP_SRC_DIRECTORY + "/js/!(libs)/**/*.js",
          CONSTANT.APP_SRC_DIRECTORY + "/js/{,*/}*.js",
          CONSTANT.APP_SRC_DIRECTORY + "/css/{,*/}*.css",
          CONSTANT.APP_SRC_DIRECTORY + "/**/*.html",
        ],
        options:
        {
          livereload: true,
          spawn:false,
        }
      },

      sass: {
        files: [
          CONSTANT.APP_SRC_DIRECTORY + "/themes/**/*"
        ], 
        options:{
          livereload: true,
          spawn:false
        },
        tasks:['compileSass']
      }, 

      themes: {
        files: [
          CONSTANT.APP_THEMES_DIRECTORY + "/**/*"
        ], 
        options:{
          livereload: true,
          spawn:false
        },
        tasks:['copyTheme']
      }
    }
  },

  /* Platform paths */
  platforms: {
    android: {
      root: CONSTANT.CORDOVA_DIRECTORY + '/platforms/android/assets/www/',
    },
    browser: {
      root: CONSTANT.CORDOVA_DIRECTORY + '/platforms/browser/www/',
    },
    ios: {
      root: CONSTANT.CORDOVA_DIRECTORY + '/platforms/ios/www/',
    },
    windows: {
      root: CONSTANT.CORDOVA_DIRECTORY + '/platforms/windows/www/',
    }
  },
};
