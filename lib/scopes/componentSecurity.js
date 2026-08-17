/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
'use strict';

const path = require('path');

const EXCHANGE_COMPONENT_NAME_REGEXP = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const EXCHANGE_COMPONENT_VERSION_REGEXP =
  /^[0-9A-Za-z~^<>=*][0-9A-Za-z._*+~^<>=| -]*$/;
const UNSAFE_EXCHANGE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Throws when an Exchange-supplied component or pack name is not safe to use
 * as an object key or filesystem path segment.
 *
 * @param {string} componentName Exchange component, pack, or pack member name.
 * @param {string} label Human-readable label included in the error message.
 * @returns {void}
 */
function assertSafeExchangeComponentName(componentName, label) {
  if (!isSafeExchangeComponentName(componentName)) {
    throw new Error(`Blocked Exchange response with unsafe ${label} '${componentName || ''}'.`);
  }
}

/**
 * Throws when an Exchange-supplied component version is not safe to use in the
 * component install flow. Exchange can return semver ranges such as ^5.0.0, but
 * path-like or otherwise malformed values are rejected early because versions
 * are later used in download URLs, archive filenames, and config values.
 *
 * @param {string} componentVersion Exchange component or pack version.
 * @param {string} label Human-readable label included in the error message.
 * @returns {void}
 */
function assertSafeExchangeComponentVersion(componentVersion, label) {
  if (!isSafeExchangeComponentVersion(componentVersion)) {
    throw new Error(`Blocked Exchange response with unsafe ${label} '${componentVersion || ''}'.`);
  }
}

/**
 * Checks whether a component or pack name is safe for Exchange install
 * processing. Safe names are simple path segments and exclude prototype
 * pollution keys.
 *
 * @param {*} componentName Value to validate.
 * @returns {boolean} true when the name is safe.
 */
function isSafeExchangeComponentName(componentName) {
  return typeof componentName === 'string' &&
    EXCHANGE_COMPONENT_NAME_REGEXP.test(componentName) &&
    !UNSAFE_EXCHANGE_OBJECT_KEYS.has(componentName) &&
    !componentName.includes('/') &&
    !componentName.includes('\\') &&
    !path.isAbsolute(componentName);
}

/**
 * Checks whether a component version is a safe semver/range-like string
 * accepted from Exchange response payloads.
 *
 * @param {*} componentVersion Value to validate.
 * @returns {boolean} true when the version is safe.
 */
function isSafeExchangeComponentVersion(componentVersion) {
  return typeof componentVersion === 'string' &&
    EXCHANGE_COMPONENT_VERSION_REGEXP.test(componentVersion) &&
    !componentVersion.includes('/') &&
    !componentVersion.includes('\\') &&
    !path.isAbsolute(componentVersion);
}

/**
 * Throws when an Exchange response value is not a plain object. This blocks
 * arrays, functions, class instances, and other objects that should not be
 * traversed as response maps.
 *
 * @param {*} value Value to validate.
 * @param {string} label Human-readable label included in the error message.
 * @returns {void}
 */
function assertPlainExchangeObject(value, label) {
  if (!isPlainExchangeObject(value)) {
    throw new Error(`Blocked Exchange response with invalid ${label}.`);
  }
}

/**
 * Checks whether a value is a plain object that can be safely traversed as an
 * Exchange response map.
 *
 * @param {*} value Value to validate.
 * @returns {boolean} true when the value is a plain object or null-prototype object.
 */
function isPlainExchangeObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Resolves path segments and verifies that the resulting path stays inside the
 * intended base directory.
 *
 * @param {string} baseDir Directory that must contain the resolved path.
 * @param {...string} pathSegments Path segments to resolve under baseDir.
 * @returns {string} Resolved path inside baseDir.
 */
function resolvePathInside(baseDir, ...pathSegments) {
  const basePath = path.resolve(baseDir);
  const targetPath = path.resolve(basePath, ...pathSegments);
  const relativePath = path.relative(basePath, targetPath);

  if (relativePath && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
    throw new Error(`Blocked Exchange response path '${targetPath}' outside '${basePath}'.`);
  }
  return targetPath;
}

/**
 * Preflights all Exchange environment/config changes before project files or
 * oraclejetconfig.json are modified. Remove entries validate names only; add
 * and update entries also validate versions because they are used for archive
 * download and filesystem operations.
 *
 * @param {Object} solution Exchange dependency resolver solution payload.
 * @returns {void}
 */
function validateExchangeSolution(solution) {
  assertPlainExchangeObject(solution, 'solution');
  validateChangeSet(solution.environmentChanges, 'environmentChanges', true);
  validateChangeSet(solution.configChanges, 'configChanges', false);
}

/**
 * Validates one Exchange change-set object, such as environmentChanges or
 * configChanges.
 *
 * @param {Object|undefined|null} changes Change-set object from Exchange.
 * @param {string} label Human-readable label included in error messages.
 * @param {boolean} requirePackVersion Whether pack version is required.
 * @returns {void}
 */
function validateChangeSet(changes, label, requirePackVersion) {
  if (changes === undefined || changes === null) {
    return;
  }
  assertPlainExchangeObject(changes, label);
  ['remove', 'add', 'update'].forEach((changeType) => {
    if (Object.prototype.hasOwnProperty.call(changes, changeType)) {
      validateComponentChanges(
        changes[changeType],
        `${label}.${changeType}`,
        changeType !== 'remove',
        requirePackVersion && changeType !== 'remove'
      );
    }
  });
}

/**
 * Validates a remove/add/update component map.
 *
 * @param {Object} changes Component map from one change type.
 * @param {string} label Human-readable label included in error messages.
 * @param {boolean} validateVersions Whether component versions are required.
 * @param {boolean} requirePackVersion Whether pack version is required.
 * @returns {void}
 */
function validateComponentChanges(changes, label, validateVersions, requirePackVersion) {
  assertPlainExchangeObject(changes, label);
  Object.keys(changes).forEach((comp) => {
    assertSafeExchangeComponentName(comp, 'component name');
    validateComponentChangeEntry(comp, changes[comp], label, validateVersions, requirePackVersion);
  });
}

/**
 * Validates a single component or pack change entry.
 *
 * @param {string} comp Component or pack name.
 * @param {string|Object} entry Version string or pack descriptor.
 * @param {string} label Human-readable label included in error messages.
 * @param {boolean} validateVersions Whether component versions are required.
 * @param {boolean} requirePackVersion Whether pack version is required.
 * @returns {void}
 */
function validateComponentChangeEntry(comp, entry, label, validateVersions, requirePackVersion) {
  if (typeof entry === 'string') {
    if (validateVersions) {
      assertSafeExchangeComponentVersion(entry, `version for component '${comp}'`);
    }
  } else if (isPlainExchangeObject(entry)) {
    validatePackComponentChangeEntry(comp, entry, label, validateVersions, requirePackVersion);
  } else {
    throw new Error(`Blocked Exchange response with invalid ${label} entry for '${comp}'.`);
  }
}

/**
 * Validates an Exchange pack descriptor and its component version map.
 *
 * @param {string} comp Pack name.
 * @param {Object} entry Pack descriptor containing version and components.
 * @param {string} label Human-readable label included in error messages.
 * @param {boolean} validateVersions Whether pack and component versions are required.
 * @param {boolean} requirePackVersion Whether pack version is required.
 * @returns {void}
 */
function validatePackComponentChangeEntry(
  comp,
  entry,
  label,
  validateVersions,
  requirePackVersion
) {
  assertPlainExchangeObject(entry.components, `components for pack '${comp}'`);
  if (requirePackVersion || (validateVersions && entry.version != null)) {
    assertSafeExchangeComponentVersion(entry.version, `version for pack '${comp}'`);
  }
  Object.keys(entry.components).forEach((packComp) => {
    assertSafeExchangeComponentName(packComp, `component name in pack '${comp}'`);
    if (validateVersions) {
      assertSafeExchangeComponentVersion(
        entry.components[packComp],
        `version for component '${comp}/${packComp}'`
      );
    }
  });
}

/**
 * Safely merges Exchange config add/update changes into the current component
 * configuration, rejecting unsafe names, versions, and non-plain pack objects.
 *
 * @param {Object} components Existing oraclejetconfig.json components object.
 * @param {Object} changes Exchange configChanges.add or configChanges.update map.
 * @returns {Object} Mutated components object with safe changes applied.
 */
function mergeChanges(components, changes) {
  const mergedComponents = components;
  assertPlainExchangeObject(changes, 'configChanges');

  Object.keys(changes).forEach((comp) => {
    assertSafeExchangeComponentName(comp, 'component name');
    if (typeof changes[comp] === 'string') {
      assertSafeExchangeComponentVersion(changes[comp], `version for component '${comp}'`);
      mergedComponents[comp] = changes[comp];
    } else if (isPlainExchangeObject(changes[comp])) {
      const existingPack = Object.prototype.hasOwnProperty.call(mergedComponents, comp) ?
        mergedComponents[comp] : {};
      const pack = isPlainExchangeObject(existingPack) ? existingPack : {};
      pack.components = isPlainExchangeObject(pack.components) ? pack.components : {};
      assertPlainExchangeObject(changes[comp].components, `components for pack '${comp}'`);
      Object.keys(changes[comp].components).forEach((packComp) => {
        assertSafeExchangeComponentName(packComp, `component name in pack '${comp}'`);
        assertSafeExchangeComponentVersion(
          changes[comp].components[packComp],
          `version for component '${comp}/${packComp}'`
        );
        pack.components[packComp] = changes[comp].components[packComp];
      });
      if (changes[comp].version != null) {
        assertSafeExchangeComponentVersion(changes[comp].version, `version for pack '${comp}'`);
        pack.version = changes[comp].version;
      }
      mergedComponents[comp] = pack;
    } else {
      throw new Error(`Blocked Exchange response with invalid configChanges entry for '${comp}'.`);
    }
  });
  return mergedComponents;
}

module.exports = {
  assertPlainExchangeObject,
  assertSafeExchangeComponentName,
  assertSafeExchangeComponentVersion,
  isPlainExchangeObject,
  isSafeExchangeComponentName,
  isSafeExchangeComponentVersion,
  mergeChanges,
  resolvePathInside,
  validateExchangeSolution
};
