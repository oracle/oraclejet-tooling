/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const path = require('path');
const util = require('../util');
const optimizeComponent = require('./optimizeComponent');
const CONSTANTS = require('../constants');

class ComponentMinifier {
/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 */
  constructor({ context, componentJson }) {
    this.context = context;
    this.componentJson = componentJson;
  }
  generateMinificationFunction() {
    const config = this.generateOptimizationConfig();
    return () => (config.reduce(
      (prev, next) => prev.then(() => optimizeComponent(next)),
      Promise.resolve(this.context)
    )
    );
  }
  getExtraEmpties() {
    const componentsCache = util.getComponentsCache();
    const extraEmpties = new Set();
    const { componentJson } = this;
    if (util.hasProperty(componentJson, 'dependencies')) {
      let componentCache;
      Object.keys(componentJson.dependencies).forEach((dependency) => {
        componentCache = componentsCache[dependency];
        if (componentCache) {
          if (componentCache.componentJson.type === 'pack') {
            util.log.error(`Cannot have a dependency on a pack (${dependency}).`);
          } else {
            extraEmpties.add(componentCache.importName);
          }
        } else {
          util.log.error(`${dependency} is an invalid dependency. Please make sure that it is available in your application.`);
        }
      });
    }
    return Array.from(extraEmpties);
  }
}

class SingletonComponentMinifier extends ComponentMinifier {
  /**
   *
   * @param {object} options
   * @param {object} options.context
   * @param {object} options.componentJson
   * @param {string} options.destBase
   */
  constructor({ context, componentJson, destBase }) {
    super({ context, componentJson });
    this.baseUrl = path.join(destBase, componentJson.name, componentJson.version);
    this.destPath = path.join(this.baseUrl, 'min');
  }
  generateRjsOptions() {
    const { baseUrl, componentJson, destPath } = this;
    return {
      baseUrl,
      name: `${componentJson.name}/loader`,
      out: path.join(destPath, 'loader.js')
    };
  }
}

class PackComponentMinifier extends ComponentMinifier {
  /**
   *
   * @param {object} options
   * @param {object} options.context
   * @param {object} options.componentJson
   * @param {object} options.packComponentJson
   * @param {string} options.destBase
   */
  constructor({ context, componentJson, packComponentJson, destBase }) {
    super({ context, componentJson });
    this.baseUrl = path.join(destBase, packComponentJson.name, packComponentJson.version);
    this.destPath = path.join(destBase, packComponentJson.name, packComponentJson.version, 'min', componentJson.name);
  }
  generateRjsOptions() {
    const { baseUrl, componentJson, destPath } = this;
    return {
      baseUrl,
      name: `${componentJson.pack}/${componentJson.name}/loader`,
      out: path.join(destPath, 'loader.js')
    };
  }
}

class SingletonCompositeComponentMinifier extends SingletonComponentMinifier {
/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 * @param {string} destBase
 */
  constructor({ context, componentJson, destBase }) {
    super({ context, componentJson, destBase });
  }
  generateOptimizationConfig() {
    const config = [];
    const { context, componentJson } = this;
    config.push({
      context,
      rjsOptions: this.generateRjsOptions(),
      root: componentJson.name,
      extraEmpties: this.getExtraEmpties()
    });
    return config;
  }
}

class PackCompositeComponentMinifier extends PackComponentMinifier {
/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 * @param {object} options.packComponentJson
 * @param {string} options.destBase
 */
  constructor({ context, componentJson, packComponentJson, destBase }) {
    super({ context, componentJson, packComponentJson, destBase });
  }
  generateOptimizationConfig() {
    const config = [];
    const { context, componentJson } = this;
    config.push({
      context,
      rjsOptions: this.generateRjsOptions(),
      root: componentJson.pack,
      extraEmpties: this.getExtraEmpties()
    });
    return config;
  }
}

class ResourceComponentMinifier extends PackComponentMinifier {
/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 * @param {object} options.packComponentJson
 * @param {string} options.destBase
 */
  constructor({ context, componentJson, packComponentJson, destBase }) {
    super({ context, componentJson, packComponentJson, destBase });
  }
  generateOptimizationConfig() {
    const config = [];
    const { context, componentJson } = this;
    if (util.hasProperty(componentJson, 'publicModules')) {
      const { pack: packName, publicModules } = componentJson;
      publicModules.forEach((publicModule) => {
        config.push({
          context,
          rjsOptions: this.generateRjsOptions({ publicModule }),
          root: packName,
          extraExcludes: this.getExtraExcludes({ publicModule })
        });
      });
    }
    return config;
  }

  /**
    *
    * @param {object} options
    * @param {string} options.publicModule
    */
  generateRjsOptions({ publicModule }) {
    const { baseUrl, componentJson, destPath } = this;
    return {
      baseUrl,
      name: `${componentJson.pack}/${componentJson.name}/${publicModule}`,
      out: path.join(destPath, `${publicModule}.js`)
    };
  }
  /**
   *
   * @param {object} options
   * @param {string} options.publicModule
   */
  getExtraExcludes({ publicModule }) {
    const { componentJson } = this;
    const { publicModules, pack: packName, name: componentName } = componentJson;
    const extraExcludes = new Set();
    publicModules.forEach((otherPublicModule) => {
      if (otherPublicModule !== publicModule) {
        extraExcludes.add(`${packName}/${componentName}/${otherPublicModule}`);
      }
    });
    return Array.from(extraExcludes);
  }
}

class PackBundlesMinifier extends ComponentMinifier {
/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.packComponentJson
 * @param {string} options.destBase
 */
  constructor({ context, packComponentJson, destBase }) {
    super({ context });
    this.packComponentJson = packComponentJson;
    this.baseUrl = path.join(destBase, packComponentJson.name, packComponentJson.version);
    this.destPath = path.join(this.baseUrl, 'min');
  }
  generateOptimizationConfig() {
    const config = [];
    const { context, packComponentJson, baseUrl, destPath } = this;
    const { name: packName } = packComponentJson;
    Object.keys(packComponentJson.bundles).forEach((bundleKey) => {
      const bundleName = bundleKey.substring(packName.length + 1);
      const bundleContents = `require(["${packComponentJson.bundles[bundleKey].join('","')}"], function(){});`;
      util.writeFileSync(path.join(baseUrl, `${bundleName}.js`), bundleContents);
      config.push({
        context,
        rjsOptions: {
          baseUrl,
          name: bundleName,
          out: path.join(destPath, `${bundleName}.js`)
        },
        root: packName,
      });
    });
    return config;
  }
}

/**
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 * @param {string} options.componentName
 * @param {string} options.destBase
 * @returns {Promise<object>}
 */
function minifyComponent({ context, componentJson, componentName, destBase }) {
  return new Promise((resolve, reject) => {
    try {
      if (!util.hasProperty(componentJson, 'version')) {
        util.log.error(`Missing property "version" in '${componentName}' component.json.`);
      }
      const minificationFunctions = [];
      const componentHasType = util.hasProperty(componentJson, 'type');
      const componentType = componentJson.type;
      if (!componentHasType || (componentHasType && componentType === 'composite')) {
        minificationFunctions.push(new SingletonCompositeComponentMinifier({
          context,
          componentJson,
          destBase
        }).generateMinificationFunction());
      } else if (componentHasType && componentType === 'pack') {
        const packComponentJson = componentJson;
        const packVersion = packComponentJson.version;
        const packName = util.hasProperty(packComponentJson, 'name') && packComponentJson.name;
        if (!packName) {
          util.log.error('Missing "name" property for pack.');
        }
        if (util.hasProperty(packComponentJson, 'dependencies')) {
          Object.keys(packComponentJson.dependencies).forEach((packMember) => {
            if (packMember.startsWith(packName)) {
              const packComponentName = packMember.substring(packName.length + 1);
              const packMemberComponentJson = util.readJsonAndReturnObject(path.join(
                destBase,
                packName,
                packVersion,
                packComponentName,
                CONSTANTS.JET_COMPONENT_JSON
              ));
              switch (packMemberComponentJson.type) {
                case undefined:
                case 'composite':
                  minificationFunctions.push(new PackCompositeComponentMinifier({
                    context,
                    componentJson: packMemberComponentJson,
                    packComponentJson,
                    destBase
                  }).generateMinificationFunction());
                  break;
                case 'resource':
                  minificationFunctions.push(new ResourceComponentMinifier({
                    context,
                    componentJson: packMemberComponentJson,
                    packComponentJson,
                    destBase
                  }).generateMinificationFunction());
                  break;
                case 'pack':
                  util.log.error(`Cannot have a pack (${packMember}) listed as a dependency of a pack (${packName}).`);
                  break;
                default:
                  break;
              }
            } else {
              util.log.error(`Missing pack prefix for dependency ${packMember} in ${packName}.`);
            }
          });
        }
        if (util.hasProperty(componentJson, 'bundles')) {
          minificationFunctions.push(new PackBundlesMinifier({
            context,
            packComponentJson,
            destBase
          }).generateMinificationFunction());
        }
      }
      util.runPromisesInSeries(minificationFunctions, context)
        .then(resolve)
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = minifyComponent;

