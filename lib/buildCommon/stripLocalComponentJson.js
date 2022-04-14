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
            modifiedComponentJSON = getModifiedComponentJson(jsonFileContent);
            fs.writeJsonSync(pathToComponentJSON, modifiedComponentJSON);
          }
        });
      } else {
        pathToComponentJSON = path.join(builtPath, CONSTANTS.JET_COMPONENT_JSON);
        jsonFileContent = fs.readJSONSync(pathToComponentJSON);
        modifiedComponentJSON = getModifiedComponentJson(jsonFileContent);
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
function getModifiedComponentJson(componentJSON) {
  // Top level attributes required at run-time (RT).
  // Name and pack are not needed at RT, but they are
  // needed during the optimization of the pack's
  // components.
  const requiredTopLevelAttributes = [
    'properties',
    'methods',
    'events',
    'slots',
    'dynamicSlots',
    'pack',
    'name',
    'version',
    'dependencies',
    'extension'
  ];
  // Attributes within the required top-level attributes needed at RT:
  const requiredSubPropertiesAttributes = [
    'enumValues',
    'properties',
    'readOnly',
    'type',
    'value',
    'binding',
    'writeback',
    'extension',
    'internalNames'
  ];
  // Sub-attributes not required in the extension nodes:
  const nonRequiredExtensionAttributes = [
    'vbdt',
    'catalog',
    'audit'
  ];

  // Remove the top-level attributes not needed at RT:
  deleteAttributes(requiredTopLevelAttributes, nonRequiredExtensionAttributes, componentJSON);
  // Remove the listed non-required extension subproperties. We are doing this earlier because
  // we do not have to recursively go into a super-nested node that is to be deleted altogether:
  deleteExtensionAttributes(nonRequiredExtensionAttributes, componentJSON);
  // Go through the required attributes and remove the sub-properties not needed at RT:
  requiredTopLevelAttributes.forEach((topLevelAttribute) => {
    if (componentJSON[topLevelAttribute] !== undefined && topLevelAttribute !== 'dependencies') {
      // Get the sub-properties' attributes:
      const subProperties = Object.getOwnPropertyNames(componentJSON[topLevelAttribute]);
      subProperties.forEach((subProperty) => {
        const attributeObject = componentJSON[topLevelAttribute][subProperty];
        deleteAttributesRecursively(requiredSubPropertiesAttributes,
          nonRequiredExtensionAttributes, attributeObject, topLevelAttribute);
      });
    }
    // Check if after recursively deleting the attritubes, the resulting object is
    // empty. If so, then delete the property:
    deleteEmptyAttribute(componentJSON, topLevelAttribute);
  });
  return componentJSON;
}

/**
 *
 * @param {string[]} requiredAttributes
 * @param {string[]} nonRequiredExtensionAttributes
 * @param {object} attributeObject
 * @param {string} parentAttribute
 *
 * Deletes the attributes in the attributeObject that are not included in the passed
 * requiredAttributes array and those to be deleted as listed in the
 * nonRequiredExtensionAttributes array.
 */
function deleteAttributes(requiredAttributes, nonRequiredExtensionAttributes,
  attributeObject, parentAttribute) {
  const attributes = Object.getOwnPropertyNames(attributeObject);
  attributes.forEach((attribute) => {
    if (!requiredAttributes.includes(attribute)) {
      // eslint-disable-next-line no-prototype-builtins
      if (attributeObject.hasOwnProperty(attribute) &&
               typeof attributeObject[attribute] !== 'object' &&
               parentAttribute !== 'extension') {
        deleteAttribute(attributeObject, attribute);
      } else if (parentAttribute === 'extension' &&
                 nonRequiredExtensionAttributes.includes(attribute)) {
        deleteAttribute(attributeObject, attribute);
      }
    }
  });
}

/**
 *
 * @param {string[]} requiredAttributes
 * @param {string[]} nonRequiredExtensionAttributes
 * @param {object} attributeObject
 * @param {string} parentAttribute
 * Recurse the required attributes's sub-properties to delete un-required details:
 */
function deleteAttributesRecursively(requiredAttributes, nonRequiredExtensionAttributes,
  attributeObject, parentAttribute) {
  if (typeof attributeObject !== 'object' || attributeObject === null) {
    return;
  }
  if (parentAttribute === 'value') {
    return;
  }
  deleteAttributes(requiredAttributes, nonRequiredExtensionAttributes,
    attributeObject, parentAttribute);
  const attributes = Object.getOwnPropertyNames(attributeObject);
  attributes.forEach((attribute) => {
    if (attribute !== 'enumValues') {
      deleteAttributesRecursively(requiredAttributes, nonRequiredExtensionAttributes,
        attributeObject[attribute], attribute);
      deleteEmptyAttribute(attributeObject, attribute);
    }
  });
}

/**
 *
 * @param {object} attributeObject
 * @param {string} attribute
 * Deletes an empty object:
*/
function deleteEmptyAttribute(attributeObject, attribute) {
  if (JSON.stringify(attributeObject[attribute]) === '{}') {
    deleteAttribute(attributeObject, attribute);
  }
}

/**
 *
 * @param {string[]} nonRequiredExtensionAttributes
 * @param {object} jsonObject
 *
 * Deletes the attributes in the jsonObject that are  included in the passed
 * nonRequiredExtensionAttributes array.
 */
function deleteExtensionAttributes(nonRequiredExtensionAttributes, jsonObject) {
  if (typeof jsonObject.extension === 'object') {
    const attributes = Object.getOwnPropertyNames(jsonObject.extension);
    attributes.forEach((attribute) => {
      if (nonRequiredExtensionAttributes.includes(attribute)) {
        // eslint-disable-next-line no-param-reassign
        delete jsonObject.extension[attribute];
      }
    });
  }
}

/**
 *
 * @param {object} attributeObject
 * @param {string} attribute
 * Deletes the attribute in the passed attribute object.
 */
function deleteAttribute(attributeObject, attribute) {
  if (attribute !== 'length') {
    // eslint-disable-next-line no-param-reassign
    delete attributeObject[attribute];
  }
}
module.exports = stripLocalComponentJson;
