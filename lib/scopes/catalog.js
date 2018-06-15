#! /usr/bin/env node
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
// Node
const fs = require('fs');

// Oracle
const CONSTANTS = require('../constants');
const util = require('../util');

/**
 * # Catalog
 *
 * @public
 */
const catalog = module.exports;

/**
 * ## configure
 *
 * @public
 * @param {string} url - catalog url
 */
catalog.configureCatalogUrl = function (url) {
  return new Promise((resolve) => {
    const configObj = util.readJsonAndReturnObject(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`);
    configObj['catalog-url'] = url;
    try {
      fs.writeFileSync(`./${CONSTANTS.ORACLE_JET_CONFIG_JSON}`, JSON.stringify(configObj, null, 2));
      util.log.success(`Catalog url set: '${url}'`);
      resolve();
    } catch (e) {
      util.log.error('Catalog url could not be set.');
    }
  });
};

/**
 * ## search
 *
 * @public
 * @param {string} parameter
 */
catalog.search = function (parameter) {
  return new Promise((resolve) => {
    util.ensureParameters(parameter, CONSTANTS.API_TASKS.SEARCH);
    util.log(`Searching for '${parameter}' in the catalog ...`);
    util.request({
      path: `/components/?q=${parameter}*&format=full`,
    }, (response) => {
      let responseBody = '';
      response.on('data', (respBody) => {
        responseBody += respBody;
      });
      response.on('end', () => {
        util.checkForHttpErrors(response, responseBody);
        const components = JSON.parse(responseBody).items;

        if (components.length === 0) {
          util.log.success('No components found.');
        } else {
          _printHead();
          _printResults(components, parameter);
        }
        resolve();
      });
    });
  });
};

const table = {
  name: 40,
  displayName: 40,
  tags: 40,
  description: 40
};

const space = ' ';

/**
 * ## _printHead
 *
 * @private
 */
function _printHead() {
  let headLine = '';
  Object.keys(table).forEach((key) => {
    const colSpaces = table[key] - key.length;
    if (colSpaces < 0) {
      headLine += `<${key.substring(0, table[key] - 2)}>${space}`;
    } else {
      headLine += `<${key}>${space.repeat(colSpaces - 2)}${space}`;
    }
  });
  util.log(headLine);
}

/**
 * ## _printResults
 *
 * @private
 * @param {Array} components
 * @param {string} parameter
 */
function _printResults(components, parameter) {
  components.forEach((component) => {
    const comp = component;
    let line = '';

    Object.keys(table).forEach((key) => {
      // 'displayName' and 'description' are within metadata[component] scope
      if (['displayName', 'description'].indexOf(key) > -1) {
        comp[key] = comp.component[key] || '';
      }

      if (util.hasProperty(comp, key)) {
        // Custom handling for 'tags'
        if (key === 'tags') {
          comp[key] = _processTags(comp[key], parameter);
        }

        const colSpaces = table[key] - comp[key].length;

        if (colSpaces < 0) {
          line += comp[key].substring(0, table[key]) + space;
        } else {
          line += comp[key] + space.repeat(colSpaces) + space;
        }
      }
    });

    util.log(line);
  });
}

/**
 * ## _processTags
 *
 * @private
 * @param {Array} tags
 * @param {string} parameter
 */
function _processTags(tags, parameter) {
  const lowerCaseTags = tags.map(value => value.toLowerCase());

  function matchTag(tag) {
    return tag.match(parameter.toLowerCase());
  }

  const i = lowerCaseTags.findIndex(matchTag);

  return i > -1 ? tags[i] : tags[0] || '';
}
