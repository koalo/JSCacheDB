JSCacheDB User Guide
====================

Make your web application offline.

Introduction
------------
JSCacheDB provides a data source for offline web applications. Offline means, that your application is still running and functional, even if the connection to the server is lost. While being offline, the client can neither access the data stored at the server-side database, nor it can store data there. JSCacheDB caches the data in both directions until the connection is reestabilshed. It provides a transparent cache for an unstable internet connection.

JSCacheDB can be used for web applications that rely on a server side database (e.g. PostgreSQL, mySQL...). The task of this tool is to automatically replicate the data to a client-side database (IndexedDB). This database can then be accessed by a client-side JavaScript application. The data stored in JSCacheDB will also survive a shutdown of the users browser, because the client-side database is persistent. Together with the HTML 5 application cache you can create web applications that do not only survive short connectivity disruptions, but can be used everywhere at any time regardless of internet connectivity.

You have to look closely at your use-cases in order to prevent data corruption. If two parties can write to the database at the same time, but one could be offline, it could work on an old state of the data. Your application has to ensure, that changes to an old data state would seamlessly integrate into the new data state at the time of synchronization. A few common pitfalls are described in a seperate section.

Basic Concepts
--------------
The integration of JSCacheDB into your application consists of the following three parts:

- Think about your use-cases: Is there the possibility of data corruption?
- Implement the server side and JSON based interface to your database (in Ruby on Rails, PHP, JSP...).
- Integrate the JSCacheDB.js into your JavaScript application and use it. 

An important design goal was to provide the possiblity to integrate JSCacheDB into existing applications. This makes an existing online web application an offline web application. Therefore changes to an existing database model should be minimal:

- All tables require an unique primary key.
- If you want to insert new items into a table, the primary key of this table is required to be an auto-incremented integer.

This is because of a common problem in database replication: How can you know that a specific key is unique, if you have no access to the database for a while?  You could use an additional origin attribute to form a multi column primary key, but this requires a lot of changes in an existing database and a running online web application. Another solution is to assign different fixed key ranges (e.g. odd and even numbers), but this can only be used for a fixed number of replications. Therefore JSCacheDB uses dynamic key ranges: It asks the server to reserve a block of primary keys for him. <sup>[1](#1)</sup>

JavaScript API
--------------
### Initialization
    var database = new JSCacheDB("nameOfYourJSCacheDB");
    database.open("1.17",{
          "yourFirstStore":["ID"],
          "anotherStore":["ID","anotherIndexedField"]
        },function(){
          alert("Database has been opened");
        });

The open method requires a version string and a database scheme. Optionally you can provide a callback that is called after the database has been opened.

The version string is required, because you do not have direct access to the users browser and therefore you cannot alter the database scheme directly (as you would do e.g. in mySQL with ALTER TABLE). Instead you have to provide a new version string each time you alter the database scheme. If the version of the users database does not fit the given one, the database will be reinitialized to the new scheme. *WARNING:* This includes deletion of all client-side data. This is normally not a problem, because it is only a replication of the server-side data, but it also includes not yet synchronized data that otherwise would not fit to your new database scheme.

In the database scheme there is a store for each database table you want to replicate. It has an associated array of fields for which you want to create a search index. You do not have to name each single field, but only the fields you want to be able to search for!

The first element of the array is a required primary key. Each store (and therefore each database table) has to have a single unique primary key. If you also want to insert new data into this table from your offline web application, this has to be an auto-incremented number (see below). If you do not want to do this, you can also use other unique fields.

**IMPORTANT:** If your server-side database does not have a primary key constraint on the first element of the field array, you probably would corrupt your database. 

### Getting data
The first step is to get data from your database and caching it so that the user can still access it while being offline. If you do not want the user to write to the database while being offline, you are lucky, because you do not have to fear data corruption. Often it is ok, that the user can view the data offline, but only edit it online. 

    database.getAll("yourStore", function(objects) {
      for(i in objects) {
        alert(JSON.stringify(objects[i]));
      }
    });

The request is done asynchronous. You have to provide a callback function that gets called if the result is available. If you only want to get a part of the objects use

    database.getAllWhere("yourStore","indexedField","theValue",function(objs){
      ...
    });

A shortcut for getting a single object by primary key is

    database.get("yourStore","theValue",function(obj){
      alert(JSON.stringify(obj));
    });

### Updating data
If you want to be able to modify data offline, your application has to ensure, that the data will not get inconsistent (see common pitfalls). The application only transfers the attributes of an object that was changed since the last synchronization. This allows for changing the same dataset at two parties, but not the same attribute. The one that is synchronized last wins!

    database.get("addressBook",id,function(obj){
      obj.address = "Longway 25";
      database.save("addressBook",obj);
    });

### Inserting new data

Common Pitfalls
---------------
- Given you have two persons that can write to a database at the same time. If one of the persons is offline, he will not get the data changes of the other person, so your application is not able to ensure specific constraints. For example in a cinema reservation system the cinema could be overbooked, because the person being offline could insert new reservations, although the cinema is already full, but he will not notice it. In this case you could ensure, that no part can reserve more than the half of the free places without sychronization.

Identity Crises<a name="1"/>
---------------


