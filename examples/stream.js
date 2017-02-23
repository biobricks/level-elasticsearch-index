#!/usr/bin/env node

var esIndexer = require('../index.js');
var sublevel = require('subleveldown');
var memdb = require('memdb');


var db = memdb({valueEncoding: 'json'});
var indexer = esIndexer(db, {
  resolve: true // return key+value for results from leveldb
});


function fail(err) {
  console.error(err);
  process.exit(1);
}


console.log("Adding index");

indexer.addIndex('book', 'author');

console.log("Adding data");

indexer.put('1', {author: {name: "foo"}}, function(err) {
    if(err) fail(err);
    
  indexer.put('2', {author: {name: "foo", last: "bar"}}, function(err) {
    if(err) fail(err);
  
    var s = indexer.matchStream('book', {
      name: "foo"
    }, {
      chunkSize: 1
    });

    s.on('data', function(data) {
      console.log("Got:", data);
    });

    s.on('error', function(err) {
      console.error("Error:", err);
    });

    s.on('end', function() {
      console.log("Stream ended");
      
      indexer.delIndex('book', function(err) {
        if(err) fail(err);
        console.log("Removed index");
      });
    });

  });  
});



