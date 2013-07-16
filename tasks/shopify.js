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
        https = require('https'),
        growl = require('growl');

    /*
     * Return the base api host with the basic auth. Does not require the 
     * protocol.
     *
     * @return {string}
     */
    shopify.getHost = function() {
        var config = grunt.config('shopify');

        return config.options.url;
    };

    /*
     * Return the authentication header for basic auth
     *
     * @return {string}
     */
    shopify.getAuth = function() {
        var config = grunt.config('shopify');

        return config.options.api_key + ":" + config.options.password;
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
     * user. To notify the user without a response (i.e for an info note) simply
     * don't pass a response notify("hello");
     *
     * @param {response}|{string}
     * @param {string}
     */
    shopify.notify = function(res, msg) {
        var config = grunt.config('shopify');

        if(typeof res !== "string") {
            if(res.statusCode >= 400) {
                msg = "Error "+ msg +" (Status Code: "+ res.statusCode + ")";

                if(!config.options.disable_growl_notifications) {
                    growl(msg, { title: 'Grunt Shopify'});
                }

                if(!config.options.disable_grunt_log) {
                    grunt.log.error('[grunt-shopify] - ' + msg);
                }
            }
            else {
                msg = "Success "+ msg +" (Status Code: "+ res.statusCode + ")";

                if(!config.options.disable_growl_notifications) {
                    growl(msg, { title: 'Grunt Shopify'});
                }

                if(!config.options.disable_grunt_log) {            
                    grunt.log.ok('[grunt-shopify] - ' + msg);
                }
            }
        }
        else {
            if(!config.options.disable_growl_notifications) {
               growl(res, { title: 'Grunt Shopify'});
            }

            if(!config.options.disable_grunt_log) {            
                grunt.log.ok('[grunt-shopify] - ' + res);
            }
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
     * @param {string} file
     * @param {function} async completion callback 
     */
    shopify.remove = function(file, done) {
        shopify.notify("Deleting " + file);

        var path = shopify.getAssetKey(file);

        var options = {
            host: shopify.getHost(),
            path: '/admin/assets.json',
            method: 'DELETE',
            query: {
                'asset[key]': path
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');

            res.on('end', function () {
                shopify.notify(res, "deleting file");
            });

            return done(true);
        });

        req.on('error', function(e) {
            shopify.notify('Problem with DELETE request: ' + e.message);

            return done(false);
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
     * @param {string} file
     * @param {function} async completion callback 
     */
    shopify.upload = function(file, done) {
        shopify.notify("Uploading " + file);

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
                auth: shopify.getAuth(),
                path: '/admin/assets.json',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(post,'utf8')
                }
            };

            var req = https.request(options, function(res) {
                res.setEncoding('utf8');

                res.on('end', function () {
                    shopify.notify(res, "uploading file on shopify");
                });

                return done(true);
            });

            req.on('error', function(e) {
                shopify.notify('Problem with PUT request: ' + e.message);

                return done(false);
            });

            req.write(post);
            req.end();
        });

        return true;
    };

    /*
     * Shopify noop.
     *
     * Use watch to monitor changes. To do an initial upload of all files on 
     * your local copy, use the shopify upload functionality.
     */
    grunt.registerTask('shopify', function() {
        return true;
    });

    grunt.registerTask('shopify:upload', 'Uploads a theme file to Shopify', function(p) {
        var done = this.async();
        shopify.upload(p, done);
    });

    grunt.registerTask('shopify:delete', 'Removes a theme file from Shopify', function(p) {
        var done = this.async();
        shopify.remove(p, done);
    });

    /**
     * Grunt watch event
     */
    grunt.event.on('watch', function(action, filepath) {
        var upload = true;

        try {
            if(fs.lstatSync(filepath).isDirectory()) {
                upload = false;
            }
        } catch (e) {
            //
        }
        
        if(upload) {
            switch (action) {
                case 'deleted':
                    shopify.remove(filepath, function(){});

                    break;
                case 'added':
                case 'changed':
                case 'renamed':
                    shopify.upload(filepath, function(){});

                    break;
            }
        } else {
            shopify.notify("Skipping directory "+ filepath);
        }

        return true;
    });
};