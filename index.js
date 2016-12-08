
var through = require('through2');
var xtend = require('xtend');
var async = require('async');
var changes = require('level-changes');
var elasticsearch = require('elasticsearch');

// TODO check this out
// https://github.com/hmalphettes/elasticsearch-streams

// resolve a path like ['foo', 'bar', 'baz']
// to return the value of obj.foo.bar.baz
// or undefined if that path does not exist
function resolvePropPath(obj, path) {

  if(path.length > 1) {
    if(!obj[path[0]]) return undefined;

    return resolvePropPath(obj[path[0]], path.slice(1, path.length));
  }

  if(path.length === 1) {
    return obj[path[0]];
  }

  return undefined;
}

function esIndexer(db, opts) {
  if(!(this instanceof esIndexer)) return new esIndexer(db, opts);

  this.opts = xtend({
    hostname: 'localhost',
    port: 9200,
    es: undefined // pass in your own elasticsearch
  }, opts || {});

  this.db = db;

  if(this.opts.es) {
    this.es = es;
  } else {
    this.es = new elasticsearch.Client({
      host: this.opts.hostname + ':' + this.opts.port
    });
  }

  this.indexes = {};

  this.c = changes(this.db);
  this.c.on('data', function(change) {
    if(change.type === 'put') {
      this._updateIndexes(change.key, change.value, function(err) {
        if(err) console.log(err);
      });
    } else { // del
      this._deleteFromIndex(change.key);
    }
  }.bind(this));

  if(this.opts.rebuild) {
    this.rebuildAll();
  }

  this._updateIndexes = function(key, value, cb) {
    cb = cb || this._nullFunc;

    var self = this;

    async.eachOf(this.indexes, function(idx, idxName, cb) {
      self._updateIndex(idx, key, value, cb);
    }, cb);
  }

  this._nullFunc = function(){};

  this._addToES = function(indexName, key, indexBody, cb) {
    this.es.bulk({
      body: [
        {index: {_index: indexName, _type: indexName, _id: key}},
        indexBody
      ]
    }, cb);
  };

  this._deleteFromES = function(indexName, id, cb) {
    this.es.bulk({
      body: [
        {delete: {_index: indexName, _id: id}}
      ]
    }, cb);
  };

  this._updateIndex = function(idx, key, value, cb) {
    cb = cb || this._nullFunc;
    if(!idx.f) return;

    var self = this;

    if(idx.async) {
        idx.f(key, value, function(err, indexValue) {
          if(err) return cb(err);;
          if(!indexValue) return cb();

          self._addToES(idx.name, key, indexValue, cb);
        })
      } else {
        try {
          var indexValue = idx.f(key, value);

        } catch(err) {
          return cb(err);
        }

        if(!indexValue) return cb();

        this._addToES(idx.name, key, indexValue, cb);
      }
  }

  this._deleteFromIndex = function(key, cb) {
    cb = cb || this._nullFunc;

    var self = this;

    async.eachOf(this.indexes, function(k, idx, cb) {
      self._deleteFromES(idx, key, cb);
    }, cb);
  };

  // return an indexer that indexes by property
  this._propIndexer = function(propPath, opts) {
    opts = opts || {};
    if(!(propPath instanceof Array)) propPath = propPath.split('.');

    return function(key, value) {
      return resolvePropPath(value, propPath);
    };
  }

  // Add one or more indexes.
  // indexBy is a property name, property path or function that is used
  // retrieve the data to be searched/indexed from the leveldb value.
  // See readme for exhaustive list of calling conventions
  this.add = function(name, opts, indexBy) {

    // check for calling convention: .add(['propName1', 'propName2'])
    if(name instanceof Array) {
      var i;
      for(i=0; i < name.length; i++) {
        this.add(name[i], opts);
      }
      return;
    }

    // check for calling without opts but with index function or property name
    if(typeof opts === 'function' || typeof opts === 'string') {
      indexBy = opts;
      opts = {};
    }

    opts = xtend({
      async: false // set to true if indexFunc uses a callback
    }, opts || {});

    var indexFunc;
    // check for calling convention: .add('propName', [opts])
    if(!indexBy && (!opts || typeof opts === 'object')) {
      indexFunc = this._propIndexer(name);

    // check for calling convention: .add('indexName', [opts], 'propName')
    } else if(typeof indexBy === 'string') {
      indexFunc = this._propIndexer(indexBy);
    } else {
      indexFunc = indexBy;
    }

    if(this.indexes[name]) return new Error("Index already exists");
    this.indexes[name] = {
      name: name,
      f: indexFunc,
      async: opts.async
    };
  };

  this.del = function(name, cb) {
    if(!this.indexes[name]) return new Error("Index does not exist");
    this.indexes[name].f = undefined;
    var self = this;
    var opts = {};
    if(this.indexes[name].type) {
      opts.type = this.indexes[name].type;
    }
    this.clear(name, opts, function(err) {
      if(err) return cb(err);
      delete self.indexes[name]
      cb();
    }.bind(self))
  };

  // clear an index (delete the index data from the db)
  // set opts.all to true to clear all indexes
  this.clear = function(name, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    cb = cb || this._nullFunc;
    opts = opts || {};
    var db, rdb;

    if(opts.all) {
      // TODO clear all indexes
    } else {
      // TODO clear named index
    }
  };

  // clear all indexes (delete the index data from the db)
  this.clearAll = function(opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    cb = cb || this._nullFunc;
    
    opts.all = true;
    this.clear(null, opts, cb);
  };

  // build an index from scratch for existing contents of the db
  this.build = function(indexName, cb) {
    cb = cb || this._nullFunc;

    var idx = this.indexes[indexName];
    if(!idx) throw new Error("Index does not exist");

    var self = this;

    // TODO build index
  };

  // build all indexes from scratch for existing contents of the db
  this.buildAll = function(cb) {
    cb = cb || this._nullFunc;

    var self = this;
    async.eachOf(this.indexes, function(i, key, cb) {
      self.build(key, cb);
    }, cb);
  };

  // clear and then build an index from scratch for existing contents of the db
  this.rebuild = function(name, cb) {
    cb = cb || this._nullFunc;
    var self = this;
    this.clear(name, function(err) {
      if(err) return cb(err);

      self.build(name, cb);
    });
  };

  // clear and then build all indexes from scratch for existing contents of the db
  this.rebuildAll = function(name, cb) {
    cb = cb || this._nullFunc;

    var self = this;
    this.clearAll(function(err) {
      if(err) return cb(err);

      self.buildAll(cb);
    });
  };

  this.search = function(indexName, query, cb) {
    
  };

  this.get = function(indexName, indexKey, cb) {
    var idx = this.indexes[indexName];
    if(!idx) return cb(new Error("Index does not exist"));
    
    // TODO get from es
  };

  this.search = function(indexName, q, cb) {

    this.es.search({
      index: indexName,
      body: q
    }, function(err, result) {
      if(err) return cb(err);
      cb(null, result);
    });
  };
  
}

module.exports = esIndexer;
