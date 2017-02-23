#!/usr/bin/env node

var esIndexer = require('../index.js');
var sublevel = require('subleveldown');
var memdb = require('memdb');


var db = memdb();
var indexer = esIndexer(db, {
  resolve: true
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
    
  indexer.put('2', {author: {name: "bar"}}, function(err) {
    if(err) fail(err);
  
    indexer.match('book', {
      name: "foo"
    }, function(err, result) {
      if(err) fail(err);
      
      console.log("result:", result);
      
      indexer.delIndex('book', function(err) {
        if(err) fail(err);
        
        console.log("Removed index");
      });
    });
  });  
});
