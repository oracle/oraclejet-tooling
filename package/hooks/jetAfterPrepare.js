#!/usr/bin/env node
/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
'use strict';

/**
 * Jet after_prepare hook.
 * Please do not modify.
 * In case you need some after_prepare functionality, please follow Cordova documentation and create another hook.
 */

/**
 * # Dependencies
 */

var injector = require("./jetInjector");

/**
 * # After prepare hook
 * 
 * @public 
 */

module.exports = function(context)
{
  var platforms = context.opts.platforms;

  if (platforms)
  {
    platforms.forEach(function(value)
      {
        injector.updateIndexHtml(value);
        injector.updateConfigXml(value);
      }
    );
  }
};
