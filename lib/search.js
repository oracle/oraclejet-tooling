#! /usr/bin/env node
/**
  Copyright (c) 2015, 2018, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/

'use strict';

/**
 * ## Dependencies
 */
const exchange = require('./scopes/exchange');
const CONSTANTS = require('./constants');
const util = require('./util');

/**
 * # Switch for 'ojet.search()'
 *
 * @public
 * @param {string} scope
 * @param {string} parameter
 * @returns {Promise}
 */
module.exports = function (scope, parameter) {
  switch (scope) {
    case (CONSTANTS.API_SCOPES.EXCHANGE):
      return exchange.search(parameter);
    default:
      util.log.error(`Please specify ojet.${CONSTANTS.API_TASKS.SEARCH}() 'scope' parameter.`);
      return false;
  }
};
