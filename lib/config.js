/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
/**
 * Provide access to config data, if one parameter is passed in, call config.get, if two parameters pssed in, call config.set
 *
 * @param  {String} prop property to set
 * @param  {String} value value to set
 * @returns {this}
 */
var config = module.exports = function(prop, value) {
  if (arguments.length === 2) {
    return config.set(prop, value);
  } else {
    return config.get(prop);
  }
};

config.data = {};

/**
 * Get the config value
 * @param  {String} prop property to get
 * @returns {String} return 
 */
config.get = function(prop) {
  if (prop) {
    return config.data[prop];
  } else {
    return config.data;
  }
};

/**
 * Set the config value
 * @param  {String} prop property to set
 * @param  {*} value value to set
 * @returns {String} return 
 */
config.set = function(prop, value) {
  return config.data[prop] = value;
};

/**
 * Create a new config 
 * @param  {Object} value to set the config.data to
 * @returns {String} return 
 */
config.init = function(obj) {
  return (config.data = obj || {});
};

