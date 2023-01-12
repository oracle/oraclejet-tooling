/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const glob = require('glob');
const path = require('path');
const util = require('../util');
const fs = require('fs-extra');
const CONSTANTS = require('../constants');

const _ = {};
_.union = require('lodash.union');
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
      const destPath = path.join(
        destBase,
        componentName,
        context.opts[CONSTANTS.OMIT_COMPONENT_VERSION_FLAG] ? '' : componentJson.version
      );
      if (util.isJETPack({ componentJson })) {
        // Only copy top-level jet pack files (e.g component.json) and the extension and
        // utils folders. However, it is legitimate that the packaged folder structure for
        // the mono-pack zip file contains extra folders as not all of the modules exposed
        // by the mono-pack are necessarily within composite components or resource compo-
        // nents. Therefore, do not filter directories in mono-packs when copying its con-
        // tents.
        const pathContentArray = _.union(
          util.getFiles(srcPath),
          componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK ? fs.readdirSync(srcPath) :
            fs.readdirSync(srcPath).filter(item => item === 'extension' || item === 'utils')
        );
        pathContentArray.forEach((fileInPath) => {
          fs.copySync(
            path.join(srcPath, fileInPath),
            path.join(destPath, fileInPath),
            { dereference: true }
          );
        });
        const packName = componentName;
        const componentsCache = util.getComponentsCache();
        const packComponentJson = componentsCache[packName].componentJson;
        if (util.hasProperty(packComponentJson, 'dependencies')) {
          let packMemberNameList;
          // In mono-pack, we do not add entries in the dependencies for
          // components in the same pack. However, since the entries are
          // used below to retrieve the componentCache for the respective
          // component, then we need to generate the pack member list:
          if (packComponentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK) {
            packMemberNameList = _.union(util.getMonoPackMemberNameList(packComponentJson),
              Object.keys(packComponentJson.dependencies));
          } else {
            packMemberNameList = Object.keys(packComponentJson.dependencies);
          }
          packMemberNameList.forEach((packMemberName) => { // eslint-disable-line max-len
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
              // eslint-disable-next-line no-lonely-if
              if (componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK) {
                // Do not do anything. It is possible that other pack
                // prefix can be in the mono-pack dependencies object.
              } else {
                util.log.error(`Missing pack prefix for component ${packMemberName} in ${packName}`);
              }
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
      util.log.error(`${componentName}\'s component.json is missing a 'name' field`); // eslint-disable-line no-useless-escape
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
    if (packName && (componentJson.type === 'pack' || componentJson.type === CONSTANTS.PACK_TYPE.MONO_PACK)) {
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
    fs.copySync(srcPath, destPath, { dereference: true });
    generateRootIndexFile(srcPath, destPath);
  }
  stageComponentToReleaseLocation() {
    const { srcPath, destPathRelease } = this;
    fs.removeSync(destPathRelease);
    util.ensureDir(destPathRelease);
    const resourcesPath = path.join(srcPath, 'resources');
    if (util.fsExistsSync(resourcesPath)) {
      fs.copySync(resourcesPath, path.join(destPathRelease, 'resources'), { dereference: true });
      generateRootIndexFile(srcPath, destPathRelease);
    }
    const cssFiles = glob.sync('**/*.css', { cwd: srcPath });
    cssFiles.forEach((cssFilePath) => {
      fs.copySync(`${srcPath}/${cssFilePath}`, path.join(destPathRelease, cssFilePath), { dereference: true });
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
        path.join(destPathRelease, filePath),
        { dereference: true }
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
    if (componentJson.type === CONSTANTS.COMPONENT_TYPE.RESOURCE) {
      return new ResourceComponentStager({ context, srcPath, destPath, componentJson });
    }
    return new PackComponentStager({ context, srcPath, destPath, componentJson });
  }
  return new ComponentStager({ context, srcPath, destPath });
}

/**
 * ## generateRootIndexFile
 *
 * Generate an root index file under the web/../resources/nls folder:
 *
 * @param {string} options.destPath
 */
function generateRootIndexFile(srcPath, destPath) {
  const pathToNlsFolder = path.join(destPath, 'resources', 'nls');
  const pathToNlsRootFolder = path.join(pathToNlsFolder, 'root');
  const pathToNlsRootFolderInSrc = path.join(srcPath, 'resources', 'nls', 'root');
  // Get the array of contents under the nls/root folder, which is the string file:
  util.getFiles(pathToNlsRootFolder).forEach((file) => {
    const pathToComponentStringFile = path.join(pathToNlsFolder, 'root', file);
    const pathToRootIndexFileInWeb = path.join(pathToNlsFolder, file);
    const pathToRootIndexFileInSrc = path.join(srcPath, 'resources', 'nls', file);
    if (fs.existsSync(pathToNlsRootFolderInSrc) && !(fs.existsSync(pathToRootIndexFileInSrc))) {
      // eslint-disable-next-line max-len
      const fileContent = getModifiedComponentStringFileContent(pathToComponentStringFile, pathToNlsFolder);
      fs.writeFileSync(pathToRootIndexFileInWeb, fileContent);
      // Delete the web/../nls/root/<fileName> folder as it is no londer needed:
      if (fs.existsSync(pathToComponentStringFile)) {
        fs.removeSync(pathToComponentStringFile);
      }
      // Delete the web/../nls/root folder if empty as it is no londer needed:
      if (fs.readdirSync(pathToNlsRootFolder).length === 0) {
        fs.removeSync(pathToNlsRootFolder);
      }
    }
  });
}

/**
 * ## getModifiedComponentStringFileContent
 *
 * Modifies the component string file content
 *
 * @param {string} pathToComponentStringFile
 * @param {string} pathToNlsFolder
 */
function getModifiedComponentStringFileContent(pathToComponentStringFile, pathToNlsFolder) {
  // eslint-disable-next-line max-len
  const componentStringFileContent = fs.readFileSync(pathToComponentStringFile, { encoding: 'utf-8' });
  // The retrieved file content in the form:
  // export = {componentName: {sampleString: 'Details...'}}. Therefore, the retrieved
  // object content will be componentName: {sampleString: 'Details...'}.
  const regex = /{(?<exportedObjectContent>.*)}/gms;
  const match = regex.exec(componentStringFileContent);
  // Modify the exported content to export = {root : {componentName: {sampleString: 'Details...'}}}.
  let modifiedStringFileContent = `\n "root": {${match.groups.exportedObjectContent} },`;
  // Go through the nls folder and check if there are any other languages chosen for translation.
  // If there are any, add them as part of the exported object in the form:
  // "<language>": true. In the case German and French are the included languages,
  // then the added items will be: "de":true, "fr":true.
  const nlsFolderContents = fs.readdirSync(pathToNlsFolder);
  nlsFolderContents.forEach((content) => {
    const pathToNlsFolderContent = path.join(pathToNlsFolder, content);
    if (content !== 'root' && fs.lstatSync(pathToNlsFolderContent).isDirectory()) {
      modifiedStringFileContent = modifiedStringFileContent.concat(` \n "${content}": true,`);
    }
  });
  return componentStringFileContent.replace(`${match.groups.exportedObjectContent}`, `${modifiedStringFileContent}\n`);
}

module.exports = copyLocalComponent;
