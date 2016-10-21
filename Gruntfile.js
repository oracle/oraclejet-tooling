/**
  Copyright (c) 2015, 2016, Oracle and/or its affiliates.
  The Universal Permissive License (UPL), Version 1.0
*/
module.exports = function (grunt) {
  grunt.initConfig({
  });
  

  // Load grunt tasks from NPM packages
  require("load-grunt-tasks")(grunt);
  
  // Merge sub configs
  var options = {
    config : {
      src : "build/*.js"
    },
    pkg: grunt.file.readJSON("package.json"),
    jet_version_token:'2.2.0',
    jet_doc_version_token:'undefined',
    version_token:'2.2.0'
  }
  var configs = require('load-grunt-configs')(grunt, options);
  grunt.config.merge(configs);

  // Load tasks
  grunt.loadTasks("build");

  grunt.registerTask('build', '', [
    'clean:files',
    'copy-files'
  ]);
};

