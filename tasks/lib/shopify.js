var fs = require('fs'),
    path = require('path'),
    util = require('util'),
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
     * Helper for reporting messages to the user.
     *
     * @param {string} msg
     */
    shopify.notify = function(msg) {
        var config = grunt.config('shopify');

        if (!config.options.disable_growl_notifications) {
            growl(msg, { title: 'Grunt Shopify'});
        }

        if (!config.options.disable_grunt_log) {
            grunt.log.ok('[grunt-shopify] - ' + msg);
        }
    };

    /*
     * Remove a given file path from Shopify.
     *
     * File should be the relative path on the local filesystem.
     *
     * @param {string} filepath
     * @param {Function} done
     */
    shopify.remove = function(filepath, done) {
        var api = shopify._getApi();
        var themeId = shopify._getThemeId();
        var key = shopify._makeAssetKey(filepath);

        function onDestroy(err) {
            if (!err) {
                shopify.notify('File "' + key + '" removed.');
            }

            done(err);
        }

        if (themeId) {
            api.asset.destroy(themeId, key, onDestroy);
        } else {
            api.assetLegacy.destroy(key, onDestroy);
        }
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

    /*
     * Deploy an entire theme to Shopify.
     *
     * @param {Function} done
     */
    shopify.deploy = function(done) {
        var c = grunt.config('shopify');

        var base = c.options.base || '';
        var filepaths = grunt.file.expand({ cwd: base }, [
            'assets/*.*',
            'config/*.*',
            'layout/*.*',
            'snippets/*.*',
            'templates/*.*'
        ]);

        async.eachSeries(filepaths, function(filepath, next) {
            shopify.upload(path.join(base, filepath), next);
        }, function(err) {
          if (!err) {
              shopify.notify('Theme deploy complete.');
          }

          done(err);
        });
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