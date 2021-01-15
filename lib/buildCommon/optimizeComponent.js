/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const util = require('../util');
const requirejs = require('requirejs');
const hookRunner = require('../hookRunner');
const pathGenerator = require('../rjsConfigGenerator');


/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.rjsOptions
 * @param {string} options.root component root,
 * if singleton its = componentName and if pack component its =
 * packName
 * @param {string[]} options.extraExcludes
 * @param {string[]} options.extraEmpties
 * @returns {Promise<object>}
 */
function optimizeComponent({
  context,
  rjsOptions,
  root,
  extraExcludes,
  extraEmpties
}) {
  util.log(`Running component requirejs task for ${rjsOptions.name}`);
  return util.runPromisesInSeries([
    () => optimizeComponentSetup({
      context,
      rjsOptions,
      root,
      extraExcludes,
      extraEmpties
    }),
    () => hookRunner('before_component_optimize', context),
    () => optimizeComponentInvoker({ context, rjsOptions })
  ]);
}


/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.rjsOptions
 * @param {string} options.root component root,
 * if singleton its = componentName and if pack component its =
 * packName
 * @param {string[]} options.extraExcludes
 * @param {string[]} options.extraEmpties
 * @returns {Promise<object>}
 */
function optimizeComponentSetup({
  context,
  rjsOptions,
  root,
  extraExcludes,
  extraEmpties
}) {
  return new Promise((resolve, reject) => {
    try {
      const pathMappings = pathGenerator.getMasterPathsMapping(context, true);
      const rConfig = {
        ...rjsOptions,
        optimize: context.opts.requireJsComponent.optimize,
        buildCSS: context.opts.requireJsComponent.buildCSS,
        separateCSS: context.opts.requireJsComponent.separateCSS,
        generateSourceMaps: context.opts.requireJsComponent.generateSourceMaps
      };
      const exclude = ['css', 'ojcss', 'ojL10n', 'text', 'normalize', 'css-builder'];
      if (extraExcludes) {
        extraExcludes.forEach((extraExclude) => {
          exclude.push(extraExclude);
        });
      }
      Object.keys(pathMappings).forEach((lib) => {
        if (!exclude.includes(lib)) {
          pathMappings[lib] = 'empty:';
        }
      });
      if (extraEmpties) {
        extraEmpties.forEach((extraEmpty) => {
          pathMappings[extraEmpty] = 'empty:';
        });
      }
      rConfig.paths = pathMappings;
      rConfig.exclude = exclude;
      if (root) {
        rConfig.paths[root] = '.';
      }
      // eslint-disable-next-line no-param-reassign
      context.opts.componentRequireJs = rConfig;
      resolve(context);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.rjsOptions
 * @returns {Promise<object>}
 */
function optimizeComponentInvoker({ context, rjsOptions }) {
  return new Promise((resolve, reject) => {
    try {
      requirejs.optimize(
        context.opts.componentRequireJs,
        () => {
          if (context.opts.optimize === 'none') {
            resolve(context);
          } else {
            util.minifyFiles({
              files: [{ dest: rjsOptions.out, src: rjsOptions.out }],
              options: context.opts.terser.options,
              generateSourceMaps: true,
              minify: true
            }).then(() => {
              resolve(context);
            }).catch((minifyError) => {
              util.log.error(minifyError);
            });
          }
        },
        (err) => {
          util.log(err);
          reject(err);
        });
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = optimizeComponent;
