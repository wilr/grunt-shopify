var path = require('path'),
    util = require('util'),
    growl = require('growl'),
    async = require('async'),
    fs = require('fs'),
    isBinaryFile = require('isbinaryfile'),
    ShopifyApi = require('shopify-api');

module.exports = function(grunt) {
    var shopify = {};
    shopify._api = false;
    shopify._basePath = false;

    /*
     * Queued task worker.
     *
     * Receive task object and process it.
     *
     * @param {Object} task
     * @param {Function} callback
     * @see {@link https://github.com/caolan/async#queue}
     */
    shopify._queueWorker = function(task, callback) {
        var config = grunt.config('shopify');
        var rate_limit = config.options.rate_limit_delay ?
                config.options.rate_limit_delay :
                500 // default val

        function postUploadCallback() {
            task.done();
            // wait before concluding the task
            setTimeout(callback, rate_limit);
        }

        switch (task.action) {
            case 'upload':
                shopify.upload(task.filepath, postUploadCallback);
                break;
            case 'remove':
                shopify.remove(task.filepath, postUploadCallback);
                break;
            default:
                shopify.notify('unrecognized worker task action: ' + task.action, true);
                break;
        }
    }

    shopify.queue = async.queue(shopify._queueWorker, 1);

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
     * Get the base path.
     *
     * @return {string}
     */
    shopify._getBasePath = function() {
        if (!shopify._basePath) {
            var config = grunt.config('shopify'),
                base = ('base' in config.options) ? config.options.base : false;

            shopify._basePath = (base.length > 0) ? path.resolve(base) : process.cwd();
        }

        return shopify._basePath;
    };

    /*
     * Get the Theme ID.
     *
     * @return {integer}
     */
    shopify._getThemeId = function() {
        var config = grunt.config('shopify');
        return ('theme' in config.options) ? config.options.theme : false;
    };

    /*
     * Determine if path is within our base path.
     *
     * @return {Boolean}
     */
    shopify._isPathInBase = function(filepath) {
        var basePath = shopify._getBasePath();

        try {
            return grunt.file.doesPathContain(basePath, path.resolve(filepath));
        } catch(e) {
            return false;
        }
    };

    /*
     * Determine if path is valid to use.
     *
     * @return {Boolean}
     */
    shopify._isValidPath = function(filepath) {
        if (!shopify._isPathInBase(filepath)) {
            shopify.notify('File "' + filepath + '" not in base path');
            return false;
        } else if (!shopify._isWhitelistedPath(filepath)) {
            var relative = shopify._makePathRelative(filepath);
            shopify.notify('File "' + relative + '" not allowed by Shopify whitelist');
            return false;
        }

        return true;
    };

    /*
     * Determine if path is allowed by Shopify.
     *
     * @return {Boolean}
     */
    shopify._isWhitelistedPath = function(filepath) {
        filepath = shopify._makePathRelative(filepath);

        return filepath.match(/^(assets|config|layout|snippets|templates|locales)\//i);
    };

    /*
     * Determine if path is being watched.
     *
     * @return {Boolean}
     */
    shopify._isWatchedPath = function(filepath) {
        watchedFolders = grunt.config('watch').shopify.files;

        return grunt.file.isMatch(watchedFolders,filepath);
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
    shopify._makeAssetKey = function(filepath) {
        filepath = shopify._makePathRelative(filepath);

        return encodeURI(filepath);
    };

    /**
     * Make a path relative to base path.
     *
     * @param {string} filepath
     * @return {string}
     */
    shopify._makePathRelative = function(filepath) {
        var basePath = shopify._getBasePath();

        filepath = path.relative(basePath, filepath);

        return filepath.replace(/\\/g, '/');
    };

    /*
     * Save a Shopify asset to disk.
     *
     * @param {string} key
     * @param {Object} obj
     * @param {Function} done
     */
    shopify._saveAsset = function(key, obj, done) {
        var contents,
            basePath = shopify._getBasePath(),
            destination = path.join(basePath, key);

        shopify.notify('Downloading "' + key + '".');

        if (typeof obj.asset.value !== 'undefined') {
            contents = obj.asset.value;
        } else if (typeof obj.asset.attachment !== 'undefined') {
            contents = new Buffer(obj.asset.attachment, 'base64');
        } else {
            return done(new Error('Parsed object is not complete'));
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
    shopify.notify = function(msg, err) {
        var config = grunt.config('shopify');

        msg = decodeURI(msg);
        err = err || false;

        if (config.options.disable_growl_notifications !== false) {
            growl(msg, { title: 'Grunt Shopify'});
        }

        if (!config.options.disable_grunt_log) {
            if (err) {
                grunt.log.error('[grunt-shopify] - ' + msg);
            } else {
                grunt.log.ok('[grunt-shopify] - ' + msg);
            }
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
        if (!shopify._isValidPath(filepath)) {
            return done();
        }

        var api = shopify._getApi(),
            themeId = shopify._getThemeId(),
            key = shopify._makeAssetKey(filepath);

        shopify.notify('File "' + key + '" being removed.');

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
     *      - Language files => "locales/"
     *
     * Some requests may fail if those folders are ignored
     * @param {string} filepath
     * @param {Function} done
     */
    shopify.upload = function(filepath, done) {
        if (!shopify._isValidPath(filepath)) {
            return done();
        }

        var api = shopify._getApi(),
            themeId = shopify._getThemeId(),
            key = shopify._makeAssetKey(filepath),
            isBinary = isBinaryFile(filepath),
            props = {
                asset: {
                    key: key
                }
            },
            contents;

        contents = grunt.file.read(filepath, { encoding: isBinary ? null : 'utf8' });
        shopify.notify('Uploading "'+ key +'"');

        if (isBinary) {
            props.asset.attachment = contents.toString('base64');
        } else {
            props.asset.value = contents.toString();
        }

        function onUpdate(err, resp) {
            if (err && err.type === 'ShopifyInvalidRequestError') {
                shopify.notify('Error uploading file ' + JSON.stringify(err.detail), true);
            } else if (!err) {
                shopify.notify('File "' + key + '" uploaded.');
            }

            done(err);
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
    shopify.deploy = function(done, options) {
        var c = grunt.config('shopify');

        var basePath = shopify._getBasePath();
        var filepaths = grunt.file.expand({ cwd: basePath }, [
            'assets/*.*',
            'config/*.*',
            'layout/*.*',
            'locales/*.*',
            'snippets/*.*',
            'templates/*.*',
            'templates/customers/*.*'
        ]);

        if (options.noJson) {
            var index = filepaths.indexOf('settings_data.json');
            filepaths.splice(index, 1);
        }

        async.eachSeries(filepaths, function(filepath, next) {
            shopify.upload(path.join(basePath, filepath), next);
        }, function(err, resp) {
            if (err && err.type === 'ShopifyInvalidRequestError') {
                shopify.notify('Error deploying theme ' + JSON.stringify(err.detail), true);
            } else if (!err) {
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
        var api = shopify._getApi(),
            themeId = shopify._getThemeId(),
            key = shopify._makeAssetKey(filepath);

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'ShopifyInvalidRequestError') {
                    shopify.notify('Error downloading asset file ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.asset) {
                return done(new Error('Failed to get asset data'));
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
        var themeId = shopify._getThemeId(),
            basePath = shopify._getBasePath();

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'ShopifyInvalidRequestError') {
                    shopify.notify('Error downloading theme ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.assets) {
                return done(new Error('Failed to get theme assets list'));
            }

            async.eachSeries(obj.assets, function(asset, next) {
                shopify.download(path.join(basePath, asset.key), next);
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

    /*
     * Display the list of available themes.
     *
     * @param {Function} done
     */
    shopify.themes = function(done) {
        var api = shopify._getApi();

        api.theme.list(function(err, obj) {
            if (err) {
                return done(err);
            }

            if (!obj.themes) {
                return done(new Error('Failed to get themes list'));
            }

            obj.themes.forEach(function(theme) {
                var str = theme.id + ' - ' + theme.name;

                if (theme.role.length > 0) {
                    str += ' (' + theme.role + ')';
                }

                grunt.log.writeln(str);
            });

            done();
        });
    };

    /*
     * Sync local files to Shopify based on last modified date
     *
     * @param {Function} done
     */
    shopify.sync = function (done) {
        var api = shopify._getApi();
        var themeId = shopify._getThemeId(),
            basePath = shopify._getBasePath();

        var fileMap = {};

        function onRetrieve(err, obj) {
            if (err) {
                if (err.type === 'ShopifyInvalidRequestError') {
                    shopify.notify('Error downloading theme ' + JSON.stringify(err.detail), true);
                }

                return done(err);
            }

            if (!obj.assets) {
                return done(new Error('Failed to get theme assets list'));
            }

            for (var i = 0; i < obj.assets.length; i++) {
                var file = obj.assets[i];
                fileMap[file.key] = {
                    'updated_at': file.updated_at,
                    'size': file.size
                };
            }

            var filepaths = grunt.file.expand({cwd: basePath}, [
                'assets/*.*',
                'config/*.*',
                'layout/*.*',
                'locales/*.*',
                'snippets/*.*',
                'templates/*.*',
                'templates/customers/*.*'
            ]);

            var filesToUpdate = [];

            for (var i = 0; i < filepaths.length; i++) {
                var absPath = filepaths[i];
                var filePath = path.join(basePath, absPath);
                var date = fs.lstatSync(filePath).mtime;
                if (!fileMap[absPath]) {
                    filesToUpdate.push(filePath);
                    continue;
                }
                if (new Date(fileMap[absPath].updated_at).getTime() < date.getTime()) {
                    filesToUpdate.push(filePath);
                }
            }
            async.eachSeries(filesToUpdate, function (filepath, next) {
                shopify.upload(filepath, next);
            }, function (err, resp) {
                if (err && err.type === 'ShopifyInvalidRequestError') {
                    shopify.notify('Error syncing theme ' + JSON.stringify(err.detail), true);
                } else if (!err) {
                    shopify.notify('Theme sync complete.');
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

    shopify.watchHandler = function(action, filepath) {
        function errorHandler(err) {
            if (err) {
                shopify.notify(err.message, true);
            }
        }

        if (!shopify._isWatchedPath(filepath)) {
            return;
        }

        if (action === 'deleted') {
            shopify.queue.push({
                action: 'remove',
                filepath: filepath,
                done: errorHandler
            });
        } else if (grunt.file.isFile(filepath)) {
            switch (action) {
                case 'added':
                case 'changed':
                case 'renamed':
                shopify.queue.push({
                    action: 'upload',
                    filepath: filepath,
                    done: errorHandler
                });
                break;
            }
        } else {
            shopify.notify('Skipping non-file ' + filepath);
        }
    };

    return shopify;
};
