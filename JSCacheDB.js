/**
 * @class
 * @classdesc Mapper for sale objects.
 */
function JSCacheDB(name) {
  // Configuration and other constants
  var ranges = "reserved_insertion_ranges";
  var modSuffix = "_modified";
  var serverURL = "";

  // Initialize database reference
  var dbname = name;
  var db = null;
  var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB; 
  if ('webkitIndexedDB' in window) {
    window.IDBTransaction = window.webkitIDBTransaction;
    window.IDBKeyRange = window.webkitIDBKeyRange;
  }

  var self = this;
  var online = null;
  var syncInterval = 10000;
  var ajaxTimeout = 1000;
  var keyGenerators = [];

  // Helper function for getting new AJAX request
  function getXmlHttpRequestObject() {
    if (window.XMLHttpRequest) {
      return new XMLHttpRequest();
    } else if(window.ActiveXObject) {
      return new ActiveXObject("Microsoft.XMLHTTP");
    } else {
      alert( 'Cound not create XmlHttpRequest Object.' +
        'Consider upgrading your browser.' );
    }
  }

  // TODO pruefen ob es noch an mehr stellen hin muss
  // converts string that represents integer to integer
  // important, because TODO
  function convertIfInteger(value) {
    if(value == parseInt(value).toString()) {
      value = parseInt(value);
    }
    return value;
  }

  // to be filled by user
  onrefresh = function(store){}
  onfailure = function(message,context){alert("Error in CachedDatabase: "+message);}
  ononline = function() {}
  onoffline = function() {}

  this.setOnRefresh = function(callback) {
    onrefresh = callback;
  }

  this.setOnFailure = function(callback) {
    onfailure = callback;
  }

  this.setOnOnline = function(callback) {
    ononline = callback;
  }

  this.setOnOffline = function(callback) {
    onoffline = callback;
  }

  this.setSyncInterval = function(milliseconds) {
    syncInterval = milliseconds;
  }

  this.setServerURL = function(url) {
    serverURL = url;
  }

  this.setupKeyGenerator = function(store,blockSize,alarmThreshold) {
    keyGenerators.push({store:[blockSize,alarmThreshold]});
  }

  this.open = function(version,schema,callback) {
    var request = indexedDB.open(dbname,version);

    request.onupgradeneeded = function(e) {  
      // TODO do we need this?
      alert("onupgradeneeded");
      if(db.objectStoreNames.contains(ranges)) {
        db.deleteObjectStore(ranges);
      }
      var store = db.createObjectStore(ranges,{keyPath:"time"});
      store.createIndex("store","store");

      for(storeName in schema) {
        // TODO do we need this?
        if(db.objectStoreNames.contains(storeName)) {
          db.deleteObjectStore(storeName);
        }

        if(db.objectStoreNames.contains(storeName+modSuffix)) {
          db.deleteObjectStore(storeName+modSuffix);
        }

        if(schema[storeName].length == 0) {
          onfailure("Need specification of primary index for "+storeName);
        }
        else {
          var store = db.createObjectStore(storeName, {keyPath: schema[storeName][0]});
          for(var i = 1; i < schema[storeName].length; i++) {
            store.createIndex(schema[storeName][i],schema[storeName][i]);
          }

          db.createObjectStore(storeName+modSuffix, {keyPath: schema[storeName][0]});
        }
      }
    };

    request.onsuccess = function(e) {
      db = request.result;
      db.schema = schema;
      if(db.setVersion != null && version != db.version) {
        var setVrequest = db.setVersion(version);

        setVrequest.onfailure = function(e) {
          alert("Can not create database");
        }

        setVrequest.onsuccess = function(e) {
          request.onupgradeneeded(e);
        };
      }

      if(callback != undefined) callback();
      onrefresh();
    }

    request.onerror = function(e) {
      onfailure("Local storage could not be opened", e);
    };  
  }

  function add(store,object) {
    // new primary key needed
    var trans = db.transaction([store,store+modSuffix,ranges], IDBTransaction.READ_WRITE, 0);
    var rangeStore = trans.objectStore(ranges);
    var keyRange = IDBKeyRange.only(store);
    var rangeReq = rangeStore.index("store").openCursor(keyRange);

    rangeReq.onerror = function(e) {
      onfailure("Cannot insert more new data into "+store+" until next synchronization", e);
    }

    rangeReq.onsuccess = function(e) {
      var result = e.target.result;
      if(!!result == false) {
        if(object[db.schema[store][0]] == null) {
          onfailure("Cannot insert more new data into "+store+" until next synchronization", e);
        }
        return;
      }
      var range = result.value;

      if(range == null || range.min == null 
          || range.max == null || range.max < range.min) { 
        rangeStore.delete(result.key);
        result.continue();
      }
      else {
        range.min++;
        var req = rangeStore.put(range);
        req.onsuccess = function(e) {
          // use the old min value as ID
          object[db.schema[store][0]] = range.min-1;
          request = trans.objectStore(store).add(object);
          
          // store empty object with same structure into mod store
          emptyObj = {};
          for(name in object) {
            emptyObj[name] = null;
          }
          emptyObj[db.schema[store][0]] = object[db.schema[store][0]];

          requestMod = trans.objectStore(store+modSuffix).add(emptyObj);

          // handlers
          request.onsuccess = function(e) {
            onrefresh(store);
          };

          request.onerror = function(e) {
            trans.abort();
            onfailure("Cannot add object to local storage", e);
          };

          requestMod.onerror = function(e) {
            trans.abort();
            onfailure("Cannot add object to local mod storage", e);
          };
        }

        req.onerror = function(e) {
          // could not write back new range
          // -> try with next range
          result.continue();
        }
      }
    };
  }

  this.save = function(store,object) {
    if(db == null) return;

    for(idx in object) {
      object[idx] = convertIfInteger(object[idx]);
    }

    if(object[db.schema[store][0]] == null) {
      // do insertion
      add(store,object);
    }
    else {
      // do update
      var trans = db.transaction([store], IDBTransaction.READ_WRITE, 0);

      // request old object
      var getReq = trans.objectStore(store).get(object[db.schema[store][0]]);

      getReq.onerror = function(e) {
        onfailure("Cannot request old object from local storage", e);
      };

      getReq.onsuccess = function(e) {
        var oldObject = e.target.result;
        var request = trans.objectStore(store).put(object);

        request.onsuccess = function(e) {
          onrefresh(store);
          var modTrans = db.transaction([store+modSuffix], 
              IDBTransaction.READ_WRITE, 0);
          var requestMod = modTrans.objectStore(store+modSuffix).add(oldObject);
          requestMod.onerror = function(e) {
            // no error: object was already modified
          };

          requestMod.onsuccess = function(e) {
          }
        };

        request.onerror = function(e) {
          modTrans.abort();
          onfailure("Cannot update object in local storage", e);
        };
      }
    }
  }

  this.count = function(store,callback) {
    if(db == null) {
      callback(0);
      return;
    }

    // IDBObjectStore.count() is not implemented in Firefox 8 -> workaround needed
    this.getAll(store,function(result) {
      callback(result.length);
    });
  }

  this.get = function(store,ID,callback) {
    if(db == null) return;

    // TODO READ only should be ok too
    var trans = db.transaction([store], IDBTransaction.READ_WRITE, 0);
    var objstore = trans.objectStore(store);
    var request = objstore.get(convertIfInteger(ID));
    
    request.onsuccess = function(e) {
      callback(e.target.result);
    };

    request.onerror = function(e) {
      onfailure("Cannot get object with primary key "+ID+" from local storage "+store, e);
    }
  }

  function query(store,keyRange,index,callback) {
    if(db == null) return;

    // TODO READ only should be ok too
    var trans = db.transaction([store], IDBTransaction.READ_WRITE, 0);
    var objstore = trans.objectStore(store);
    if(index != null) {
      objstore = objstore.index(index);
    }
    var cursorRequest = objstore.openCursor(keyRange);

    var resultArray = [];

    cursorRequest.onsuccess = function(e) {
      var result = e.target.result;
      if(!!result == false) {
        callback(resultArray);
        return;
      }

      resultArray.push(result.value);
      result.continue();
    };

    cursorRequest.onerror = function(e) {
      onfailure("Cannot get objects from local storage "+store, e);
    }
  }

  this.getAllWhere = function(store,attribute,value,callback) {
    var keyRange = IDBKeyRange.only(convertIfInteger(value));
    query(store,keyRange,attribute,callback);
  }

  this.getAll = function(store,callback) {
    var keyRange = IDBKeyRange.lowerBound(0);
    query(store,keyRange,null,callback);
  }

  function ajaxRequest(action,store,data,callback) {
    var ajaxReq = getXmlHttpRequestObject();
    var url = serverURL+'?action='+action+'&store='+store;
    if(data != null) {
      url += '&data='+JSON.stringify(data);
    }
    ajaxReq.open("POST", url, true);
    ajaxReq.overrideMimeType("application/json");
    ajaxReq.onreadystatechange = function() {
      if(ajaxReq.readyState == 4) {
        if(ajaxReq.status == 0) {
          // no proper communication: offline
          if(online != false) {
            online = false;
            onoffline();
          }
        }
        else if(ajaxReq.status != 200) {
          onfailure("Communication was established, but failed with HTTP error code "+ajaxReq.status,ajaxReq);
        }
        else {
          if(online != true) {
            online = true;
            ononline();
          }

          try {
            callback(JSON.parse(ajaxReq.responseText));
          } catch (e) {
            onfailure("Cannot parse answer "+ajaxReq.responseText+" for request "+url, e);
          }
        }
      }
    }
    ajaxReq.send(null);

    // abort the connection after timeout (for offline detection)
    window.setTimeout(function(){ajaxReq.abort()},ajaxTimeout);
  }

  function markAsBeingStored(store,ID,callback) {
    var trans = db.transaction([store+modSuffix], IDBTransaction.READ_WRITE, 0);
    var request = trans.objectStore(store+modSuffix).delete(ID);

    request.onerror = function(e) {
      onfailure("Cannot mark object of "+store+" with primary key "+ID+" as being stored", e);
    }

    request.onsuccess = function(e) {
      callback();
    }
  }

  function storeObjectToServer(store,oldObject,callback) {
    self.get(store,oldObject[db.schema[store][0]],function(newObject) {
      // calculate difference
      var diff = {};
      var empty = true;
      for(var name in oldObject) {
        if(name in newObject && oldObject[name] != newObject[name]) {
          diff[name] = newObject[name];
          empty = false;
        }
      }
      
      // primary key is necessary
      diff[db.schema[store][0]] = newObject[db.schema[store][0]];

      if(empty) {
        markAsBeingStored(store,oldObject[db.schema[store][0]],callback);
      }
      else {
        // transfer object to the server
        ajaxRequest('put',store,diff,function(result) {
          if(result.result == "success" && result.object[db.schema[store][0]] == diff[db.schema[store][0]]) {
            markAsBeingStored(store,oldObject[db.schema[store][0]],callback);
          }
          else if(result.result == "failed") {
            onfailure("Cannot store object to server. Cause: "+result.cause, result);
          }
        });
      }
    });
  }

  function storeToServer(storeIter,allStoredCallback) {
    try {
      var store = storeIter.next();

      self.getAll(store+modSuffix,function(modObjects) {
        var amount = modObjects.length;
        if(amount == 0) {
          storeToServer(storeIter,allStoredCallback);
        }

        for(i in modObjects) {
          storeObjectToServer(store,modObjects[i],function(){
            amount--;
            if(amount == 0) {
              storeToServer(storeIter,allStoredCallback);
            }
          });
        }
      });
    } catch(e) {
      if(e != StopIteration) throw e;
      allStoredCallback();
    }
  }

  function retrieveFromServer(store) {
    ajaxRequest('get',store,null,function(result) {
      var amount = result.length;
      for(row in result) {
        var obj = result[row]; 
        var trans = db.transaction([store], IDBTransaction.READ_WRITE, 0);
        var objStore = trans.objectStore(store);

        for(idx in obj) {
          obj[idx] = convertIfInteger(obj[idx]);
        }

        var request = objStore.put(obj);
        request.onsuccess = function(e) {
          amount--;
          if(amount == 0) {
            onrefresh(store);
          }
        }

        request.onerror = function(e) {
          onfailure("Cannot insert object from server into local storage "+store, e);
        }
      }
    });
  }

  function requestKeyRange(store) {
    var data = {blockSize:keyGenerators[store][0]};
    ajaxRequest('reserve',store,data,function(result){
      if(result['store'] == store) {
        var trans = db.transaction([ranges], IDBTransaction.READ_WRITE, 0);
        var rangeStore = trans.objectStore(ranges);
        var request = rangeStore.put(result);
        request.onerror = function(e) {
          onfailure("Cannot store new insertion range for local storage "+store, e);
        }
      }
      else {
        onfailure("Cannot reserve new insertion range for local storage "+store, e);
      }
    });
  }

  function checkKeyRange(store) {
    var trans = db.transaction([ranges], IDBTransaction.READ_WRITE, 0);
    var rangeStore = trans.objectStore(ranges);
    var keyRange = IDBKeyRange.only(store);
    var rangeReq = rangeStore.index("store").openCursor(keyRange);

    rangeReq.onerror = function(e) {
      // no valid key range -> request new one
      requestKeyRange(store);
    };

    var rangeSum = 0;

    rangeReq.onsuccess = function(e) {
      var result = e.target.result;
      if(!!result == false) {
        if(rangeSum <= keyGenerators[store][1]) {
          // key range too small -> request new one
          requestKeyRange(store);
        }
        return;
      }

      var range = result.value;
      if(range != null && range.min != null && range.max != null) { 
        rangeSum += range.max-range.min;
      }

      result.continue();
    }
  }

  function synchronization() {
    if(db == null) {
      window.setTimeout(synchronization,1000);
      return;
    }

    // TODO what if connection lost within this?
    storeToServer(Iterator(db.schema,true),function(){
      // now all data from every storage is sucessfully stored at the server
      // if there was an error or connection loss, this function will never be called
      // retrieving and reserving can run in parallel
      
      for(store in db.schema) {
        retrieveFromServer(store);
      }

      for(store in keyGenerators) {
        checkKeyRange(store);
      }
    });

    window.setTimeout(synchronization,syncInterval);
  }

  synchronization();
}

