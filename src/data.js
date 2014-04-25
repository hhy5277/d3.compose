(function(d3, _, RSVP, global) {
  'use strict';

  // Attach properties to global data object
  var data = global.data = {};

  /**
    Store
    Generic data store with collection of rows
  */
  var Store = data.Store = function Store() {
    this.subscriptions = [];
    this.loading = [];
    this.errors = [];

    // Initialize data cache
    this._data = {};

    // Load types from static
    this.types = _.clone(Store.types);

    // Set default cast and map functions
    this._cast = function(row) { return row; };
    this._map = function(row) { return row; };
  };

  // Type converters for cast
  Store.types = {
    'Number': function(value) { return +value; },
    'Integer': function(value) { return _.isUndefined(value) ? NaN : value|0; },
    'Boolean': function(value) {
      return _.isString(value) ? value.toUpperCase() === 'TRUE' : (value === 1 || value === true);
    },
    'String': function(value) { return _.isUndefined(value) ? '' : '' + value; },
    'Date': function(value) { return new Date(value); }
  };

  _.extend(Store.prototype, {
    /**
      Load current data in store (sync)

      @param {String} [path]
    */
    data: function(path) {
      // Initialize cache for path (if needed)
      if (path && !this._data[path]) {
        this._data[path] = {
          meta: {},
          raw: [],
          values: []
        };
      }

      // Return path or all of data
      return path ? this._data[path] : this._data;
    },

    /**
      Load values in store (once currently loading is complete)
      
      @returns {Promise}
    */
    values: function() {
      return this.ready().then(function(store) {
        return store.data();
      });
    },

    /**
      Load csv file into store

      @param {String|Array} path(s) to csv
      @returns {Promise}
    */
    load: function load(path, options) {
      var paths = _.isArray(path) ? path : [path];
      
      // Generate _cast and _map
      options = options || {};
      if (options.cast)
        options._cast = this._generateCast(options.cast);
      if (options.map)
        options._map = this._generateMap(options.map);

      // 1. Load from path (cache or csv)
      var loading = RSVP.all(_.map(paths, function(path) {
        return this._load(path, options);
      }, this));

      // 2. Process rows
      // 3. Catch errors
      // 4. Finally remove
      loading = loading
        .then(this._doneLoading.bind(this, paths, options))
        .catch(this._errorLoading.bind(this, paths, options))
        .finally(function() {
          this.loading = _.without(this.loading, loading);
        }.bind(this));

      // Add to loading (treat this.loading as immutable array)
      this.loading = this.loading.concat([loading]);

      return loading;
    },

    /**
      Subscribe to changes from store

      @param {Function} callback to call with (data, event: name, store)
      @param {Object} [context]
      @returns {Subscription}
    */
    subscribe: function(callback, context) {
      // Create new subscription
      var subscription = new Subscription(callback, context);
      this.subscriptions.push(subscription);

      return subscription;
    },

    /**
      Register cast options/iterator to be called on every incoming row (before map)
      (e.g. Convert from strings to useful data types)
      
      @param {Object|Function} options or iterator
      @chainable
    */
    cast: function cast(options) {
      this._cast = this._generateCast(options);
      this._process();

      return this;
    },

    /**
      Register denormalization iterator/option to be called with every incoming row

      @param {Object|Function} options or iterator
      @chainable
    */
    map: function map(options) {
      this._map = this._generateMap(options);
      this._process();

      return this;
    },

    /**
      Create new query of data store

      @param {Object} config to pass to query
      @returns {Query}
    */
    query: function query(options) {
      return new Query(this, options);
    },

    /**
      Promise that resolves when currently loading completes

      @returns {Promise}
    */
    ready: function ready() {
      return RSVP.all(this.loading).then(function() { 
        return this;
      }.bind(this));
    },

    // Notify subscribers with current data
    _notify: function _notify(name) {
      _.each(this.subscriptions, function(subscription) {
        subscription.trigger(this.data(), {name: name, store: this});
      }, this);
    },

    // Process all data
    _process: function _process() {
      _.each(this.data(), function(cache, path) {
        cache.values = this._processRows(cache.raw, cache.meta);
      }, this);
    },

    // Process given rows
    _processRows: function _processRows(rows, options) {
      var castFn = (options && options._cast) || this._cast;
      var mapFn = (options && options._map) || this._map;

      // Cast and map rows
      var cast = _.flatten(_.map(rows, castFn, this), true);
      var mapped = _.flatten(_.map(cast, mapFn, this), true);

      return mapped;
    },

    // Generate map function for options
    _generateMap: function _generateMap(options) {
      if (_.isFunction(options)) return options;

      // TODO Allow more options
      var xColumn = options.x || 'x';

      // Convert y to standard form (if column or array of columns)
      var yOptions = _.isObject(options.y) ? options.y : {
        category: '__yColumn',
        columns: _.isArray(options.y) ? options.y : [options.y || 'y']
      };

      // setup iterator by options
      return function _denormalize(row) {
        // Perform denomalization by y
        return _.map(yOptions.columns, function(yColumn) {
          // Copy columns from row that aren't used in x or y
          var copyColumns = _.difference(_.keys(row), xColumn, yOptions.columns);
          var normalized = _.pick(row, copyColumns);

          normalized.x = row[xColumn];
          normalized.y = row[yColumn];

          if (yOptions.categories) {
            _.extend(normalized, yOptions.categories[yColumn]);
          }
          else if (yOptions.category) {
            normalized[yOptions.category] = yColumn;
          }

          return normalized;
        });
      };
    },

    _generateCast: function _generateCast(options) {
      if (_.isFunction(options)) return options;

      var types = this.types;
      return function _cast(row) {
        _.each(options, function(type, key) {
          var cast = _.isFunction(type) ? type : types[type];
          if (cast)
            row[key] = cast(row[key]);
        });

        return row;
      }
    },

    // Load (with caching)
    _load: function _load(path, options) {
      var cache = this.data(path);

      if (cache.meta.loaded) {
        return new RSVP.Promise(function(resolve) { resolve(cache.raw); });
      }
      else if (cache.meta.loading) {
        return cache.meta.loading;
      }
      else {
        var loading = this._loadCsv(path).then(function(values) {
          cache.meta.loaded = new Date();
          return values;
        }).finally(function() {
          delete cache.meta.loading;
        });

        cache.meta.loading = loading;
        return loading;
      }
    },

    // Load rows from given path
    _loadCsv: function _loadCsv(path) {
      return new RSVP.Promise(function(resolve, reject) {
        d3.csv(path).get(function(err, rows) {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    },

    // Handle loading finished (successfully)
    _doneLoading: function _doneLoading(paths, options, rows) {
      // Process rows for each path
      _.each(paths, function(path, index) {
        var cache = this.data(path);

        // Store options
        _.extend(cache.meta, options);

        // Store raw rows
        cache.raw = rows[index];

        // Store processed rows
        cache.values = this._processRows(rows[index], cache.meta)
      }, this);

      this._notify('load');
    },

    // Handle loading error
    _errorLoading: function _errorLoading(paths, options, err) {
      this.errors.push({paths: paths, options: options, error: err});
    }
  });

  /**
    Query
    Perform query on data store and get formatted series data
    
    Input:
    (Denormalized rows/tables)
    x, y, type, a, b, c

    Output:
    (Flattened array of arrays with metadata)
    [
      {meta..., values: [...]},
      {meta..., values: [...]},
      {meta..., values: [...]},
      {meta..., values: [...]}
    ]

    Example:
    var query = {
      // select: x, y is implied
      from: 'chart-1.csv',
      filter: {
        // by key
        // ---
        a: true, // compare directly: ===
        b: {gt: 10, lt: 100} // compare by operator: gt, lt, gte, lte, eq, neq, and, or, not
        // implied -> {and: {gt: 10, lt: 100}}
        c: {or: {gt: 10, gte: 10, lt: 100, lte: 100, eq: 10, neq: -1}, not: {or: {and: {gt: 10, lt: 100}}}}

        // by operator (keys are only allowed inside operators)
        // ---
        or: {
          a: {gt: 100},
          b: {lt: 100}
        }
      }
    }

    @param {Store} store instance to query
  */
  var Query = data.Query = function Query(store, query) {
    this.store = store;
    this._query = query;
    this.subscriptions = [];

    // Subscribe to store changes and recalculate on change
    // TODO
    // this._subscription = this.store.subscribe(this.recalculate, this);
  };

  _.extend(Query.prototype, {
    /**
      Get results of query
    */
    values: function values() {
      // TODO
    },

    /**
      Format results as series

      @param {Array} mapping
      @chainable
    */
    series: function series(mapping) {
      // TODO

      return this;
    },

    /**
      Subscribe to changes in query results (including load)

      @param {Function} callback to call with (values, event: name, query, store)
      @param {Object} [context]
    */
    subscribe: function subscribe(callback, context) {
      var subscription = new Subscription(callback, context);
      this.subscriptions.push(subscription);

      return subscription;
    }
  });

  /**
    Subscription
    Disposable subscription
    
    @param {Function} callback to call
    @param {Object} [context] to use for callback
  */
  var Subscription = data.Subscription = function Subscription(callback, context) {
    this.callback = callback;
    this.context = context;

    this._disposed = false;
  };

  _.extend(Subscription.prototype, {
    /**
      Stop listening to changes
    */
    dispose: function dispose() {
      this._disposed = true;
    },

    /**
      Directly trigger subscription
    */
    trigger: function() {
      if (!this._disposed)
        this.callback.apply(this.context || null, arguments);
    }
  });

  /**
    Matching helper for advanced querying

    @param {Object} query
    @param {Object} row
    @param {String} [lookup] (lookup value for recursion)
    @returns {Boolean}
  */
  var matcher = data.matcher = function matcher(query, row, lookup) {
    function value(key, item) {
      var operation = logical[key] || comparison[key];
      if (operation) return operation(item);

      // If query is given for row key, match recursively with lookup
      // otherwise compare with equals
      var isQuery = _.isObject(item) && !(item instanceof Date) && !_.isArray(item);
      if (isQuery) return matcher(item, row, key);
      else return _.isEqual(row[key], item);
    }

    var logical = {
      '$and': function(query) {
        return _.reduce(query, function(result, item, key) {
          return result && value(key, item);
        }, true);
      },
      '$or': function(query) {
        return _.reduce(query, function(result, item, key) {
          return result || value(key, item);
        }, false);
      },
      '$not': function(query) {
        return !logical['$and'](query);
      },
      '$nor': function(query) {
        return _.reduce(query, function(result, item, key) {
          return result && !value(key, item);
        }, true);
      }
    }
    var comparison = {
      '$gt': function(value) {
        return row[lookup] > value;
      },
      '$gte': function(value) {
        return row[lookup] >= value;
      },
      '$lt': function(value) {
        return row[lookup] < value;
      },
      '$lte': function(value) {
        return row[lookup] <= value;
      },
      '$in': function(value) {
        return _.indexOf(value, row[lookup]) >= 0;
      },
      '$ne': function(value) {
        return row[lookup] !== value;
      },
      '$nin': function(value) {
        return _.indexOf(value, row[lookup]) === -1;
      }
    }

    return logical['$and'](query);
  }

})(d3, _, RSVP, this);
