/**
  Copyright (c) 2015, 2023, Oracle and/or its affiliates.
  Licensed under The Universal Permissive License (UPL), Version 1.0
  as shown at https://oss.oracle.com/licenses/upl/

*/
module.exports = (options) => {
  // eslint-disable-next-line global-require
  const setup = require('./setup');
  // eslint-disable-next-line global-require
  const ojetUtils = require('../util');
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const WebpackDevServer = ojetUtils.requireLocalFirst('webpack-dev-server');
  return new Promise(() => {
    ojetUtils.log('Serving with Webpack');
    const { webpack, webpackConfig } = setup({ platform: 'web', options });
    const compiler = webpack(webpackConfig);
    if (webpackConfig.devServer) {
      const devServerOptions = { ...webpackConfig.devServer };
      const server = new WebpackDevServer(devServerOptions, compiler);
      const port = devServerOptions.port || 8001;
      const host = devServerOptions.host || '127.0.0.1';
      server.start(port, host);
    } else {
      ojetUtils.log.error(
        `
        Serving with the --release flag is currently not supported. Please
        run 'ojet build --release' and then serve the built folder
        using your favorite command line server (e.g. http-server).
      `.replace(/\n/g, '').replace(/\s+/g, ' '));
    }
  });
};
