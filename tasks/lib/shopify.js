var fs = require('fs'),
    path = require('path'),
    glob = require('glob'),
    util = require('util'),
    https = require('https'),
    growl = require('growl'),
    ShopifyApi = require('shopify-api');

module.exports = function(grunt) {
    var shopify = {};
    shopify._api = false;

    /*
     * Get the Shopify API instance.
     *
     * @return {ShopifyApi}
     */
    shopify._getApi = function() {
        if (!shopify._api) {
            var config = grunt.config('shopify');
            var opts = {
                auth: config.options.api_key + ':' + config.options.password,
                host: config.options.url,
                port: config.options.port,
                timeout: config.options.timeout
            };

            shopify._api = new ShopifyApi(opts);
        }

        return shopify._api;
    };

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
     * Return the theme id
     * @return {string}
     */
    shopify.getTheme = function() {
        var config = grunt.config('shopify');
        var theme_id = ('theme' in config.options ? config.options.theme : false);
        return (theme_id ? theme_id : false);
    };

    /*
     * Return remote path, including the theme id if present in Gruntfile
     * @return {string}
     */
    shopify.remotePath = function() {
        return (shopify.getTheme() ? '/admin/themes/' + shopify.getTheme() : '/admin');
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

        fs.readFile(file, function(err, data) {
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

        if (typeof res !== "string") {
            if (res.statusCode >= 400) {
                msg = "Error "+ msg +" (Status Code: "+ res.statusCode + ")";

                if (!config.options.disable_growl_notifications) {
                    growl(msg, { title: 'Grunt Shopify'});
                }

                if (!config.options.disable_grunt_log) {
                    grunt.log.error('[grunt-shopify] - ' + msg);
                }
            } else {
                msg = "Success "+ msg +" (Status Code: "+ res.statusCode + ")";

                if (!config.options.disable_growl_notifications) {
                    growl(msg, { title: 'Grunt Shopify'});
                }

                if (!config.options.disable_grunt_log) {
                    grunt.log.ok('[grunt-shopify] - ' + msg);
                }
            }
        } else {
            if (!config.options.disable_growl_notifications) {
               growl(res, { title: 'Grunt Shopify'});
            }

            if (!config.options.disable_grunt_log) {
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

        if (c.options.base) {
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
            file = file.replace("\\","/");

        var path = shopify.getAssetKey(file).replace("\\","/");

        var options = {
            host: shopify.getHost(),
            auth: shopify.getAuth(),
            path: shopify.remotePath() + '/assets.json?asset[key]=' + path,
            method: 'DELETE',
            headers: {
                'Content-Length': 0
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');

            var body = '';

            res.on('data', function(chunk) {
              body += chunk;
            });

            res.on('end', function () {
              if (res.statusCode >= 400 ) {
                shopify.notify(res, "delete failed with response " + body);
              } else {
                shopify.notify(res, "deleted file " + path + " from shopify");
              }

              shopify.notify(res, "deleting file");
              return done(true);
            });

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
        file = file.replace("\\","/");
        shopify.notify("Uploading " + file.replace("\\","/") );

        shopify.isBinaryFile(file, function(ascii, data) {
            var key = shopify.getAssetKey(file.replace("\\","/")),
                post = {};

            if(ascii) {
                // if the file is a binary file
                post = JSON.stringify({
                    'asset': {
                        'value': data.toString('utf8'),
                        'key': key
                    }
                });

            } else {
                post = JSON.stringify({
                    'asset': {
                        'attachment': data.toString('base64'),
                        'key': key
                    }
                });
            }

            var options = {
                hostname: shopify.getHost(),
                auth: shopify.getAuth(),
                path: shopify.remotePath() + '/assets.json',
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(post,'utf8')
                }
            };

            var req = https.request(options, function(res) {
                res.setEncoding('utf8');

                var body = '';

                res.on('data', function(chunk) {
                  body += chunk;
                });

                res.on('end', function () {
                  if (res.statusCode >= 400 ) {
                    shopify.notify(res, "upload failed with response " + body);
                  } else {
                    shopify.notify(res, "uploaded file to shopify as " + key);
                  }
                    return done(true);
                });

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

    shopify.deploy = function(done) {
        var c = grunt.config('shopify');
        var paths = [];
        ['assets','config','layout','snippets','templates'].forEach(function(folder) {
          paths = paths.concat(glob.sync(path.join(c.options.base || '', folder, '*.*')));
        });
        function next(i) {
            if (i < paths.length) {
                shopify.upload(paths[i].replace("\\","/"), function(success) {
                    if (!success) {
                        return done(false);
                    }
                    next(i+1);
                });
            } else {
                done(true);
            }
        }
        next(0);
    };

    shopify.getOneAsset = function(key, done) {
        var remote_path = shopify.remotePath() + '/assets.json?asset[key]=' + key;

        // Add theme_id param to path if theme is specified
        if (shopify.getTheme()) {
          remote_path += '&theme_id=' + shopify.getTheme();
        }

        var options = {
            hostname: shopify.getHost(),
            auth: shopify.getAuth(),
            path: remote_path,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');

            var c = grunt.config('shopify');
            var body = '';
            var destination = path.join(c.options.base || '', key);

            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function () {
                try {
                    var obj = JSON.parse(body);
                    if (obj.asset) {
                        var value, encoding;
                        if (typeof obj.asset.value !== 'undefined') {
                            value = obj.asset.value;
                            encoding = 'utf8';
                        } else if (typeof obj.asset.attachment !== 'undefined') {
                            value = new Buffer(obj.asset.attachment, 'base64');
                            encoding = null;
                        } else {
                            grunt.log.error('Parsed object is not complete: ' + util.inspect(obj));
                            return done(false);
                        }

                        if (grunt.option('no-write')) {
                            shopify.notify(util.format('dry run: Downloaded %s to %s', key, destination));
                            console.log(util.inspect(obj));
                            done(true);
                        } else {
                            fs.writeFile(destination, value, encoding, function(err) {
                                if (err) {
                                    grunt.log.error(util.format('Error saving asset %s to %s: %s', key, destination, err.message));
                                    done(false);
                                } else {
                                    shopify.notify(util.format('Downloaded %s to %s', key, destination));
                                    done(true);
                                }
                            });
                        }
                    } else {
                        grunt.log.error('Parsed object is not complete: ' + util.inspect(obj));
                        return done(false);
                    }
                } catch(e) {
                    grunt.log.error('Failed to parse JSON response');
                    done(false);
                }
            });
        });

        req.on('error', function(e) {
            shopify.notify('Problem with GET request: ' + e.message);
            return done(false);
        });
        req.end();
    };

    shopify.download = function(done) {
        var options = {
            hostname: shopify.getHost(),
            auth: shopify.getAuth(),
            path: shopify.remotePath() + '/assets.json',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        var req = https.request(options, function(res) {
            res.setEncoding('utf8');

            var body = '';
            var obj;

            function next(i) {
                if (i < obj.assets.length) {
                    shopify.getOneAsset(obj.assets[i].key, function(success) {
                        if (!success) {
                          return done(false);
                        }
                        next(i+1);
                    });
                } else {
                    shopify.notify('Theme sync complete.');
                    done(true);
                }
            }

            res.on('data', function(chunk) {
                body += chunk;
            });

            res.on('end', function () {
                try {
                    obj = JSON.parse(body);
                    if (obj.assets) {
                        next(0);
                    } else {
                        grunt.log.error('Failed to get shopify assets');
                        return done(false);
                    }
                } catch (e) {
                    grunt.log.error('Failed to parse JSON response');
                    done(false);
                }
            });
        });

        req.on('error', function(e) {
            shopify.notify('Problem with GET request: ' + e.message);
            return done(false);
        });

        req.end();
    };

    return shopify;
};