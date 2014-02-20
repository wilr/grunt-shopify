var fs = require('fs'),
    path = require('path'),
    glob = require('glob'),
    util = require('util'),
    https = require('https'),
    growl = require('growl'),
    async = require('async'),
    isBinaryFile = require('isbinaryfile'),
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
     * Get the Theme ID.
     *
     * @return {integer}
     */
    shopify._getThemeId = function() {
        var config = grunt.config('shopify');
        return ('theme' in config.options) ? config.options.themeId : false;
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
     */
    shopify._makeAssetKey = function(path) {
        path = path.replace(/\\/g, '/');

        var c = grunt.config('shopify');

        if (c.options.base) {
            path = path.substring(path.indexOf(c.options.base) + c.options.base.length).replace(/\\/g, '/');
        }

        return path.replace(/^\/+/, '');
    };

    /*
     * Save a Shopify asset to disk.
     *
     * @param {string} key
     * @param {Object} obj
     * @param {Function} done
     */
    shopify._saveAsset = function(key, obj, done) {
        var contents;

        var c = grunt.config('shopify');
        var destination = path.join(c.options.base || '', key);

        if (typeof obj.asset.value !== 'undefined') {
            contents = obj.asset.value;
        } else if (typeof obj.asset.attachment !== 'undefined') {
            contents = new Buffer(obj.asset.attachment, 'base64');
        } else {
            done(new Error('Parsed object is not complete'));
            return;
        }

        if (grunt.option('no-write')) {
            console.log(util.inspect(obj));
        } else {
            grunt.file.write(destination, contents);
            shopify.notify('File "' + key + '" saved to disk.');
        }

        done();
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
     * @param {string} filepath
     * @param {Function} done
     */
    shopify.upload = function(filepath, done) {
        var api = shopify._getApi();
        var themeId = shopify._getThemeId();
        var key = shopify._makeAssetKey(filepath);

        var isBinary = isBinaryFile(filepath);
        var contents = grunt.file.read(filepath, { encoding: isBinary ? null : 'utf8' });
        var props = {
            asset: {
                key: key
            }
        };

        if (isBinary) {
            props.asset.attachment = contents.toString('base64');
        } else {
            props.asset.value = contents.toString();
        }

        function onUpdate(err) {
            if (err) {
                done(err);
                return;
            }

            shopify.notify('File "' + key + '" uploaded.');
            done();
        }

        if (themeId) {
            api.asset.update(themeId, props, onUpdate);
        } else {
            api.assetLegacy.update(props, onUpdate);
        }
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

    /*
     * Download an asset from Shopify.
     *
     * @param {string} filepath
     * @param {Function} done
     */
    shopify.download = function(filepath, done) {
        var api = shopify._getApi();
        var themeId = shopify._getThemeId();
        var key = shopify._makeAssetKey(filepath);

        function onRetrieve(err, obj) {
            if (err) {
                done(err);
                return;
            }

            if (!obj.asset) {
                done(new Error('Failed to get asset data'));
                return;
            }

            shopify._saveAsset(key, obj, done);
        }

        if (themeId) {
            api.asset.retrieve(themeId, key, onRetrieve);
        } else {
            api.assetLegacy.retrieve(key, onRetrieve);
        }
    };

    /*
     * Download an entire theme from Shopify.
     *
     * @param {Function} done
     */
    shopify.downloadTheme = function(done) {
        var api = shopify._getApi();
        var themeId = shopify._getThemeId();

        function onRetrieve(err, obj) {
            if (err) {
                done(err);
                return;
            }

            if (!obj.assets) {
                done(new Error('Failed to get theme assets list'));
                return;
            }

            async.eachSeries(obj.assets, function(asset, next) {
                shopify.download(asset.key, next);
            }, function(err) {
                if (!err) {
                    shopify.notify('Theme download complete.');
                }

                done(err);
            });
        }

        if (themeId) {
            api.asset.list(themeId, onRetrieve);
        } else {
            api.assetLegacy.list(onRetrieve);
        }
    };

    return shopify;
};