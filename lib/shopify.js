/*
 * grunt-shopify
 * https://github.com/wilr/grunt-shopify
 *
 * Copyright (c) 2013 Will Rossiter
 * Licensed under the BSD license.
 */
'use strict';

module.exports = function(grunt) {

    var shopify = shopify || {},
        fs = require('fs'),
        http = require('http');

    /*
     * Return the base api host with the basic auth
     *
     * @return {string}
     */
    shopify.getHost = function() {
        var c = grunt.config('shopify');

        return c.options.url
    };

    /*
     * Return the authenication header for basic auth
     *
     * @return {string}
     */
    shopify.getAuth = function() {
        var c = grunt.config('shopify');
        
        return c.options.api_key + ":" +
            c.options.password;
    };

    /*
     * HTTP Port
     *
     * @return {int}
     */
    shopify.getPort = function() {
        return 80;
    }

    /*
     * Helper to escape HTML
     *
     * @param {string}
     * @return {string}
     */
    shopify.escape = function(text) {
        return text.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /*
     * Helper to detect whether a file is binary or not. Used to handle sending
     * image assets to shopify vs other assets
     *
     * @param {string}
     * @param {Function}
     */
    shopify.isBinaryFile = function(file, callback) {
        var ascii = true,
            i, len;

        fs.readFile(file, function(err, data) {
            if (err) {
                throw err;
            }

            for (i = 0, len = data.length; i < len; i++) {
                if (data[i] > 127) { 
                    ascii = false; 

                    break; 
                }   
            }   

            callback(ascii, data); 
        });
    };

    /*
     * Convert a file path on the local file system to an asset path in shopify
     * as you may run grunt at a higher directory locally.
     *
     * @param {string}
     * @return {string}
     *
     * @todo
     */
    shopify.getAssetKey = function(path) {
        return path;
    };

    /*
     * Shopify noop.
     *
     * Use regarde to monitor changes. To do an initial upload of all files
     * on your local copy, use the shopify upload functionality.
     */
    grunt.registerTask('shopify', function() {
        return true;
    });

    /*
     * Grunt task to handle uploading a new file to Shopify.
     *
     * Should usually be called via event listener setup with regarde.
     */
    grunt.registerTask('shopify:upload', 'Uploads a theme file to Shopify', function(p) {
        if (p == null) {
            p = grunt.config.get('shopify.modified');
        }

        shopify.isBinaryFile(p, function(ascii, data) {
            var post = {};

            if(ascii) {
                // if the file is a binary file 
                post = JSON.stringify({
                    'value': shopify.escape(data),
                    'key': shopify.getAssetKey(p)
                });
            } else {
                post = JSON.stringify({
                    'value': new Buffer(data).toString('base64'),
                    'key': shopify.getAssetKey(p)
                });
            }

            var options = {
                hostname: shopify.getHost(),
                port: shopify.getPort(),
                auth: shopify.getAuth(),
                path: '/admin/assets.json',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(post,'utf8')
                }
            };

            var req = http.request(options, function(res) {
                res.setEncoding('utf8');

                res.on('end', function () {
                    grunt.log.ok("Successfully updated file "+ p + " to shopify");
                });

                return true;
            });

            req.on('error', function(e) {
                grunt.log.error('Problem with PUT request: ' + e.message);

                return false;
            });

            req.write(post);
            req.end();

        });

        return true;
    });

    /*
     * Removes a theme file from shopify.
     *
     * Should usually be called via event listener setup with regarde.
     */
    grunt.registerTask('shopify:delete', 'Removes a theme file from Shopify', function(p) {

        if (p == null) {
            p = grunt.config.get('shopify.modified');
        }

        var options = {
            host: shopify.getHost(),
            port: shopify.getPort(),
            path: '/admin/assets.json?asset[key]='+ shopify.getAssetKey(p),
            method: 'DELETE'
        };

        var req = http.request(options, function(res) {
            res.setEncoding('utf8');

            res.on('end', function () {
                grunt.log.ok("Successfully deleted file "+ p + " from shopify");
            });

            return true;
        });

        req.on('error', function(e) {
            grunt.log.error('Problem with DELETE request: ' + e.message);

            return false;
        });

        return true;
    
    });

    /*
     * Main event handler for tracking changes to a file.
     *
     * 
     */
    grunt.event.on('regarde:file', function (status, target, filepath) {
        grunt.config.set('shopify.modified', filepath);

        switch (status) {
            case 'deleted':
                grunt.log.ok("Deleting "+ filepath + " from shopify");
                grunt.task.run('shopify:delete');

                break;
            case 'added':
            case 'changed':
                grunt.log.ok("Sending "+ filepath + " to shopify");
                grunt.task.run('shopify:upload');

                break;
            default:
                grunt.log.error("Unknown regarde event "+ status + ".");
        }

        return true;
    });
};
