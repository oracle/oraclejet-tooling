/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';
const CONSTANT = require('./constants');
const util = require('./util');

module.exports = {

  build: {

    web: {
      //stagingPath: config.data.paths.staging.common,
       stagingPath: (paths) => {
        return paths.staging.web;
       },

      injectPaths:(paths) => {
        return {
          startTag: '//injector:mainReleasePaths',
          endTag: '//endinjector',
          mainJs: paths.staging.web + `/${paths.src.javascript}/main.js`,
          destMainJs: paths.staging.web + `/${paths.src.javascript}/main-temp.js`,
          mainReleasePaths: paths.src.common + `/${paths.src.javascript}/main-release-paths.json`
        };
      },

      uglify: (paths) => {
        return {
          fileList: [
            {
              cwd: paths.src.common + `/${paths.src.javascript}`,
              src: ['**/*.js', '!libs/**', '!main.js'],
              dest: paths.staging.web + `/${paths.src.javascript}`
            },
            {
              cwd: paths.staging.web + `/${paths.src.javascript}`,
              src: ['main-temp.js'],
              dest:  paths.staging.web + `/${paths.src.javascript}`
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
        }
      },
      copyToStaging: (paths) => { 
        return {
          fileList: [
            {
              buildType: 'release',
              cwd: paths.src.common,
              src: [
                '**',
                `!${paths.src.javascript}/**/*.js`,
                `${paths.src.javascript}/main.js`,
                `${paths.src.javascript}/libs/**`,
                `!${paths.src.javascript}/libs/**/*debug*`,
                `!${paths.src.javascript}/libs/**/*debug*/**`,
                `!${paths.src.javascript}/main-release-paths.json`,
                `!${paths.staging.themes}/**`
              ],
              dest: paths.staging.web
            },
            {
              buildType: 'dev',
              cwd: paths.src.common,
              src: [
                '**', 
                `!${paths.src.javascript}/main-release-paths.json`,
                `!${paths.staging.themes}/**`,
                ],
              dest: paths.staging.web
            },
            {
              cwd: paths.src.web,
              src: ['**'],
              dest: paths.staging.web
            },
            {
              cwd: `${paths.src.common}/${paths.src.themes}`,
              src: ['**', '!**/*.scss', '!**.map'],
              dest: paths.staging.themes
            }
          ],
        }
      },

      requireJs: (paths) => { 
        return {
          baseUrl: `${paths.staging.web}/${paths.src.javascript}`,
          name: 'main-temp',
          mainConfigFile:`${paths.staging.web}/${paths.src.javascript}/main-temp.js`,
          optimize: 'none',
          out: `${paths.staging.web}/${paths.src.javascript}/main.js`
        }
      },

      sass: (paths) => {
        return {
          fileList: [
            {
              cwd: function (context) {
                return `${paths.src.common}/${paths.src.themes}/${context.theme.name}/${context.theme.platform}`;
              },
              src:['**/*.scss', '!**/_*.scss'],
              dest: function (context) {
              return `${paths.staging.themes}/${context.theme.name}/${context.theme.platform}`
              }
            }
          ]
        }
      },

      injectTheme: {
        startTag: '<!-- injector:theme -->',
        endTag: '<!-- endinjector -->'
      }
    },

    hybrid: {

      stagingPath: (paths) => {
        return paths.staging.hybrid + '/www';
      },

      injectPaths: (paths) => {
        return {
          startTag: '//injector:mainReleasePaths',
          endTag: '//endinjector',
          mainJs: paths.staging.hybrid + '/www' + `/${paths.src.javascript}/main.js`,  
          destMainJs: paths.staging.hybrid + '/www' + `/${paths.src.javascript}/main-temp.js`,
          mainReleasePaths: `${paths.src.common}/${paths.src.javascript}/main-release-paths.json`,
        };
      },

      uglify: (paths) => {
        return {
          fileList: [
            {
              cwd: paths.src.common + `/${paths.src.javascript}`,
              src: ['**/*.js', '!libs/**', '!main.js'],
              dest: paths.staging.hybrid + `/www/${paths.src.javascript}`,
            },
            {
              cwd: paths.staging.hybrid  + `/www/${paths.src.javascript}`,
              src: ['main-temp.js'],
              dest: paths.staging.hybrid  + `/www/${paths.src.javascript}`,
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
        }
      },

      copyToStaging: (paths) => {
        return {
          fileList: [
            {
              buildType: 'release',
              cwd: paths.src.common,
              src:
              [
                '**',
                `!${paths.src.javascript}/**/*.js`,
                `${paths.src.javascript}/main.js`,
                `${paths.src.javascript}/libs/**`,
                `!${paths.src.javascript}/libs/**/*debug*`,
                `!${paths.src.javascript}/libs/**/*debug*/**`,
                '!cordova.js',
                `!${paths.src.javascript}/main-release-paths.json`,
                `!${paths.staging.themes}/**`
              ],
              dest: paths.staging.hybrid + '/www',
            },

            {
              buildType: 'dev',
              cwd: paths.src.common,
              src: [
                '**', 
                '*', 
                `!${paths.src.javascript}/main-release-paths.json`,
                `!${paths.staging.themes}/**`,
              ],
              dest: paths.staging.hybrid + '/www',   
            },

            {
              cwd: paths.src.hybrid,
              src: ['**', '*'],
              dest: paths.staging.hybrid + '/www',
            },

            {
              cwd: function() {
                return util.templatePath('hooks');
              },
              src: ['**'],
              dest: paths.staging.hybrid + '/scripts/hooks',
            },
            {
              cwd: `${paths.src.common}/${paths.src.themes}`,
              src: ['**', '!**/*.scss', '!**.map'],
              dest: paths.staging.themes
            }
          ],
        }
      },

      requireJs: (paths) => {
        return {
          baseUrl: paths.staging.hybrid + `/www/${paths.src.javascript}`,
          name: 'main-temp',
          mainConfigFile: paths.staging.hybrid + `/www/${paths.src.javascript}/main-temp.js`,
          optimize: 'none',
          out: paths.staging.hybrid + `/www/${paths.src.javascript}/main.js`, 
        }
      },

      sass: (paths) => {
        return {
          fileList: [
            {
              cwd: function (context) {
                return `${paths.src.common}/${paths.src.themes}/${context.theme.name}/${context.theme.platform}`;
              },
              src:['**/*.scss', '!**/_*.scss'],
              dest: function (context) {
                return `${paths.staging.themes}/${context.theme.name}/${context.theme.platform}`
              }
            }
          ]
        }
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
    connect: (paths) => {
      return {
        webDevServer: {
          options: {
            hostname: '*',
            port: 8000,
            livereload: true,
            base: paths.staging.web,
            open: true
          }
        },
        webReleaseServer: {
          options: {
            hostname:'*',
            port: 8000,
            base: paths.staging.web,
            keepalive: true,
            open: true
          }
        }
      }
    }, 

    //Sub task watch default options
    watch: (paths) => {
      return {
        sourceFiles:
        {
          files: [
            paths.src.common + `/${paths.src.styles}/!(libs)/**/*.css`,
            paths.src.common + `/${paths.src.javascript}/!(libs)/**/*.js`,
            paths.src.common + `/${paths.src.javascript}/{,*/}*.js`,
            paths.src.common + `/${paths.src.styles}/{,*/}*.css`,
            paths.src.common + "/**/*.html",
          ],
          options:
          {
            livereload: true,
            spawn:false,
          }
        },

        sass: {
          files: [
            paths.src.common + `/${paths.src.themes}/**/*`
          ], 
          options:{
            livereload: true,
            spawn:false
          },
          tasks:['compileSass']
        }, 

        themes: {
          files: [
            paths.staging.themes + "/**/*"
          ], 
          options:{
            livereload: true,
            spawn:false
          },
          tasks:['copyThemes']
        },
      }
    },
  },

  /* Platform paths */
  platforms: (paths) => {
    return {
      android: {
        root: paths.staging.hybrid + '/platforms/android/assets/www/',
      },
      browser: {
        root: paths.staging.hybrid + '/platforms/browser/www/',
      },
      ios: {
        root: paths.staging.hybrid + '/platforms/ios/www/',
      },
      windows: {
        root: paths.staging.hybrid + '/platforms/windows/www/',
      }
    }    
  },
};
