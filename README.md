
THIS IS NOT YET PRODUCTION READY!

A very simple ElasticSearch indexer for leveldb/levelup. Keeps ElasticSearch indexes up to date with the contents of a levelup database.

# Usage

```
var index = indexer(db);

index.add('myIndex', function(key, value) {
  return value.content;
});

db.put('0', {name: 'cookie', content: "some searchable content"}, function(err) {
  if(err) return console.error(err);

  var query = {
    query: {
      match: {
        name: 'content'
      }
    }
  };

  index.search('myIndex', query, function(err, results) {
    if(err) return console.error(err);

    console.log("results:", results);
  });
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
esRefresh: true // true, 'wait_for' or false 
```

`es` can be set to an instance of the npm `elasticsearch` module

`esRefresh` is the ElasticSearch [refresh](https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-refresh.html) option which controls async behavior, but only when using `.put` or `.del` directly on the `level-elasticsearch-index instance. If set to `true` (default) the ElasticSearch server will immediately update the index of all shards and only after updating the index call your callback. This can impact the performance of your ElasticSearch server. If set to `wait_for` then the callback still will not be called until all ElasticSearch indexes have finished updating but no index operation will be triggered, rather the callback will wait for the next scheduled index operation (usually once per second). If set to `false` then the callback will be called immediately after the database as been changed, which is no different from calling `.put` or `.del` directly on the database.

## .put(key, value, [opts], cb)

Same as a `.put` directly on the database but will wait for the index to finish updating before calling the callback.

opts:

* `esRefresh`: Same as `esRefresh` in the constructor but just for this operation.

## .del(key, value, [opts], cb)

Same as a `.del` directly on the database but will wait for the index to finish updating before calling the callback.

opts:

* `esRefresh`: Same as `esRefresh` in the constructor but just for this operation.

# Notes

Note that the `.add` method doesn't actually add an index to ElasticSearch. The actual ElasticSearch index does not get created until the first change to the database occurs. The `.remove` method does however actually remove the index from ElasticSearch.


# Why?

Why use ElasticSearch with leveldb? 

ElasticSearch is a really nice search engine with all sorts of interesting features that probably aren't available as pure js modules for leveldb. 

But ElasticSearch can act as a key-value store as well, so why use leveldb at all? 

leveldb (or at least levelup) can be used in the browser, meaning that most of your functionality implemented with leveldb will be usable in-browser whereas ElasticSearch will forever be bound to the server. If you're building decentralized or offline-capable web apps then you won't be able to rely on ElasticSearch for everything.

# ToDo

* Per-index `.refresh` option
* Unit tests

# License and copyright

License: AGPLv3

Copyright 2016 BioBricks Foundation