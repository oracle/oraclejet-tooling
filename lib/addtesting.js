/**
  Copyright (c) 2015, 2026, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const util = require('./util');
const config = require('./config');
const CONSTANTS = require('./constants');

const ORACLEJET_JEST_PRESET_TARBALL_REGEX = new RegExp(
  '^https://artifacthub-phx\\.oci\\.oraclecorp\\.com/ojet-dev-local/' +
  'oracle-oraclejet-jest-preset-' +
  '[0-9]+(?:\\.[0-9]+)+(?:[-+][0-9A-Za-z][0-9A-Za-z.-]*)?\\.tgz$'
);

/**
 * Install libraries required for the test environment
 * mocha for MVVM and jest for VDOM architecture.
 * @param {Object} options
 * @returns
 */
function installTestLibraries(options) {
  if (options[CONSTANTS.SKIP_INSTALLATION]) {
    util.log('Skipping library installation...');
    return Promise.resolve();
  }

  util.log('Installing libraries required for testing infrastructure');
  const installer = util.getInstallerCommand({ options });
  const { enableLegacyPeerDeps } = util.getOraclejetConfigJson();
  config.loadOraclejetConfig();
  let testingLibraries;

  if (util.isVDOMApplication()) {
    testingLibraries = config.data.jestTestingLibraries;
  } else {
    testingLibraries = config.data.mochaTestingLibraries;
  }

  if (!testingLibraries) {
    util.log.error(`Specify libraries to install in oraclejetconfig file as needed by the testing environment\n
    (karma for MVVM and jest for VDOM).`);
  }

  try {
    const installArgs = util.getInstallArgs({
      installer,
      dependencies: testingLibraries,
      enableLegacyPeerDeps,
      allowedRemoteTarballRegex: ORACLEJET_JEST_PRESET_TARBALL_REGEX
    });

    return util.spawn(installer.installer, installArgs);
  } catch (error) {
    return Promise.reject(error);
  }
}

module.exports = function (options) {
  return installTestLibraries(options)
    .catch(util.log.error);
};
