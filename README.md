# grunt-shopify

> Grunt plug-in for publishing Shopify theme assets

This plug-in handles publishing file changes, uploading new files and removing
deleted files from your local filesystem to a Shopify account in real time.

Inspired by the useful [TextMate bundle](http://wiki.shopify.com/Shopify_Textmate_Bundle), 
this grunt plug-in is designed to be IDE / Editor independent as well as work 
easily on image and other assets being added / removed in the background.

**Note**: Because this plug-in will update your current Shopify theme, it is 
recommended to be used in conjunction with a version control system (you are
using version control right?) to ensure that you don't delete a file you 
shouldn't.

**Note**: Your API key and Password to your Shopify site gives other developers
full access to the shop. If you want to secure this information you should use 
an environment property and update the grunt file to read from the current node 
environment.

## Getting Started

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out 
the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains 
how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as 
install and use Grunt plugins. 

Once you're familiar with that process, install this plug-in by running this 
command in:

```shell
npm install grunt-shopify --save-dev
```

This plug-in uses [grunt-watch](https://github.com/gruntjs/grunt-contrib-watch) 
to watch and notify of any local file system changes.

To setup the plug-in you need to make the following changes to your project's 
Gruntfile.

Step 1. Add a section named `shopify` to the data object passed into 
`grunt.initConfig()`. This should include your api key and password for a 
private application setup under your store (http://wiki.shopify.com/Private_applications).

As mentioned, for secure environments use environment variables instead of hard
coding this information.

```js
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-shopify');

grunt.initConfig({
  shopify: {
    options: {
      api_key: "API KEY",
      password: "PASSWORD",
      url: "storename.myshopify.com",
      base: "shop/"
    }
  },
})
```

Step 2. Add a section named `watch` to describe what files and directories you 
want to sync to shopify.

```js
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-shopify');

grunt.initConfig({
  shopify: {
    // ...
  },
  watch: {
    shopify: {
      files: ["shop/**"],
      tasks: ["shopify"]
    }
  }
});
```

Run `grunt watch:shopify` to watch for local changes. 

### Running shopify after other watched files

If you're using coffeescript or some other language which needs to be compiled
before being uploaded to the shopify store, use watch to have the coffee
tasks run on `.coffee` files and have shopify watch the resulting `.js` files.

```js
grunt.loadNpmTasks('grunt-contrib-watch');
grunt.loadNpmTasks('grunt-shopify');

grunt.initConfig({
  shopify: {
    // ...
  },
  watch: {
    coffee: {
      files: ["shop/javascript/*.coffee"],
      tasks: ["coffee"]
    },
    shopify: {
      files: ["shop/assets/**", "shop/javascript/*.js", "shop/snippets/**", "shop/layout/**"],
      tasks: ["shopify"]
    }
  }
});
```

### Manually Uploading Files

`grunt shopify:upload:<filename>` uploads single files to your shop. If no
filename is provided the entire theme will be deployed.

```shell
# upload a single file
grunt shopify:upload:page.liquid

# deploy the whole theme
grunt shopify:upload
```

If you want to deploy your theme with the exception of the `settings_data.json`
file, use the `--no-json` option:

```shell
# deploy without settings_data.json
grunt shopify:upload --no-json
```

### Options

#### api_key

Type: `String`
Default value: `''`

The API Key from your Shopify account. To get an API key, register a new private 
application through your Shopify dashboard.

#### password

Type: `String`
Default value: `''`

The API Password for the private application. This should be available to you 
once you create your private application.

#### url

Type: `String`
Default value: `''`

Your shopify store url. Even if you have a custom domain setup, use the Shopify
domain as your API url (e.g `storename.myshopify.com`)

#### theme [Optional]

Type: `String`
Default value: `''`

The id of the specific theme within your shop that you would like to edit, which
can be found via the `themes` task (ie `grunt shopify:themes`).

This key can be omitted entirely if working on the live theme, or left as an empty string.

#### base

Type: `String`
Default value: `''`

If you've got your shopify files stored in a subdirectory locally (e.g in a 
shop/ folder), base should the name of the folder with the trailing slash (i.e shop/).

#### disable_growl_notifications

Type: `Boolean`
Default value: `false`

By default the script will pipe notices to Growl through [node-growl](https://github.com/visionmedia/node-growl),
if you prefer this to stay in the background set disable_growl_notifications to
false.

#### disable_grunt_log

Type: `Boolean`
Default value: `false`

On top of using Growl notifications for application status, error messages are
output in via grunt log. Turning off the grunt log will keep your terminal clear
in 

#### rate_limit_delay

Type: `Number`
Default value: `500`

Interval in milliseconds between the API calls when running the watch task.
According to the [Shopify docs](https://docs.shopify.com/api/introduction/api-call-limit) the API call limit is set to 2 calls per second, so a sensitive default value like 500ms ensure that no API error will occurs.

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. 
Add unit tests for any new or changed functionality. Lint and test your code 
using [Grunt](http://gruntjs.com/).
