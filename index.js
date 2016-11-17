
var through = require('through2');
var sublevel = require('subleveldown');
var xtend = require('xtend');
var async = require('async');
var changes = require('level-changes');

// resolve a path like ['foo', 'bar', 'baz']
// to return the value of obj.foo.bar.baz
// or undefined if tha path does not exist
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

function esIndexer(db, es, opts) {
  if(!(this instanceof esIndexer)) return new esIndexer(db, es, opts);

  this.db = db;
  this.es = es;

  this.opts = xtend({

  }, opts || {});

  this.indexes = {};

  this.c = changes(this.db);
  this.c.on('data', function(change) {
    if(change.type === 'put') {
      this._updateIndexes(change.key, change.value);
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

  this._updateIndex = function(idx, key, value, cb) {
    cb = cb || this._nullFunc;
    if(!idx.f) return;
    
    if(idx.async) {
        idx.f(key, value, function(err, indexValue) {
          if(err) return cb(err);;
          if(!indexValue) return cb();

          // TODO write to es

        })
      } else {
        try {
          var indexValue = idx.f(key, value);
        } catch(err) {
          return cb(err);
        }

        if(!indexValue) return cb();

        // TODO write to es
      }
  }

  this._deleteFromIndex = function(key, cb) {
    cb = cb || this._nullFunc;
    var k, idx;
    for(k in this.indexes) {
      idx = this.indexes[k];

      // TODO write to es
    }
  }

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

    // TODO deal with types?
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

  this.get = function(indexName, indexKey, cb) {
    var idx = this.indexes[indexName];
    if(!idx) return cb(new Error("Index does not exist"));
    
    // TODO get from es
  };

  this.createReadStream = function(indexName, opts) {
    opts = xtend({
      keys: true, // output keys
      values: true // output values
    }, opts || {});    
    var idx = this.indexes[indexName];
    if(!idx) return cb(new Error("Index does not exist"));

    // TODO does es even stream?

    return out;
  };

  this.createKeyStream = function(indexName, opts) {
    opts = opts || {};
    opts.keys = true;
    opts.values = false;
    return this.createReadStream(indexName, opts);
  };

  this.createValueStream = function(indexName, opts) {
    opts = opts || {};
    opts.keys = false;
    opts.values = true;
    return this.createReadStream(indexName, opts);
  };

}

module.exports = indexer;
