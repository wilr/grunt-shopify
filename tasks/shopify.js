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

        return c.options.url;
    };

    /*
     * Return the authentication header for basic auth
     *
     * @return {string}
     */
    shopify.getAuth = function() {
        var c = grunt.config('shopify');
        
        return c.options.api_key + ":" + c.options.password;
    };

    /*
     * HTTP Port
     *
     * @return {int}
     */
    shopify.getPort = function() {
        return 80;
    };

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

        fs.readFile(file, "utf8", function(err, data) {
            if (err) {
                grunt.log.error("isBinaryFile failed on " + file +": "+ err);

                return false;
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

    /**
     * Helper for reporting Http response success and error messages to the
     * user
     *
     * @param {response}
     * @param {string}
     */
    shopify.notify = function(res, msg) {
        if(res.statusCode >= 400) {
            grunt.log.error("[grunt-shopify] - Error "+ msg +" (Status Code: "+ res.statusCode + ")");
        }
        else {
            grunt.log.ok("[Grunt-Shopify] - Success "+ msg +" (Status Code: "+ res.statusCode + ")");
        }
    }; 

    /*
     * Convert a file path on the local file system to an asset path in shopify
     * as you may run grunt at a higher directory locally.
     *
     * The original path to a file may be something like shop/assets/site.css
     * whereas we require assets/site.css in the API. To customize the base
     * set shopify.options.base config option.
     *
     * @param {string}
     * @return {string}
     *
     * @todo
     */
    shopify.getAssetKey = function(path) {
        var c = grunt.config('shopify');

        if(c.options.base) {
            return path.substring(path.indexOf(c.options.base) + c.options.base.length);
        }

        return path;
    };

    /*
     * Remove a given file path from shopify.
     *
     * File should be the relative path on the local filesystem. See 
     * getAssetKey for the conversion to remote asset location
     *
     * @param {string}
     */
    shopify.remove = function(file) {
        var path = shopify.getAssetKey(file);

        var options = {
            host: shopify.getHost(),
            port: shopify.getPort(),
            path: '/admin/assets.json',
            method: 'DELETE',
            query: {
                'asset[key]': path
            }
        };

        grunt.log.ok('[grunt-shopify] - Executing DELETE on '+ path);

        var req = http.request(options, function(res) {
            res.setEncoding('utf8');

            res.on('end', function () {
                shopify.notify(res, "deleting file on shopify");
            });

            return true;
        });

        req.on('error', function(e) {
            grunt.log.error('[grunt-shopify] - Problem with DELETE request: ' + e.message);

            return false;
        });

        req.end();

        return true;
    };

    /*
     * Upload a given file path to Shopify
     *
     * Assets need to be in a suitable directory.
     *      - Liquid templates => "templates/"
     *      - Liquid layouts => "layout/"
     *      - Liquid snippets => "snippets/"
     *      - Theme settings => "config/"
     *      - General assets => "assets/"
     *
     * Some requests may fail if those folders are ignored
     */
    shopify.upload = function(file) {
        shopify.isBinaryFile(file, function(ascii, data) {
            var key = shopify.getAssetKey(file),
                post = {};

            if(ascii) {
                // if the file is a binary file 
                post = JSON.stringify({
                    'asset': {
                        'value': data,
                        'key': key
                    }
                });
            } else {
                post = JSON.stringify({
                    'asset': {
                        'value': new Buffer(data).toString('base64'),
                        'key': key
                    }
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

            grunt.log.ok('[grunt-shopify] - Executing PUT on '+ key);

            var req = http.request(options, function(res) {
                res.setEncoding('utf8');

                res.on('end', function () {
                    shopify.notify(res, "uploading file on shopify");
                });

                return true;
            });

            req.on('error', function(e) {
                grunt.log.error('[grunt-shopify] - Problem with PUT request: ' + e.message);

                return false;
            });

            req.write(post);
            req.end();
        });

        return true;
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

    grunt.registerTask('shopify:upload', 'Uploads a theme file to Shopify', function(p) {
        shopify.upload(p);
    });

    grunt.registerTask('shopify:delete', 'Removes a theme file from Shopify', function(p) {
        shopify.remove(p);
    });

    /*
     * Main event handler for tracking changes to a file.
     *
     * @todo If the event changed property is a folder then ignore it for now.
     */
    grunt.event.on('regarde:file', function (status, target, filepath) {
        var upload = true;

        try {
            if(fs.lstatSync(filepath).isDirectory()) {
                upload = false;
            }
        } catch (e) {
            //
        }
        
        if(upload) {
            switch (status) {
                case 'deleted':
                    shopify.remove(filepath);

                    break;
                case 'added':
                case 'changed':
                case 'renamed':
                    shopify.upload(filepath);

                    break;
            }
        } else {
            grunt.log.warn("Skipping directory "+ filepath);
        }

        return true;
    });
};
