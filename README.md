JSCacheDB User Guide
====================

Make your web application offline.

Introduction
------------
JSCacheDB provides a data source for offline web applications. Offline means, that your application is still running and functional, even if the connection to the server is lost. While being offline, the client can neither access the data stored at the server-side database, nor it can store data there. JSCacheDB caches the data in both directions until the connection is reestabilshed. It provides a transparent cache for an unstable internet connection.

JSCacheDB can be used for web applications that rely on a server side database (e.g. PostgreSQL, mySQL...). The task of this tool is to automatically replicate the data to a client-side database (IndexedDB). This database can then be accessed by a client-side JavaScript application. The data stored in JSCacheDB will also survive a shutdown of the users browser, because the client-side database is persistent. Together with the HTML 5 application cache you can create web applications that do not only survive short connectivity disruptions, but can be used everywhere at any time regardless of internet connectivity.

You have to look closely at your use-cases in order to prevent data corruption. If two parties can write to the database at the same time, but one could be offline, it could work on an old state of the data. Your application has to ensure, that changes to an old data state would seamlessly integrate into the new data state at the time of synchronization. For more information refer to the last section.

Basic Concepts
--------------
        -----------------------------
        | Webbrowser                |
        |                           |
        |        Your Application   |
        |               |           |
        |           JSCacheDB       |
        |               |           |
        ----------------|------------
                        |
                        | unreliable connection
                        |
        ----------------|------------
        | Server        |           |
        |         JSON interface    |
        |               |           |
        |            Database       |
        -----------------------------

The integration of JSCacheDB into your application consists of the following three parts:

- Think about your use-cases: Is there the possibility of data corruption?
- Setup the server-side interface to your database.
- Integrate the JSCacheDB.js into your JavaScript application and use it. 

An important design goal was to provide the possiblity to integrate JSCacheDB into existing applications. This makes an existing online web application an offline web application. Therefore changes to an existing database model should be minimal:

- All tables require an unique primary key. Use a primary key constraint in your database!
- If you want to insert new items into a table, the primary key of this table is required to be an auto-incremented integer.

This is because of a common problem in database replication: How do you know that a specific key is unique if you have no access to the database for a while? JSCacheDB solves this by reserving key ranges<sup>[1](#1)</sup> and only use reserved keys when inserting data. The server has to ensure that these keys are not used multiple times (i.e. shift the auto-increment value).

JavaScript API
--------------
### Configuration
    var database = new JSCacheDB("nameOfYourJSCacheDB");
    database.setOnFailure(function(message,context) {
      alert("Error: "+message);
    });
    database.setOnRefresh(function(store){
      // refresh your user interface
    });
    database.setSyncInterval(10000);
    database.setServerURL("JSCacheDBInterface.php");

After constructing the database object with the name of your database, you should provide a failure callback that is called if an error occurs. Furthermore there is the possibility to get informed if there is new data availible. You should refresh your user interface, but be aware, that you do not disrupt an user activity.

The synchronization interval defines the time in milliseconds between two synchronizations of JSCacheDB with the server. The server URL is a path to your server-side database interface.

### Initialization
    database.open("1.17",{
          "yourFirstStore":["ID"],
          "anotherStore":["ID","anotherIndexedField"]
        },function(){
          alert("Database has been opened");
          database.setupKeyGenerator("anotherStore",200,50);
        });

The open method requires a version string and a database scheme. Optionally you can provide a callback that is called after the database has been opened.

You have to provide a new version string each time you update your database scheme. If the version of the users database does not fit the given one, the old database is deleted and will be reinitialized to the new scheme.

In the database scheme there is a store for each database table you want to replicate. It has an associated array of fields for which you want to create a search index. The first element of the array is the required primary key.

**NOTE**: You do not have to name each single field, but only the fields you want to be able to search for and the primary key! 

Last but not least you have to setup the key generator for each store in that you want to insert new objects. The key generator will request 200 (first argument) new keys as soon as there are only 50 (second argument) keys left and there is internet connection. The second number should be large enough that it is unlikely that the user inserts more new objects within one offline session.

### Getting data

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

### Inserting new data
If you want to insert new data, be aware, that you have to set up the key generator first and wait for the next synchronization.

    var newEntry = {};
    newEntry.name = "Peter";
    newEntry.address = "Shortway 15";
    database.save("addressBook",newEntry);


### Updating data
If you want to be able to modify data offline, your application has to ensure, that the data will not get inconsistent (see common pitfalls). The application only transfers the attributes of an object that was changed since the last synchronization. This allows for changing the same dataset at two parties, but not the same attribute. The one that is synchronized last wins!

    database.get("addressBook",id,function(obj){
      obj.address = "Longway 25";
      database.save("addressBook",obj);
    });

### Deleting data
This is not implemented, because you never know where your object is still available and if it will be used for foreign key references. Instead you should add a *invalid* attribute to your objects and do not use them if it is set. If you really can be sure that the is no valid object anymore, you can remove all objects with this flag set from the server-side database.

Server-Side Interface
---------------------
JSCacheDB will talk to your server via periodic AJAX requests.
A sample PHP interface to a mySQL database is implemented in `JSCacheDBInterface.php`.

Each POST request has a parameter `store` with the table to use and `action`. There are three actions:

### get
Returns a JSON array of all objects in this table. Executed SQL command: `SELECT`

### put
Store the object transferred as parameter `data` to the database. If the primary key already exists, an `UPDATE` is executed, otherwise an `INSERT`.

### reserve
Reserve a new key range with block size given as blockSize attribute in `data`. Return a JSON object with min set to the smallest and max set to the biggest value of the reserved range. The server has to shift the auto-increment value to `max+1`. 

**IMPORTANT:** Other applications that write to the server have to use the auto-increment values (write NULL to the primary key field). At least for mySQL I found no possibility to ensure this at database level.

Think about the replication
---------------------------
- Given you have two persons that can write to a database at the same time. If one of the persons is offline, he will not get the data changes of the other person, so your application is not able to ensure specific constraints. For example in a cinema reservation system the cinema could be overbooked, because the person being offline could insert new reservations, although the cinema is already full, but he will not notice it. In this case you could ensure, that no part can reserve more than the half of the free places without sychronization.
- If you do not want the user to write to the database while being offline, you are lucky, because you do not have to fear data corruption. Often it is ok, that the user can view the data offline, but only edit it online. 


**[1]**<a name="1"/> Another solution to the primary key identity crisis would be to use an additional origin attribute to form a multi column primary key, but this requires a lot of changes in an existing database and a running online web application. Another solution is to assign different fixed key ranges (e.g. odd and even numbers), but this can only be used if you know how many clients you have. The implemented approach is the most flexible one, but requires an estimation of the expected utilization.


