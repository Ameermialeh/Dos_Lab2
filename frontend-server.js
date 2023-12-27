const http = require("http");
const express = require("express");
const app = express();
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
const maxCacheSize = 100; // Maximum number of items in the cache
const port = 8000; // port server frontend http://172.18.0.6:8000

// Function to check cache size and apply LRU if needed
function checkCacheSize() {
  const currentCacheSize = cache.keys().length;

  if (currentCacheSize > maxCacheSize) {
    const itemsToRemove = currentCacheSize - maxCacheSize;

    // Get the least recently used keys
    const lruKeys = cache.keys().slice(0, itemsToRemove);

    // Remove the least recently used items from the cache
    lruKeys.forEach((key) => {
      cache.del(key);
    });
  }
}

//info end point http://172.18.0.6:8000/info/itemID
app.get("/info/:itemId", (req, res) => {
  const { itemId } = req.params; //get item id obj

  try {
    // Check if data is in the cache
    const cachedData = cache.get(itemId);

    if (cachedData) {
      console.log(`Data found in cache for item ID ${itemId}`);
      res.json(cachedData);
      return;
    }

    const catalogRequest = http.get(
      `http://172.18.0.7:8001/info/${itemId}`, //call catalog service http://172.18.0.7:8001/info/itemID
      //response from server catalog
      (catalogRes) => {
        let data = "";

        //save response in data as String
        catalogRes.on("data", (chunk) => {
          data += chunk;
        });
        //send response server frontend to user
        catalogRes.on("end", () => {
          //chick if status of res catalog is 200 (ok)
          if (catalogRes.statusCode === 200) {
            const responseObject = JSON.parse(data); //convert data from String to json format

            // Cache the data for future use
            cache.set(itemId, responseObject);
            checkCacheSize(); // Check and apply cache size limit

            res.json(responseObject); //send res to user
          } else {
            //if status code from catalog server is 404 then Item not found in data base
            res.status(404).json({
              error: "Item not found",
            });
          }
        });
      }
    );
    // if there an error in catalog server then send status 500 to user
    catalogRequest.on("error", (error) => {
      res.status(500).json({
        error: "Error: catalog server dose not running: " + error.message,
      });
    });

    catalogRequest.end();
  } catch (e) {
    console.log(e);
  }
});

// the Api can search by item ID or topic name
//Search end point http://172.18.0.6:8000/search/itemID
//Search end point http://172.18.0.6:8000/search/topic
app.get("/search/:query", (req, res) => {
  const { query } = req.params; //get item id or item topic obj

  try {
    // Check if data is in the cache
    const cachedData = cache.get(query);

    if (cachedData) {
      console.log(`Data found in cache for query ${query}`);
      res.json(cachedData);
      return;
    }

    const catalogRequest = http.get(
      `http://172.18.0.7:8001/search/${query}`, //call catalog service http://172.18.0.7:8001/search/itemID or topic
      (catalogRes) => {
        let data = "";
        //Same as info api
        catalogRes.on("data", (chunk) => {
          data += chunk;
        });
        catalogRes.on("end", () => {
          if (catalogRes.statusCode === 200) {
            const responseObject = JSON.parse(data);

            // Cache the data for future use
            cache.set(query, responseObject);
            checkCacheSize();
            res.json(responseObject);
          } else {
            res.status(404).json({
              error: "item not found",
            });
          }
        });
      }
    );
    catalogRequest.on("error", (error) => {
      res.status(500).json({
        error: "Error: catalog server dose not running: " + error.message,
      });
    });

    catalogRequest.end();
  } catch (e) {
    console.log(e);
  }
});

// the Api can purchase by item ID or item name
//purchase end point http://172.18.0.6:8000/purchase/itemID
app.post("/purchase/:itemID", async (req, res) => {
  const { itemID } = req.params;

  try {
    // Check if the item is out of stock in the cache
    const cachedOutOfStock = cache.get(`outOfStock_${itemID}`);

    if (cachedOutOfStock) {
      console.log(`Item ID ${itemID} is out of stock (cached)`);
      res.status(400).json({
        message: " Item out of stock ",
      });
      return;
    }

    // Check if the item is marked as not found in the cache
    const cachedNotFound = cache.get(`notFound_${itemID}`);

    if (cachedNotFound) {
      console.log(`Item ID ${itemID} not found (cached)`);
      res.status(404).json({
        message: " Item not found ",
      });
      return;
    }

    const orderOptions = {
      hostname: "172.18.0.8",
      port: 8002,
      path: `/purchase/${itemID}`,
      method: "POST",
    };

    const orderRequest = http.request(orderOptions, (orderRes) => {
      let data = "";

      orderRes.on("data", (chunk) => {
        data += chunk;
      });

      orderRes.on("end", () => {
        const responseObject = JSON.parse(data);

        if (orderRes.statusCode === 200) {
          res.json({
            message: ` ${responseObject.message} `, // Item bought successfully
          });
        } else if (orderRes.statusCode === 404) {
          // Cache the information that the item is not found
          cache.set(`notFound_${itemID}`, true);
          checkCacheSize();
          res.status(404).json({
            message: ` ${responseObject.message} `, // Item not found
          });
        } else {
          // Cache the information that the item is out of stock
          cache.set(`outOfStock_${itemID}`, true);
          checkCacheSize();
          res.status(400).json({
            message: ` ${responseObject.message} `, // Item out of stock
          });
        }
      });
    });

    orderRequest.on("error", (error) => {
      res.status(500).json({
        error: "Error: order server does not running " + error.message,
      });
    });

    orderRequest.end();
  } catch (e) {
    console.log(e);
  }
});

app.listen(port, () => {
  //here the server running on port 8000
  console.log(`Server is running on port ${port}`);
});
