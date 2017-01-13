/**
  Copyright (c) 2015, 2017, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
 * # Tooling for Oracle JET apps
 * - - -
 * *This is the description. See more at [Oracle JET](http://oraclejet.org) website.*
 */

"use strict";

/**
 * Expose ojet object
 */
let ojet = module.exports = {};

/**
 * Expose libraries
 */
['config', 'build', 'serve'].forEach(function(name)
{
  ojet[name] = require('./lib/' + name);
});

/**
 * Expose other objects
 */
ojet.package = require('./package.json');
ojet.version = ojet.package.version;
