<?php
if(true) {
  $hostname = 'localhost';
  $username = 'cinema';
  $password = 'cinema';
} 
else {
  $hostname = '91.209.211.129';
  $username = 'xcinema';
  $password = 'ZjtmNhnGwpMHUDqH';
}
$dbname = 'cinema';

try {
  $dbh = new PDO("mysql:host=$hostname;dbname=$dbname", $username, $password);
  //$dbh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_WARNING); 
}
catch(PDOException $e) {
  die($e->getMessage());
}

function validIdent($ident) {
  return preg_match('/^[0-9A-Za-z$_]*$/',$ident);
}

function handleRequest($action, $store, $data, $dbh) {
  // check if table name is sanitized
  if(!validIdent($store)) {
    return;
  }

  $data = json_decode($data);

  switch($action) {
    case "put":
      // check if all column names are sanitized
      foreach($data as $key => $value) {
        if(!validIdent($key)) {
          return;
        }
      }

      $columns = implode(", ", array_keys(get_object_vars($data)));
      $qmarks = implode(", ", array_fill(0, count(get_object_vars($data)), "?"));
      $stmt = $dbh->prepare("INSERT INTO $store ($columns) VALUES ($qmarks)");
      $i = 1;
      foreach($data as $value) {
        $stmt->bindValue($i,$value);
        $i++;
      }

      $result = array("object"=>$data);

      if($stmt->execute()) {
        $result['result'] = "success";
      }
      else {
        $errorInfo = $stmt->errorInfo();
        if($errorInfo[1] != 1062) {
          $result['result'] = "failed";
          $result['cause'] = $errorInfo;
        }
        else {
          // primary key collision - try UPDATE!
          function makeAssign($column) {
            return $column." = ?";
          }

          $assign = implode(", ", array_map("makeAssign",array_keys(get_object_vars($data))));
          $stmt = $dbh->prepare("UPDATE $store SET $assign WHERE ID = ?");
          $i = 1;
          foreach($data as $value) {
            $stmt->bindValue($i,$value);
            $i++;
          }

          $stmt->bindValue($i,$data->ID,PDO::PARAM_INT);

          if($stmt->execute()) {
            $result['result'] = "success";
          }
          else {
            $result['result'] = "failed";
            $result['cause'] = $stmt->errorInfo();
          }
        }
      }

      echo json_encode($result);

      break;

    case "get":
      $where = "";
      if(isset($data->timestamp) > 0) {
        $where = " WHERE updated_at > ".intval($data->timestamp);
      }

      $stmt = $dbh->query("SELECT * FROM $store".$where);
      if($stmt) {
        echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
      }
      else {
        print_r($dbh->errorInfo());
      }
      break;

    case "reserve":
      $range = array("store"=>$store,"time"=>floor(microtime(true)*1000));

      // lock table - deny writes before new range is set
      $dbh->exec("LOCK TABLES $store WRITE");

      // get current auto_increment
      $result = $dbh->query("SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES WHERE table_name=\"$store\"");
      $row = $result->fetch();
      $range['min'] = intval($row['AUTO_INCREMENT']);

      // check for bigger values
      $row = $dbh->query("SELECT MAX(ID) as maxVal FROM $store")->fetch();
      $range['min'] = max($range['min'],intval($row['maxVal'])+1);

      // calculate and validate block
      $range['max'] = $range['min']+intval($data->blockSize)-1;
      if($range['min'] < $range['max']) {
        echo json_encode($range);

        // set new AUTO_INCREMENT
        $result = $dbh->exec("ALTER TABLE $store AUTO_INCREMENT=".($range['max']+1));
      }

      // unlock table
      $dbh->exec("UNLOCK TABLES");
      
      break;
  }
}
/*
// create check constraint "do not allow inserts below auto_increment value"
// DOES NOT RUN, because mySQL does allow creating triggers only for superusers
$dbh->exec("DROP TABLE IF EXISTS `ConstraintError`");
$dbh->exec("CREATE TABLE `ConstraintError` (`Message` varchar(128) UNIQUE)
     ENGINE=MEMORY
     COMMENT='Write to this table twice to force a constraint failure.'");
$dbh->exec("create trigger force_autoincrement
before insert on day 
for each row
begin
 if new.ID <= LAST_INSERT_ID() then
   INSERT INTO ConstraintError (`Message`) VALUES ('Do not assign the auto_increment value');
   INSERT INTO ConstraintError (`Message`) VALUES ('Do not assign the auto_increment value');
 end if;
end;
");
*/

$data = "";
if(isset($_REQUEST['data'])) {
  $data = $_REQUEST['data'];
}

if(isset($_REQUEST['action']) && $_REQUEST['store']) {
  handleRequest($_REQUEST['action'],$_REQUEST['store'],$data,$dbh);
}

?>
