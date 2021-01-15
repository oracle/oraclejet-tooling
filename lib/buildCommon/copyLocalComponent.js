/**
  Copyright (c) 2015, 2021, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const glob = require('glob');
const path = require('path');
const util = require('../util');
const fs = require('fs-extra');

/**
 * ## copyLocalComponent
 *
 * Copy a local component from its source to
 * the staging area
 *
 * @param {object} options
 * @param {object} options.context build context
 * @param {string} options.componentName
 * @param {object} options.componentJson
 * @returns {Promise<object>} promise that resolves with build context
 */
function copyLocalComponent({ context, componentName, componentJson }) {
  return new Promise((resolve, reject) => {
    try {
      generateComponentJsonValidator({
        componentName,
        componentJson
      }).validate();
      const promises = [];
      const { srcBase, destBase } = util.getComponentBasePaths({
        context,
        component: componentName
      });
      const srcPath = path.join(srcBase, componentName);
      const destPath = path.join(destBase, componentName, componentJson.version);
      if (util.isJETPack({ componentJson })) {
        // only copy top-level jet pack files e.g component.json
        util.getFiles(srcPath).forEach((fileInPath) => {
          fs.copySync(
            path.join(srcPath, fileInPath),
            path.join(destPath, fileInPath)
          );
        });
        const packName = componentName;
        if (util.hasProperty(componentJson, 'dependencies')) {
          const componentsCache = util.getComponentsCache();
          Object.keys(componentJson.dependencies).forEach((packMemberName) => {
            if (packMemberName.startsWith(packName)) {
              const componentCache = componentsCache[packMemberName];
              if (!componentCache) {
                util.log.error(`${packMemberName} is an invalid pack member name. Please make sure that it is available in ${packName}.`);
              }
              const packMemberComponentName = packMemberName.substring(packName.length + 1);
              const packMemberComponentJson = componentCache.componentJson;
              generateComponentJsonValidator({
                packName,
                componentName: packMemberComponentName,
                componentJson: packMemberComponentJson
              }).validate();
              promises.push(
                generateComponentStager({
                  context,
                  componentJson: packMemberComponentJson,
                  srcPath,
                  destPath
                }).stage()
              );
            } else {
              util.log.error(`Missing pack prefix for component ${packMemberName} in ${packName}`);
            }
          });
        }
      } else {
        promises.push(
          generateComponentStager({
            context,
            componentJson,
            srcPath,
            destPath
          }).stage()
        );
      }
      Promise.all(promises).then(() => {
        resolve(context);
      }).catch(err => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Class used to validate a singleton component's
 * component.json file
 */
class ComponentJsonValidator {
  /**
   *
   * @param {object} options
   * @param {string} options.componentName
   * @param {object} options.componentJson
   */
  constructor({ componentName, componentJson }) {
    this.componentName = componentName;
    this.componentJson = componentJson;
  }
  validate() {
    const { componentName, componentJson } = this;
    if (!util.hasProperty(componentJson, 'name')) {
      util.log.error(`${componentName}'s component.json is missing a 'name' field`);
    } else if (componentJson.name !== componentName) {
      util.log.error(`${componentName} does not match the value in the 'name' field of its component.json`);
    }
    if (!util.hasProperty(componentJson, 'version')) {
      util.log.error(`'${componentName}' does not have a 'version' field in its component.json.`);
    }
  }
}

/**
 * Subclass used to validate a pack component's
 * component.json file
 */
class PackComponentJsonValidator extends ComponentJsonValidator {
  /**
   *
   * @param {object} options
   * @param {string} options.packName
   * @param {string} options.componentName
   * @param {object} options.componentJson
   */
  constructor({ packName, componentName, componentJson }) {
    super({ componentName, componentJson });
    this.packName = packName;
  }
  validate() {
    super.validate();
    this._validate();
  }
  _validate() {
    const { packName, componentName, componentJson } = this;
    if (componentJson.pack !== packName) {
      util.log.error(`${packName} does not match the 'pack' field of ${componentName}'s component.json.`);
    }
    if (packName && componentJson.type === 'pack') {
      util.log.error(`A pack within a pack is not supported (pack ${packName}, component ${componentJson.name})`);
    }
  }
}

/**
 * ## generateComponentJsonValidator
 *
 * Generate an instance of a componentJson
 * validator based on the provided options
 *
 * @param {object} options
 * @param {string} options.componentName
 * @param {string} options.packName
 * @param {object} options.componentJson
 * @returns {object} componentJson validator
*/
function generateComponentJsonValidator({ componentName, packName, componentJson }) {
  if (packName) {
    return new PackComponentJsonValidator({ packName, componentName, componentJson });
  }
  return new ComponentJsonValidator({ componentName, componentJson });
}

/**
 * Class used to stage a singleton component
*/
class ComponentStager {
  /**
   *
   * @param {object} options
   * @param {object} options.context
   * @param {string} options.srcPath
   * @param {string} options.destPath
   */
  constructor({ context, srcPath, destPath }) {
    this.context = context;
    this.srcPath = srcPath;
    this.destPath = destPath;
    this.destPathRelease = path.join(destPath, 'min');
  }
  stage() {
    return new Promise((resolve, reject) => {
      try {
        const { context } = this;
        this.stageComponentToDebugLocation();
        if (context.opts.buildType === 'release' || context.componentConfig) {
          this.stageComponentToReleaseLocation();
        }
        resolve(context);
      } catch (error) {
        reject(error);
      }
    });
  }
  stageComponentToDebugLocation() {
    const { srcPath, destPath } = this;
    fs.removeSync(destPath);
    util.ensureDir(destPath);
    fs.copySync(srcPath, destPath);
  }
  stageComponentToReleaseLocation() {
    const { srcPath, destPathRelease } = this;
    fs.removeSync(destPathRelease);
    util.ensureDir(destPathRelease);
    const resourcesPath = path.join(srcPath, 'resources');
    if (util.fsExistsSync(resourcesPath)) {
      fs.copySync(resourcesPath, path.join(destPathRelease, 'resources'));
    }
    const cssFiles = glob.sync('**/*.css', { cwd: srcPath });
    cssFiles.forEach((cssFilePath) => {
      fs.copySync(`${srcPath}/${cssFilePath}`, path.join(destPathRelease, cssFilePath));
    });
  }
}

/**
 * Subclass used to stage a pack component
*/
class PackComponentStager extends ComponentStager {
  /**
   *
   * @param {object} options
   * @param {object} options.context
   * @param {string} options.srcPath
   * @param {string} options.destPath
   * @param {object} options.componentJson
   */
  constructor({ context, srcPath, destPath, componentJson }) {
    super({ context, srcPath, destPath });
    this.srcPath = path.join(srcPath, componentJson.name);
    this.destPath = path.join(destPath, componentJson.name);
    this.destPathRelease = path.join(destPath, 'min', componentJson.name);
  }
}

/**
 * Subclass used to stage a resource component
*/
class ResourceComponentStager extends PackComponentStager {
  /**
   *
   * @param {object} options
   * @param {object} options.context
   * @param {string} options.srcPath
   * @param {string} options.destPath
   * @param {object} options.componentJson
   */
  constructor({ context, srcPath, destPath, componentJson }) {
    super({ context, srcPath, destPath, componentJson });
  }
  stageComponentToReleaseLocation() {
    const { srcPath, destPathRelease } = this;
    fs.removeSync(destPathRelease);
    util.ensureDir(destPathRelease);
    const resourceComponentFiles = glob.sync('**/*', { cwd: srcPath, nodir: true, ignore: ['extension/**'] });
    resourceComponentFiles.forEach((filePath) => {
      fs.copySync(
        path.join(srcPath, filePath),
        path.join(destPathRelease, filePath)
      );
    });
  }
}

/**
 * ## generateComponentStager
 *
 * Generate an instance of a component stager
 * based on the options provided
 *
 * @param {object} options
 * @param {object} options.context
 * @param {object} options.componentJson
 * @param {string} options.srcPath
 * @param {string} options.destPath
 */
function generateComponentStager({ context, componentJson, srcPath, destPath }) {
  if (componentJson.pack) {
    if (componentJson.type === 'resource') {
      return new ResourceComponentStager({ context, srcPath, destPath, componentJson });
    }
    return new PackComponentStager({ context, srcPath, destPath, componentJson });
  }
  return new ComponentStager({ context, srcPath, destPath });
}

module.exports = copyLocalComponent;
