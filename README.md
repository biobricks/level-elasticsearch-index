
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

# Notes

Note that the `.add` method doesn't actually add an index to ElasticSearch. The actual ElasticSearch index does not get created until the first change to the database occurs. The `.remove` method does however actually remove the index from ElasticSearch.

# API


# Why?

Why use ElasticSearch with leveldb? 

ElasticSearch is a really nice search engine with all sorts of interesting features that probably aren't available as pure js modules for leveldb. 

But ElasticSearch can act as a key-value store as well, so why use leveldb at all? 

leveldb (or at least levelup) can be used in the browser, meaning that most of your functionality implemented with leveldb will be usable in-browser whereas ElasticSearch will forever be bound to the server. If you're building decentralized or offline-capable web apps then you won't be able to rely on ElasticSearch for everything.

# License and copyright

License: AGPLv3

Copyright 2016 BioBricks Foundation