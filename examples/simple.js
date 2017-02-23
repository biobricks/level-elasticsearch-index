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


console.log("Adding index");

indexer.addIndex('book', 'author');

console.log("Adding data");

db.put('1', {author: {name: "foo"}}, function(err) {
    if(err) fail(err);
    
  db.put('2', {author: {name: "bar"}}, function(err) {
    if(err) fail(err);
  
    // see the callback.js example if you don't want an arbitrary delay
    console.log("Waiting for index creation");

    setTimeout(function() {
      indexer.match('book', {
        query: {
          match: {
            name: "foo"
          }
        }
      }, function(err, result) {
        if(err) fail(err);

        console.log("Hits:", result);

        indexer.delIndex('book', function(err) {
          if(err) fail(err);

          console.log("Removed index");
        });
      });

    }, 3000);

  });  
});
