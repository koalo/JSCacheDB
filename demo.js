var database = new JSCacheDB("todoDatabase");

function init() {
  database.setOnRefresh(displayTodos);
  database.setOnFailure(function(message,context) {
    alert("Error: "+message);
  });
  database.setSyncInterval(20000);
  database.open("1.21",{"todo":["ID","done"]});
  database.setupKeyGenerator("todo");
}

window.addEventListener("DOMContentLoaded", init, false);

function addTodo() {
  var todo = {};
  todo.task = document.getElementById("task").value;
  todo.done = false;
  database.save("todo",todo);
  document.getElementById("task").value = "";
}

function markTodo(id) {
  database.get("todo", id, function(obj) {
    obj.done = true;
    database.save("todo",obj);
  });
}

function displayTodos() {
  database.getAll("todo", function(result) {
    var todoList = document.createElement("ul");
    for(row in result) {
      var e = result[row];
      var li = document.createElement("li");
      var a = document.createElement("a");
      var t = document.createTextNode(e.ID + " " + e.task + " " + e.done);

      a.href = "javascript:markTodo("+e.ID+")";

      a.appendChild(t);
      li.appendChild(a);
      todoList.appendChild(li);
    }

    var todoItems = document.getElementById("todoItems");
    todoItems.innerHTML = todoList.innerHTML;
  });

  database.getAll("reserved_insertion_ranges", function(result) {
    //alert(JSON.stringify(result));
  });
}
