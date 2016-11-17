
THIS IS NOT YET IN A WORKING STATE!

An ElasticSearch indexer for leveldb.

Why use ElasticSearch with leveldb? 

It does nifty things like fuzzy searching and spelling suggestions so you may want it just to use it as a search engine.

Why not just use ElasticSearch then? Why use leveldb at all? 

leveldb (or at least levelup) can be used in the browser, meaning that most of your functionality implemented with leveldb will be usable in-browser whereas ElasticSearch will forever be bound to the server. If you're building decentralized web apps then it might be nice if your server can help make the search experience better and help speed up searches on large datasets, but you won't want to rely on the sever for any critical functionality.

# Usage

```
var index = indexer(dataDB, indexDB);

index.add('myIndex', function(key, value) {
  return value.content;
});

db.put('0', {name: 'cookie', content: "some searchable content"}, function(err) {
  if(err) return console.error(err);

  var query = 'search';
  index.search('myIndex', query, function(err, results) {
    if(err) return console.error(err);

    console.log("results:", results);
  });
});
```

# License and copyright

License: AGPLv3

Copyright 2016 BioBricks Foundation