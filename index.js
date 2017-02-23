
var crypto = require('crypto');
var through = require('through2');
var xtend = require('xtend');
var async = require('async');
var changes = require('level-changes');
var from = require('from2');
var elasticsearch = require('elasticsearch');

// TODO check this out
// https://github.com/hmalphettes/elasticsearch-streams

// hash an operation
function hash(type, key, value) {

  // yes sha256 is slow but really not much slower than any other hash in node
  // https://github.com/hex7c0/nodejs-hash-performance
  var h = crypto.createHash('sha256');
  
  h.update(type);
  h.update(key);
  if(value) {
    if(typeof value === 'object' && !Buffer.isBuffer(value)) {
      h.update(JSON.stringify(value));
    } else {
      h.update(value);
    }
  }

  return h.digest('base64');
}

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
    resolve: false, // return original leveldb entries instead of the ES results
    es: undefined, // pass in your own elasticsearch
    maxResults: 50, // maximum number of results per query
    listen: true, // listen for changes on db and update index automatically
    refresh: true // true, 'wait_for', false, see README.md for info
                  // and see https://www.elastic.co/guide/en/elasticsearch/reference/current/docs-refresh.html
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
  this._ignoreList = {};
  this._ignoreCount = 0;

  if(this.opts.listen) {
    this.c = changes(this.db);
    this.c.on('data', function(change) {
      if(this._shouldIgnore(change)) return;
      if(change.type === 'put') {
        this._onPut(change.key, change.value);
      } else { // del
        this._deleteFromIndex(change.key);
      }
    }.bind(this));
  }

  if(this.opts.rebuild) {
    this.rebuildAll();
  }

  // Ignore the next time this operation occurs.
  // Used by this._put, this._del and this._batch
  this._ignore = function(type, key, value) {
    var h = hash(type, key, value);
    if(this._ignoreList[h]) {
      this._ignoreList[h]++;
    } else {
      this._ignoreList[h] = 1;
    }
    this._ignoreCount++;
  };

  // check if we should ignore this operation
  // and remove from ignore list
  this._shouldIgnore = function(op) {

    if(this._ignoreCount <= 0) return;
    var h = hash(op.type, op.key, op.value);

    if(this._ignoreList[h]) {
      if(this._ignoreList[h] === 1) {
        delete this._ignoreList[h];
      } else {
        this._ignoreList[h]--;
      }
      this._ignoreCount--;
      return true;
    }
    return false;
  };

  this._onPut = function(key, value, opts, cb) {
    var self = this;

    async.eachOf(this.indexes, function(idx, idxName, cb) {
      self._updateIndex(idx, key, value, opts, cb);
    }, cb);
  }

  this._nullFunc = function(){};

  this._addToES = function(indexName, key, indexBody, opts, cb) {
    if(typeof indexBody !== 'object') return cb(new Error("Cannot index non-object"));
    var o = {
      body: [
        {index: {_index: indexName, _type: indexName, _id: key}},
        indexBody
      ]
    };

    if(opts.refresh) {
      o.refresh = opts.refresh.toString(); // yes this is correct, check the api
    }

    this.es.bulk(o, cb);
  };

  this._deleteFromES = function(indexName, id, opts, cb) {

    var o = {
      body: [
        {delete: {_index: indexName, _type: indexName, _id: id}}
      ]
    };

    if(opts.refresh) {
      o.refresh = opts.refresh.toString(); // yes this is correct, check the api
    }

    this.es.bulk(o, cb);
  };

  this._updateIndex = function(idx, key, value, opts, cb) {
    cb = cb || this._nullFunc;
    opts = opts || {};

    if(idx.f === null) {
      self._addToES(idx.name, key, value, opts, cb);
      return;
    }

    if(!idx.f) return;

    var self = this;

    if(idx.async) {
        idx.f(key, value, function(err, indexValue) {
          if(err) return cb(err);
          if(!indexValue) return cb();

          self._addToES(idx.name, key, indexValue, opts, cb);
        })
      } else {
        try {
          var indexValue = idx.f(key, value);

        } catch(err) {
          return cb(err);
        }

        if(!indexValue) return cb();

        this._addToES(idx.name, key, indexValue, opts, cb);
      }
  }


  this._onDel = function(key, opts, cb) {
    cb = cb || this._nullFunc;
    opts = opts || {};

    var self = this;

    async.eachOf(this.indexes, function(k, idx, cb) {
      self._deleteFromES(idx, key, opts, cb);
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
  this.addIndex = function(name, opts, indexBy) {

    // check for calling without opts but with index function or property name
    if(typeof opts === 'function' || typeof opts === 'string') {
      indexBy = opts;
      opts = {};
    }

    opts = xtend({
      async: false // set to true if indexFunc uses a callback
    }, opts || {});

    var indexFunc;
    // check for calling convention: .addIndex('propName', [opts])
    if(!indexBy && (!opts || typeof opts === 'object')) {
      indexFunc = null;
    // check for calling convention: .addIndex('indexName', [opts], 'propName')
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

  this.delIndex = function(name, cb) {
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

    if(opts.all) {
      name = '*';
    }

    this.es.indices.delete({
      index: name
    }, cb);
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

    var s = this.db.createReadStream();
    s.on('data', function(data) {
      self._updateIndex(idx, data.key, data.value);
    });

    s.on('error', function(err) {
      return cb(err);
    });

    s.on('end', function() {
      return cb();
    });
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

  this.get = function(key, opts, cb) {
    return this.db.get(key, opts, cb);
  };

  this.put = function(key, value, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    
    opts = opts || {};
    opts.refresh = opts.refresh || this.opts.refresh;

    // if listening
    if(this.opts.listen) {
      if(!cb) return this.db.put(key, value, opts);
      this._ignore('put', key, value); // make listener ignore this next put
    }

    var self = this;
    this.db.put(key, value, opts, function(err) {
      if(err) return cb(err);

      self._onPut(key, value, opts, cb);
    });
  };


  this.del = function(key, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    if(!cb) return this.db.del(key, opts);

    opts = opts || {};
    opts.refresh = opts.refresh || this.opts.refresh;

    // if listening
    if(this.opts.listen) {    
      if(!cb) return this.db.del(key, opts);
      this._ignore('del', key, value); // make listener ignore this next del
    }

    var self = this;
    this.db.del(key, opts, function(err) {
      if(err) return cb(err);

      self._onDel(key, cb, opts);
    });
  };

  this.batch = function(ops, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    opts = opts || {};
    opts.refresh = opts.refresh || this.opts.refresh;

    // if listening
    if(this.opts.listen) {
      if(!cb) return this.db.batch(ops, opts);

      // make listener ignore these next operations
      var i, op;
      for(i=0; i < ops.length; i++) {
        op = ops[i];
        this._ignore(op.type, op.key, op.value);
      }
    }

    var self = this;
    this.db.batch(ops, opts, function(err) {
      if(err) return cb(err);

      async.each(ops, function(op, cb) {
        if(op.type === 'put') {
          self._onPut(op.key, op.value, opts, cb)
        } else { // del
          self._onDel(op.key, opts, cb)
        }
      }, cb);
    });
  };

  this.search = function(indexName, q, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    opts = xtend({
      resolve: this.opts.resolve
    }, opts || {});

    var self = this;

    this.es.search({
      index: indexName,
      body: q
    }, function(err, result) {
      if(err) return cb(err);

      if(!opts.resolve) return cb(null, result);
      if(result.hits.hits.length <= 0) return cb(null, []);

      var ret = [];

      async.each(result.hits.hits, function(hit, cb) {
        self.db.get(hit._id, function(err, val) {
          if(err) return cb(err);

          ret.push({key: hit._id, value: val});
          cb();
        });
      }, function(err) {
        if(err) return cb(err);
        cb(null, ret);
      });
    });
  };

  this.query = function(indexName, q, opts, cb) {
    if(typeof opts === 'function') {
      cb = opts;
      opts = {};
    }

    var o = {
      from: 0,
      size: this.maxResults,
      query: q
    };

    return this.search(indexName, o, opts, cb);
  };

  this.match = function(indexName, m, opts, cb) {
    return this.search(indexName, {
      query: {
        match: m
      }
    }, opts, cb);
  };

  // TODO in progress

  this.searchStream = function(indexName, q, opts) {

    opts = xtend({
      from: 0,
      chunkSize: this.chunkSize,
      totalSize: 100, 
      resolve: this.opts.resolve
    }, opts || {});

    var resolve = opts.resolve;
    opts.resolve = false; // we'll resolve in this method if needed

    q.from = q.from || opts.from;
    q.size = opts.chunkSize;

    var self = this;

    var i;
    var hit;
    var hits = [];
    var totalHits = 0;
    var done = false;

    return from.obj(function(size, next) {

      // keep emitting from the hits array (our buffer) until we run out
      if(hits.length > 0) {
        hit = hits[0];
        hits = hits.slice(1);

        if(!resolve) {
          return next(null, hit);
        }
        
        self.db.get(hit._id, function(err, value) {
          if(err) return next(err);

          next(null, {key: hit._id, value: value});
        });
        return;
      }

      // are we done?
      if(done || (opts.totalSize > 0 && totalHits >= opts.totalSize)) return next(null, null);

      // we need to refill our buffer (the hits arrray)

      q.from = totalHits;

      // the last chunk needed might be less than a full chunk size
      if(opts.totalSize > 0 && opts.totalSize - totalHits < opts.chunkSize) {
        q.size = opts.totalSize - totalHits;
      } else {
        q.size = opts.chunkSize;
      }
      self.search(indexName, q, opts, function(err, result) {
        if(err) return next(err);
        if(result.hits.hits.length <= 0) return next(null, null);
        if(result.hits.hits.length < opts.chunkSize) done = true;
        totalHits += result.hits.hits.length;

        hits = result.hits.hits;

        hit = hits[0];
        hits = hits.slice(1);

        if(!resolve) {
          return next(null, hit);
        }
        
        self.db.get(hit._id, function(err, value) {
          if(err) return next(err);

          next(null, {key: hit._id, value: value});
        });

      });
    });
  };

  this.matchStream = function(indexName, m, opts) {
    return this.searchStream(indexName, {
      query: {
        match: m
      }
    }, opts);
  };
  
}

module.exports = esIndexer;
