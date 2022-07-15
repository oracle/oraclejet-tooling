/**
  Copyright (c) 2015, 2022, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const fs = require('fs-extra');
const path = require('path');
const util = require('../util');
const CONSTANTS = require('../constants');

/**
 *
 * Stripping implementation exported to buildCommon.js:
 */
function stripLocalComponentJson(context) {
  return new Promise((resolve) => {
    const componentsCache = util.getComponentsCache();
    util.getLocalCompositeComponents().forEach((_component) => {
      let pathToComponentJSON;
      let modifiedComponentJSON;
      let jsonFileContent;
      const { builtPath, componentJson } = componentsCache[_component];
      // Modify the component.json in staging by stripping the unwanted attributes and
      // sub-properties during run-time. This stripped json file is then included in
      // the web/../min/loader.js file. The original contents of the json file are restored in
      // restoreLocalCcaComponentJson after minification. Also, if the passed component is a
      // pack, we will need to iterate through its component dependencies. Failure to do so
      // will result in having non-stripped metadata in the component's min/loader.js file:
      if (util.isJETPack({ pack: _component, componentJson })) {
        const dependenciesFromCache = Object.getOwnPropertyNames(componentJson.dependencies);
        dependenciesFromCache.forEach((component) => {
          const componentData = componentsCache[component];
          pathToComponentJSON = path.join(componentData.builtPath, CONSTANTS.JET_COMPONENT_JSON);
          if (fs.readdirSync(componentData.builtPath).includes('loader.js')) {
            jsonFileContent = fs.readJSONSync(pathToComponentJSON);
            modifiedComponentJSON = getStrippedComponentJson(jsonFileContent);
            fs.writeJsonSync(pathToComponentJSON, modifiedComponentJSON);
          }
        });
      } else {
        pathToComponentJSON = path.join(builtPath, CONSTANTS.JET_COMPONENT_JSON);
        jsonFileContent = fs.readJSONSync(pathToComponentJSON);
        modifiedComponentJSON = getStrippedComponentJson(jsonFileContent);
        fs.writeJsonSync(pathToComponentJSON, modifiedComponentJSON);
      }
    });
    resolve(context);
  });
}

/**
 *
 * @param {object} componentJSON
 * @returns {Object} modified componentJSON
 *
 * Strips off the attributes and their sub-properties that are not
 * needed during run time. The componentJSON object comes from staging
 * location but it is later on restored in restoreLocalCcaComponentJson:
 */
function getStrippedComponentJson(componentJSON) {
  // Top level attributes required at run-time (RT). Name and pack are not needed at RT,
  // but they are needed during the optimization of the pack's components:
  const requiredTopLevelAttributes = new Set([
    'properties',
    'methods',
    'events',
    'slots',
    'dynamicSlots',
    'pack',
    'name',
    'version',
    'dependencies',
    'jetVersion'
  ]);
  // Go through the required attributes and remove the sub-properties not needed at RT:
  stripTopLevelAttributes(componentJSON, requiredTopLevelAttributes);
  return componentJSON;
}

/**
 *
 * @param {object} json
 * @param {Array} requiredAttributes
 *
 * Strips off the top level attributes that are not needed during run time.
 */
function deleteUnrequiredTopLevelAttributes(json, requiredAttributes) {
  const attributes = getAttributes(json);
  if (attributes) {
    attributes.forEach((attribute) => {
      if (!requiredAttributes.has(attribute)) {
        // eslint-disable-next-line no-param-reassign
        delete json[attribute];
      }
    });
  }
}

/**
 *
 * @param {object} json
 * @returns {Array | undefined}
 *
 * Returns the names of the attributes of the passed object.
 */
function getAttributes(json) {
  if (isObject(json)) {
    return Object.getOwnPropertyNames(json);
  }
  return undefined;
}

/**
 *
 * @param {object} json
 * @returns {Boolean}
 *
 * Strips off the top level attributes that are not needed during run time.
 */
function isObject(json) {
  // Do not allow array objects:
  return json instanceof Object && !Array.isArray(json);
}

/**
 *
 * @param {object} componentJSON
 * @param {Array} requiredTopLevelAttributes
 *
 * Strips off sub-attributes of the needed top level attributes that are not needed during run time.
 */
function stripTopLevelAttributes(componentJSON, requiredTopLevelAttributes) {
  // Remove non-object top-level attributes not needed at RT:
  deleteUnrequiredTopLevelAttributes(componentJSON, requiredTopLevelAttributes);
  requiredTopLevelAttributes.forEach((topLevelAttribute) => {
    if (isObject(componentJSON[topLevelAttribute]) && topLevelAttribute !== 'dependencies') {
      const subAttributes = getAttributes(componentJSON[topLevelAttribute]);
      if (subAttributes) {
        subAttributes.forEach((subAttribute) => {
          const subAttributeObject = componentJSON[topLevelAttribute][subAttribute];
          stripSubAttribute(subAttributeObject, componentJSON[topLevelAttribute], subAttribute);
        });
        // Delete the resulting object if empty:
        if (isEmpty(componentJSON[topLevelAttribute])) {
          // eslint-disable-next-line no-param-reassign
          delete componentJSON[topLevelAttribute];
        }
      }
    }
  });
}

/**
 *
 * @param {string} attributeName
 * @param {object} attributeObject
 * @param {object} subAttributeObject -- attributeObject[attributeName]
 * @returns {Boolean}
 *
 * Strip the sub-attributes. Go throught the passed object recursively and
 * remove the unrequired sub-attributes.
 */
function stripSubAttribute(subAttributeObject, attributeObject, attributeName) {
  if (!isNeededSubAttribute(attributeName) && !isObject(subAttributeObject)) {
    // eslint-disable-next-line no-param-reassign
    delete attributeObject[attributeName];
    return;
  }
  const attributes = getAttributes(subAttributeObject);
  if (!attributes) {
    return;
  }
  attributes.forEach((attribute) => {
    stripSubAttribute(subAttributeObject[attribute], subAttributeObject, attribute);
  });
  deleteAttribute(subAttributeObject, attributeObject, attributeName);
}

/**
 *
 * @param {string} subAttribute
 * @returns {Boolean}
 *
 * Checks if the passed attribute is a needed sub-attribute.
 */
function isNeededSubAttribute(subAttribute) {
  const requiredSubAttributes = new Set([
    'enumValues',
    'properties',
    'readOnly',
    'type',
    'value',
    'binding',
    'writeback',
    'internalName'
  ]);
  if (requiredSubAttributes.has(subAttribute)) {
    return true;
  }
  return false;
}

/**
 *
 * @param {string} parentAttributeName
 * @param {object} parentAttributeObject
 * @param {object} childAttributeObject -- parentAttributeObject[parentAttributeName]
 * @returns {Boolean}
 *
 * Deletes the unrequired attribute at RT:
 */
function deleteAttribute(childAttributeObject, parentAttributeObject, parentAttributeName) {
  const attributes = getAttributes(childAttributeObject);
  if (attributes) {
    attributes.forEach((attribute) => {
      if (!isNeededSubAttribute(attribute) && !isObject(childAttributeObject[attribute])) {
        // eslint-disable-next-line no-param-reassign
        delete childAttributeObject[attribute];
      }
      if (isEmpty(childAttributeObject)) {
        // eslint-disable-next-line no-param-reassign
        delete parentAttributeObject[parentAttributeName];
      }
    });
    if (isEmpty(childAttributeObject)) {
      // eslint-disable-next-line no-param-reassign
      delete parentAttributeObject[parentAttributeName];
    }
  }
}

/**
 *
 * @param {object} json
 * @returns {Boolean}
 *
 * Checks if the passed object is empty.
 */
function isEmpty(json) {
  if (isObject(json) && JSON.stringify(json) === '{}') {
    return true;
  }
  return false;
}

module.exports = stripLocalComponentJson;
