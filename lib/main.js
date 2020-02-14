/**
  Copyright (c) 2015, 2020, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
// This needs to be non-ES6
/* eslint-disable no-var, import/no-dynamic-require, global-require, prefer-arrow-callback */

'use strict';

(function () {
  var _ojNeedsES5;
  var bundle = 'bundle';

  function _ojIsIE11() {
    var nAgt = navigator.userAgent; // eslint-disable-line no-undef
    return nAgt.indexOf('MSIE') !== -1 || !!nAgt.match(/Trident.*rv:11./);
  }
  _ojNeedsES5 = _ojIsIE11();

  // eslint-disable-next-line no-undef
  requirejs.config({
    baseUrl: 'js'
  });

  bundle += (_ojNeedsES5 ? '_es5' : '');
  require([bundle], function () {
  });
}());
