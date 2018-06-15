#! /usr/bin/env node
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
const catalog = require('./scopes/catalog');
const CONSTANTS = require('./constants');
const util = require('./util');

/**
 * # Switch for 'ojet.configure()'
 *
 * @public
 * @param {string} scope
 * @param {Object} parameters
 */
module.exports = function (scope, parameters) {
  switch (scope) {
    case (CONSTANTS.API_SCOPES.CATALOG): {
      const catalogUrl = CONSTANTS.CATALOG_URL_PARAM;
      if (parameters && util.hasProperty(parameters, catalogUrl)) {
        return catalog.configureCatalogUrl(parameters[catalogUrl]);
      }
      util.log.error(`Please specify ojet.${CONSTANTS.API_TASKS.CONFIGURE}() '${catalogUrl}' parameter.`);
      return false;
    }
    default:
      util.log.error(`Please specify ojet.${CONSTANTS.API_TASKS.CONFIGURE}() 'scope' parameter.`);
      return false;
  }
};
