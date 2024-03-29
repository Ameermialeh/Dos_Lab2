const http = require("http");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const app = express();
const port = 8001; // port server catalog http://172.18.0.7:8001

// declare data base and open it as READWRITE
const db = new sqlite3.Database("catalog.db", sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to the database.");
  }
});

// Search end point request come from order
// http://172.18.0.7:8001/purchase/queryParam
app.get("/purchase/:itemID", (req, res) => {
  const { itemID } = req.params;

  let query = "SELECT * FROM catalog WHERE id = ?";
  let params = [itemID];
  if (itemID > 0 && itemID <= 7) {
    //send query to db
    db.all(query, params, (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: err.message });
      }
      res.status(200).json(rows);
    });
  } else {
    res.status(404).json({ message: "Item not found" });
  }
});
// Search end point request come from frontend
// http://172.18.0.7:8001/search/searchTerm
app.get("/search/:searchTerm", (req, res) => {
  const { searchTerm } = req.params; //search by item name or item type
  let query;
  let params;

  if (
    searchTerm == "distributed systems" ||
    searchTerm == "undergraduate school"
  ) {
    //if searchTerm was item type then select from db where type = searchTerm
    query = "SELECT id, title FROM catalog WHERE type LIKE ?";
    params = [`%${searchTerm}%`];
  } else {
    //if searchTerm was item name then select from db where title = searchTerm
    query = "SELECT id, title FROM catalog WHERE title LIKE ?";
    params = [`%${searchTerm}%`];
  }

  //send query to db
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
    //if there is data from response send it to frontend
    if (rows && rows.length > 0) {
      res.json(rows);
    } else {
      res.status(404).json({ error: "Items not founds" });
    }
  });
});
// Info end point request come from frontend
// http://172.18.0.7:8001/info/itemId
app.get("/info/:itemId", (req, res) => {
  const { itemId } = req.params;
  let query = "SELECT * FROM catalog WHERE id LIKE ?"; //select everything from db when id = itemId

  db.all(query, [itemId], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: "Internal server error" });
    }
    //if there is data from response send it to frontend
    if (rows && rows.length > 0) {
      res.json(rows);
    } else {
      res.status(404).json({ error: "Items not founds" });
    }
  });
});

// Info end point request come from order
// http://172.18.0.7:8001/update/itemId
app.put("/update/:itemId", (req, res) => {
  try {
    const { itemId } = req.params;

    //chick if the item exist in db
    //if itemId <= 4 because we have for item
    if (itemId > 0 && itemId <= 7) {
      // Query the catalog table in the SQLite database by item ID or title
      db.all(`SELECT * FROM catalog WHERE id = ?`, [itemId], (err, rows) => {
        if (err) {
          console.error(err.message);
          return res.status(500).json({ error: "Internal server error" });
        }

        const q = rows[rows.length - 1].quantity; // save the quantity of item i 'q'
        const obj = rows[0]; // save the title of item i 'title'

        // chick if item found in stock
        if (rows && q > 0) {
          // Decrease the quantity by one
          const updatedQuantity = q - 1;

          // Update the quantity in the database
          db.run(
            `UPDATE catalog SET quantity = ? WHERE id = ?`,
            [updatedQuantity, itemId],
            (updateErr) => {
              if (updateErr) {
                console.error(updateErr.message);
                return res.status(500).json({ error: "Internal server error" });
              }

              const options = {
                hostname: "172.18.0.6",
                port: 8000,
                path: `/invalidate/${itemId}`,
                method: "DELETE",
              };

              const frontendRequest = http.request(options, (catalogRes) => {
                let data = "";

                catalogRes.on("data", (chunk) => {
                  data += chunk;
                });

                catalogRes.on("end", () => {
                  // Parse the response data if it's JSON
                  const responseObject = JSON.parse(data);

                  if (
                    catalogRes.statusCode === 200 &&
                    responseObject.response === true
                  ) {
                    // Cache item was successfully invalidated
                    console.log("Cache item invalidated successfully");
                    // Send name of item to order server
                    res.status(200).json(obj);
                  } else {
                    // Cache item was not invalidated or encountered an error
                    console.error("Failed to invalidate cache item");
                    // Send name of item to order server
                    res.status(200).json(obj);
                  }
                });
              });
              frontendRequest.on("error", (error) => {
                console.error(`Error making HTTP request: ${error.message}`);
                // Handle the error as needed
              });

              frontendRequest.end();
            }
          );
        } else {
          res.status(400).json({ message: "Item out of stock" });
        }
      });
    } else {
      res.status(404).json({ message: "Item not found" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
//
app.put("/setData", (req, res) => {
  try {
    const { itemId, quantity } = req.query;
    sql = "Update catalog SET quantity = ? WHERE id = ?";
    db.all(sql, [quantity, itemId], (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: "Internal server error" });
      }
      res.status(200).json("Update quantity successfully");
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  //here the server running on port 8001
  console.log(`Server is running on port ${port}`);
});
