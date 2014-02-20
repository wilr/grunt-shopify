/*
 * grunt-shopify
 * https://github.com/wilr/grunt-shopify
 *
 * Copyright (c) 2013 Will Rossiter
 * Licensed under the BSD license.
 */
'use strict';

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

    /**
     * Grunt watch event
     */
    grunt.event.on('watch', function(action, filepath) {
        function errorHandler(err) {
            if (err) {
                grunt.log.error(err);
            }
        }

        if (action === 'deleted') {
            shopify.remove(filepath, errorHandler);
        } else if (grunt.file.isFile(filepath)) {
            switch (action) {
                case 'added':
                case 'changed':
                case 'renamed':
                shopify.upload(filepath, errorHandler);
                break;
            }
        } else {
            shopify.notify('Skipping non-file ' + filepath);
        }
    });
};
