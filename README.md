# grunt-shopify

> Grunt plug-in for publishing Shopify theme assets

This plug-in handles publishing file changes, uploading new files and removing
deleted files from your local filesystem to a Shopify account in real time. 
Inspired by the useful [TextMate bundle](http://wiki.shopify.com/Shopify_Textmate_Bundle), 
this plug-in is designed to be IDE / Editor independent as well as work easily 
on image and other assets being added / removed.

Note: Because this plug-in will update your current Shopify theme, it is 
recommended to be used in conjunction with a version control system (you are
using version control right?)

Note: As you will be putting your API key and Password to your shopify site in
a plain text file (Gruntfile.js) this is a reminder to *not publish* your 
gruntfile into production. 

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

This plug-in uses [grunt-regarde](https://github.com/yeoman/grunt-regarde) to 
watch and notify of any local file system changes.

To setup the plug-in you need to make the following changes to your project's 
Gruntfile.

Step 1. Add a section named `shopify` to the data object passed into
`grunt.initConfig()`. This should include your api key and password for a 
private application setup under your store 
(http://wiki.shopify.com/Private_applications)

```js
grunt.initConfig({
  shopify: {
    options: {
      api_key: "API KEY",
      password: "PASSWORD",
      url: "storename.myshopify.com"
    }
  },
})
```

Step 2. Add a section named `regarde` to describe what files and directories you
want to sync to shopify.

```js
grunt.initConfig({
  shopify: {
    // ...
  },
  regarde: {
    shopify: {
      files: ["shop/*"],
      tasks: ["shopify"],
      events: true,
      spawn: true
    }
  }
});
```

Run `grunt regarde:shopify` to watch for local changes. 

### Options

#### options.api_key

Type: `String`
Default value: `''`

The API Key from your Shopify account. To get an API key, register a new private 
application through your Shopify dashboard.

#### options.password

Type: `String`
Default value: `''`

The API Password for the private application. This should be available to you 
once you create your private application.

#### options.url

Type: `String`
Default value: `''`

Your shopify store url. Even if you have a custom domain setup, use the Shopify
domain as your API url (e.g `storename.myshopify.com`)

#### options.base

Type: `String`
Default value: `''`

If you've got your shopify files stored in a subdirectory locally (e.g in a 
shop/ folder), base should the name of the folder (i.e shop).

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. 
Add unit tests for any new or changed functionality. Lint and test your code 
using [Grunt](http://gruntjs.com/).
