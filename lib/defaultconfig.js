/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

const npmCopy = require('./npmCopyConfig');

module.exports = {
  build: {


    stagingPath: paths => paths.staging.stagingPath,

    injectPaths: paths => ({
      startTag: '//injector:mainReleasePaths',
      endTag: '//endinjector',
      mainJs: `${paths.staging.stagingPath}/${paths.src.javascript}/main.js`,
      destMainJs: `${paths.staging.stagingPath}/${paths.src.javascript}/main-temp.js`,
      mainReleasePaths: `${paths.src.common}/${paths.src.javascript}/main-release-paths.json`
    }),

    uglify: paths => ({
      fileList: [
        {
          cwd: `${paths.src.common}/${paths.src.javascript}`,
          src: ['**/*.js', '!main.js'],
          dest: `${paths.staging.stagingPath}/${paths.src.javascript}`
        },
        {
          cwd: `${paths.staging.stagingPath}/${paths.src.javascript}`,
          src: ['main-temp.js'],
          dest: `${paths.staging.stagingPath}/${paths.src.javascript}`
        },
        {
          // jquery ui npm package does not provide minified scripts
          buildType: 'release',
          cwd: `${paths.staging.stagingPath}/${paths.src.javascript}/libs`,
          src: ['jquery/jqueryui-amd*min/**/*.js'],
          dest: `${paths.staging.stagingPath}/${paths.src.javascript}/libs`
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
          except: ['require']
        },
        beautify: false,
        report: 'min',
        expression: false,
        maxLineLen: 32000,
        ASCIIOnly: false,
        screwIE8: false,
        quoteStyle: 0
      }
    }),

    copySrcToStaging: paths => ({
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
            `!${paths.staging.themes}/**`,
            '!cordova.js'
          ],
          dest: paths.staging.stagingPath
        },
        {
          buildType: 'dev',
          cwd: paths.src.common,
          src: [
            '**',
            `!${paths.src.javascript}/main-release-paths.json`,
            `!${paths.staging.themes}/**`,
          ],
          dest: paths.staging.stagingPath
        },
        {
          cwd: paths.src.platformSpecific,
          src: ['**'],
          dest: paths.staging.stagingPath
        },
        {
          buildType: 'dev',
          cwd: `${paths.src.common}/${paths.src.themes}`,
          src: ['**', '!**/*.scss'],
          dest: paths.staging.themes
        },
        {
          buildType: 'release',
          cwd: `${paths.src.common}/${paths.src.themes}`,
          src: ['**', '!**/*.scss', '!**.map'],
          dest: paths.staging.themes
        }
      ],
    }),

    copyLibsToStaging: paths => npmCopy.getLibsList(paths),

    copyCustomLibsToStaging: {
      fileList: []
    },

    requireJs: paths => ({
      baseUrl: `${paths.staging.stagingPath}/${paths.src.javascript}`,
      name: 'main-temp',
      mainConfigFile: `${paths.staging.stagingPath}/${paths.src.javascript}/main-temp.js`,
      optimize: 'none',
      out: `${paths.staging.stagingPath}/${paths.src.javascript}/main.js`
    }),

    sass: paths => ({
      fileList: [
        {
          cwd(context) {
            return `${paths.src.common}/${paths.src.themes}/${context.theme.name}/${context.theme.platform}`;
          },
          src: ['**/*.scss', '!**/_*.scss'],
          dest(context) {
            return `${paths.staging.themes}/${context.theme.name}/${context.theme.platform}`;
          }
        },
        {
          cwd: `${paths.src.common}/${paths.src.javascript}/jet-composites`,
          src: ['**/*.scss', '!**/_*.scss'],
          dest: `${paths.staging.stagingPath}/${paths.src.javascript}/jet-composites`
        }
      ],
      options: {
        precision: 10
      }
    }),

    injectTheme: {
      startTag: '<!-- injector:theme -->',
      endTag: '<!-- endinjector -->'
    }
  },

  /* Serve Config */
  serve: {
    defaultHybridPlatform: 'browser',
    // Serve API overall default options
    options: {
      livereload: true,
      build: true,
      port: 8000,
      livereloadPort: 35729,
    },

    // Sub task connect default options
    connect: paths => ({
      options: {
        hostname: '*',
        port: 8000,
        livereload: true,
        base: paths.staging.web,
        open: true
      }
    }),

    // Sub task watch default options
    watch: paths => ({
      sourceFiles:
      {
        files: [
          `${paths.src.common}/${paths.src.styles}/!(libs)/**/*.css`,
          `${paths.src.common}/${paths.src.javascript}/!(libs)/**/*.js`,
          `${paths.src.common}/${paths.src.javascript}/{,*/}*.js`,
          `${paths.src.common}/${paths.src.styles}/{,*/}*.css`,
          `${paths.src.common}/**/*.html`,
        ],
        options:
        {
          livereload: true,
          spawn: false,
        }
      },

      sass: {
        files: [
          `${paths.src.common}/${paths.src.themes}/**/*`,
          `${paths.src.common}/${paths.src.javascript}/jet-composites/**/*.scss`,
        ],
        options: {
          livereload: true,
          spawn: false
        },
        commands: ['compileSass']
      },

      themes: {
        files: [
          `${paths.staging.themes}/**/*`
        ],
        options: {
          livereload: true,
          spawn: false
        },
        commands: ['copyThemes']
      },
    }),
  },

  /* Platform paths */
  platforms: paths => ({
    android: {
      root: `${paths.staging.hybrid}/platforms/android/assets/www/`,
    },
    browser: {
      root: `${paths.staging.hybrid}/platforms/browser/www/`,
    },
    ios: {
      root: `${paths.staging.hybrid}/platforms/ios/www/`,
    },
    windows: {
      root: `${paths.staging.hybrid}/platforms/windows/www/`,
    }
  }),
};
