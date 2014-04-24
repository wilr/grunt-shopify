/*
 * grunt-shopify
 * https://github.com/wilr/grunt-shopify
 *
 * Copyright (c) 2013 Will Rossiter
 * Licensed under the BSD license.
 */
'use strict';

var path = require('path');

module.exports = function(grunt) {
    var shopify = require('./lib/shopify')(grunt);

    /*
     * Shopify noop.
     *
     * Use watch to monitor changes. To do an initial upload of all files on
     * your local copy, use the shopify upload functionality.
     */
    grunt.registerTask('shopify', function() {
        return true;
    });

    grunt.registerTask('shopify:download', 'Downloads a single theme file from shopify, or the entire theme if no file is specified', function(p) {
        var done = this.async();
        if (p) {
          shopify.download(p, done);
        } else {
          shopify.downloadTheme(done);
        }
    });

    grunt.registerTask('shopify:themes', 'Displays the list of available themes', function() {
        var done = this.async();

        shopify.themes(done);
    });

    grunt.registerTask('shopify:upload', 'Uploads a single theme file to Shopify, or the entire theme if no file is specified', function(p) {
        var done = this.async();
        if (p) {
          shopify.upload(p, done);
        } else {
          shopify.deploy(done);
        }
    });

    grunt.registerTask('shopify:delete', 'Removes a theme file from Shopify', function(p) {
        var done = this.async();
        shopify.remove(p, done);
    });

    grunt.registerMultiTask('shopifyupload', 'Uploads files to Shopify, the grunt way', function() {
        var done = this.async(), 
            src = null;

        this.files.forEach(function(f) {
          src = f.src.filter(function(filepath) {
            var realpath = path.join(process.cwd(), grunt.config('shopify.options.base'), filepath);

            if (!grunt.file.exists(realpath)) {
              grunt.log.warn('Source file ' + path.join(grunt.config('shopify.options.base'), filepath) + ' not found.');
              return false;
            } else if(grunt.file.isFile(realpath)) {
              return true;
            } else {
              return false;
            }
          });
        });

        if (src && src.length === 0) {
          grunt.log.warn('No files uploaded because no source files could be found.');
          return;
        }

        shopify.deploy(done, src);
    });

    /**
     * Grunt watch event
     */
    grunt.event.on('watch', shopify.watchHandler);
};
