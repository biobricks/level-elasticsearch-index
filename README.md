
THIS IS NOT YET PRODUCTION READY!

A very simple ElasticSearch indexer for leveldb/levelup. Automatically keeps multiple ElasticSearch indexes up to date with the contents of a levelup database. Lets you run ElasticSearch queries and stream results from either leveldb or the index.

# Usage

```
var db = level('mydb');

var index = indexer(db, {
 resolve: true // fetch results from leveldb
});

index.addIndex('myIndex');

db.put('0', {name: 'cookie', content: "some searchable content"}, function(err) {
  if(err) return console.error(err);

  // the index auto-updates asynchronously in the background
  // so you need to either manually wait 
  // for the ElasticSearch index to finish updating
  // or use index.put instead of db.put

  setTimeout(function() {

    var s = index.matchStream('myIndex', {
      name: 'cookie'
    });

    s.on('data', function(data) {
      console.log("Search result:", data);
    });
  }, 2000);
});
```

# Methods

## indexer(db, [opts])

The constructor takes a db to index and optionally a set of options, with the following defaults:

```
hostname: 'localhost', // hostname of elasticsearch server
port: 9200, // port number of elasticsearch server
es: undefined, // pass in your own elasticsearch instance
maxResults: 50, // maximum number of results per query
listen: true, // listen for changes on db and update index automatically
refresh: true // true, 'wait_for' or false 
```

`es` can be set to an instance of the npm `elasticsearch` module

If `opts.listen` is true then level-elasticsearch-index will listen to operations on db and automatically update the index. Otherwise the index will only be updated when .put/.del/.batch is called directly on the level-elasticsearch-index instance.

`refresh` is the ElasticSearch [refresh](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-refresh.html) option which controls async behavior, but only when using `.put` or `.del` directly on the `level-elasticsearch-index instance. If set to `true` (default) the ElasticSearch server will immediately update the index of all shards and only after updating the index call your callback. This can impact the performance of your ElasticSearch server. If set to `wait_for` then the callback still will not be called until all ElasticSearch indexes have finished updating but no index operation will be triggered, rather the callback will wait for the next scheduled index operation (usually once per second). If set to `false` then the callback will be called immediately after the database as been changed, which is no different from calling `.put` or `.del` directly on the database.

## .add(indexName, [funcOrPropPath], [opts])

Add an ElasticSearch index. 

Note that the `.addIndex` method doesn't actually add an index to ElasticSearch. The actual ElasticSearch index does not get created until the first change to the database occurs. The `.delIndex` method does however actually remove the index from ElasticSearch.

If no `funcOrPropPath` is specified then the entire value from the leveldb database is indexed. If a function is specified then whatever is returned from that function is indexed (must be an object). If a property name or path (e.g. 'foo.bar.baz') is specified then that property is indexed (must be an object).

Set `opts.async` to true if your function specified for `funcOrPropPath` is asynchronous.

## .delIndex(indexName, cb)

Delete the named ElasticSearch index.

## .clear(indexName, cb)

Clear an index (delete the indexes data from the db, but keep the index).

## .clearAll(cb)

Call .clear for all indexes.

## .build(indexName, cb)

Build and index from scratch from all current contents in the db.

## .buildAll(cb)

Call .build for all indexes.

## .rebuild(indexName, cb)

Call .clear followed by .build for the named index.

## .rebuildAll(cb)

Call .rebuild for all indexes.

## .put(key, value, [opts], cb)

Same as a `.put` directly on the database but will wait for the index to finish updating before calling the callback.

opts:

* `refresh`: Same as `refresh` in the constructor but just for this operation.

## .del(key, value, [opts], cb)

Same as a `.del` directly on the database but will wait for the index to finish updating before calling the callback.

opts:

* `refresh`: Same as `refresh` in the constructor but just for this operation.

## .batch(key, value, [opts], cb)

Same as a `.batch` directly on the database but will wait for the index to finish updating before calling the callback.

opts:

* `refresh`: Same as `refresh` in the constructor but just for this operation.

# Why?

Why use ElasticSearch with leveldb? 

ElasticSearch is a really nice search engine with all sorts of interesting features that probably aren't available as pure js modules for leveldb. 

But ElasticSearch can act as a key-value store as well, so why use leveldb at all? 

leveldb (or at least levelup) can be used in the browser, meaning that most of your functionality implemented with leveldb will be usable in-browser whereas ElasticSearch will forever be bound to the server. If you're building decentralized or offline-capable web apps then you won't be able to rely on ElasticSearch for everything.

# Async quirks

Note that when you call .put, .del or .batch on your database level-elasticsearch-index will not be able to delay the callback so you cannot expect the index to be up to date when the callback is called. That is why you see the setTimeout used in the `simple.js` example. You can instead call .put, .del or .batch directly on the level-elasticsearch-index instance and your callback will not be called until the index has finished building. This works but if `opts.listen` is set to true then an inefficient and inelegant workaround is used in order to prevent the change listener from attempting to update the already updated index) which could potentially slow things down.

If you want to wait for the index to update most of the time then you should probably set `opts.listen` to false and always call .put, .del and .batch directly on the level-elasticsearch-index instance.

# ToDo

* Per-index `.refresh` option
* Unit tests

# License and copyright

License: AGPLv3

Copyright 2016 BioBricks Foundation