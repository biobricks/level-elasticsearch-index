#!/usr/bin/env node

var esIndexer = require('../index.js');
var sublevel = require('subleveldown');
var memdb = require('memdb');


var db = memdb();
var indexer = esIndexer(db);


function fail(err) {
  console.error(err);
  process.exit(1);
}


indexer.add('part', function(key, val) {
  return val;
});

db.put('1', {name: "foo"}, function(err) {
    if(err) fail(err);
    
  db.put('2', {name: "bar"}, function(err) {
    if(err) fail(err);
  
    setTimeout(function() {
      indexer.search('part', {
        query: {
          match: {
            name: "foo"
          }
        }
      }, function(err, result) {
        if(err) return fail(err);
//        console.log("Got result:", result);
        console.log("Hits:", result.hits.hits);
      });

    }, 2000);

  });  
});
