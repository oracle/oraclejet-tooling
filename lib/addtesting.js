/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
const util = require('./util');
const config = require('./config');

/**
 * Install libraries required for the test environment
 * mocha for MVVM and jest for VDOM architecture.
 * @param {Object} options
 * @returns
 */
function installTestLibraries(options) {
  util.log('Installing libraries required for testing infrastructure');
  const installer = util.getInstallerCommand({ options });
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
  const command = `
    ${installer.installer} ${installer.verbs.install} ${testingLibraries}
    --save-dev --save-exact
  `.replace(/\n/g, '').replace(/\s+/g, ' ');
  return util.exec(command);
}

module.exports = function (options) {
  return installTestLibraries(options)
    .catch(util.log.error);
};
