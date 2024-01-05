const http = require("http");
const express = require("express");
const app = express();
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 6000, checkperiod: 120 }); //TTL 6000 sec
const maxCacheSize = 4; // Maximum number of items in the cache
const port = 8000; // port server frontend http://172.18.0.6:8000

//For replication part
// -------------------------------------------
const replicaCatalogServers = [
  //catalog server
  { host: "localhost", port: 8001 },
  { host: "localhost", port: 7001 },
  // Add more replica servers as needed
];

const replicaOrderServers = [
  //catalog server
  { host: "localhost", port: 8002 },
  { host: "localhost", port: 7002 },
  // Add more replica servers as needed
];

let currentCatalogServerIndex = 0;
let currentOrderServerIndex = 0;
// -------------------------------------------
function getCatalogIndex() {
  return (currentCatalogServerIndex =
    (currentCatalogServerIndex + 1) % replicaCatalogServers.length);
}

function getOrderIndex() {
  return (currentOrderServerIndex =
    (currentOrderServerIndex + 1) % replicaOrderServers.length);
}
//---------------------------------------------

//for cache replacement part
//---------------------------------------------
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// Function to check cache size and apply LRU if needed
function checkCacheSize(itemId, responseObject) {
  const currentCacheSize = cache.keys().length;

  if (currentCacheSize > maxCacheSize) {
    const randomInt = getRandomInt(0, currentCacheSize);

    const itemToDelete = cache.keys().at(randomInt);
    // Remove the items from the cache based on random generator algorithm
    cache.del(itemToDelete);

    // Cache the data for future use
    cache.set(itemId, responseObject);
    return false;
  } else {
    return true;
  }
}

//info end point http://172.18.0.6:8000/info/itemID
app.get("/info/:itemId", (req, res) => {
  const { itemId } = req.params; //get item id obj
  const startTime = process.hrtime(); // Start tracking time
  try {
    //to enable load balancing method on catalog server
    const currentServer = replicaCatalogServers[currentCatalogServerIndex];

    // Check if the item is marked as not found in the cache
    const cachedNotFound = cache.get(itemId);

    if (cachedNotFound && cachedNotFound == -1) {
      console.log(`Item ID ${itemId} not found (cached)`);
      const endTime = process.hrtime(startTime); // calculate the time
      console.log(
        `Time taken From cache: ${endTime[0]}s ${endTime[1] / 1000000}ms`
      );
      res.status(404).json({
        message: " Item not found (cached) ",
      });
      return;
    }

    // Check if data is in the cache
    const cachedData = cache.get(itemId);

    if (cachedData) {
      console.log(`Data found in cache for item ID ${itemId}`);
      const endTime = process.hrtime(startTime);
      console.log(
        `Time taken From cache: ${endTime[0]}s ${endTime[1] / 1000000}ms`
      );
      res.json(cachedData);
      return;
    }

    const catalogRequest = http.get(
      // `http://172.18.0.7:8001/info/${itemId}`, //call catalog service http://172.18.0.7:8001/info/itemID
      `http://${currentServer.host}:${currentServer.port}/info/${itemId}`, //call catalog service http://172.18.0.7:8001/info/itemID
      //response from server catalog
      (catalogRes) => {
        let data = "";

        //save response in data as String
        catalogRes.on("data", (chunk) => {
          data += chunk;
        });
        //send response server frontend to user
        catalogRes.on("end", () => {
          currentCatalogServerIndex = getCatalogIndex();
          console.log("Server port: " + currentServer.port);
          //chick if status of res catalog is 200 (ok)
          if (catalogRes.statusCode === 200) {
            const responseObject = JSON.parse(data); //convert data from String to json format

            var size = checkCacheSize(itemId, responseObject); // Check and apply cache size limit

            if (size) {
              // Cache the data for future use
              cache.set(itemId, responseObject);
            }
            const endTime = process.hrtime(startTime);
            console.log(
              `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
            );
            res.json(responseObject); //send res to user
          } else {
            var size = checkCacheSize(itemId, -1); // Check and apply cache size limit
            if (size) {
              cache.set(itemId, -1);
            }
            const endTime = process.hrtime(startTime);
            console.log(
              `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
            );
            //if status code from catalog server is 404 then Item not found in data base
            res.status(404).json({
              message: "Item not found",
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
//Search end point http://172.18.0.6:8000/search/title
//Search end point http://172.18.0.6:8000/search/topic
app.get("/search/:query", (req, res) => {
  const { query } = req.params; //get item id or item topic obj
  const startTime = process.hrtime(); // Start tracking time
  try {
    //to enable load balancing method on catalog server
    const currentServer = replicaCatalogServers[currentCatalogServerIndex];

    const cachedData = cache.get(query);

    if (cachedData) {
      console.log(`Data found in cache for query ${query}`);
      const endTime = process.hrtime(startTime); // calculate the time
      console.log(
        `Time taken From cache: ${endTime[0]}s ${endTime[1] / 1000000}ms`
      );
      res.json(cachedData);
      return;
    }

    const catalogRequest = http.get(
      //`http://172.18.0.7:8001/search/${query}`, //call catalog service http://172.18.0.7:8001/search/title or topic
      `http://${currentServer.host}:${currentServer.port}/search/${query}`, //call catalog service http://172.18.0.7:8001/search/title or topic
      (catalogRes) => {
        let data = "";
        //Same as info api
        catalogRes.on("data", (chunk) => {
          data += chunk;
        });
        catalogRes.on("end", () => {
          currentCatalogServerIndex = getCatalogIndex();
          console.log("Server port: " + currentServer.port);
          if (catalogRes.statusCode === 200) {
            const responseObject = JSON.parse(data);

            var size = checkCacheSize(query, responseObject); // Check and apply cache size limit
            if (size) {
              cache.set(query, responseObject);
            }
            const endTime = process.hrtime(startTime); // calculate the time
            console.log(
              `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
            );
            res.json(responseObject);
          } else {
            const endTime = process.hrtime(startTime); // calculate the time
            console.log(
              `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
            );
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
  const startTime = process.hrtime(); // Start tracking time
  try {
    //to enable load balancing method on order server
    const currentServer = replicaOrderServers[currentOrderServerIndex];

    // Check if the item is marked as not found in the cache
    const cachedNotFound = cache.get(itemID);

    if (cachedNotFound && cachedNotFound == -1) {
      console.log(`Item ID ${itemID} not found (cached)`);
      const endTime = process.hrtime(startTime); // calculate the time
      console.log(
        `Time taken From cache: ${endTime[0]}s ${endTime[1] / 1000000}ms`
      );
      res.status(404).json({
        message: " Item not found ",
      });
      return;
    }

    // Check if the item is out of stock in the cache
    const cachedOutOfStock = cache.get(itemID);

    if (cachedOutOfStock && cachedOutOfStock[0]["quantity"] <= 0) {
      console.log(`Item ID ${itemID} is out of stock (cached)`);
      const endTime = process.hrtime(startTime); // calculate the time
      console.log(
        `Time taken From cache: ${endTime[0]}s ${endTime[1] / 1000000}ms`
      );
      res.status(400).json({
        message: " Item out of stock ",
      });
      return;
    }

    const orderOptions = {
      // hostname: "172.18.0.8",
      hostname: currentServer.host,
      port: currentServer.port,
      path: `/purchase/${itemID}`,
      method: "POST",
    };

    const orderRequest = http.request(orderOptions, (orderRes) => {
      let data = "";

      orderRes.on("data", (chunk) => {
        data += chunk;
      });

      orderRes.on("end", () => {
        currentOrderServerIndex = getOrderIndex();
        console.log("Server port: " + currentServer.port);
        const responseObject = JSON.parse(data);

        if (orderRes.statusCode === 200) {
          // update the item in database
          const UpdateRequestOptions = {
            hostname: currentServer.host,
            port: currentServer.port == "7002" ? 8001 : 7001,
            path: `/setData?itemId=${itemID}&quantity=${
              responseObject.quantity - 1
            }`,
            method: "PUT",
          };
          const updateRequest = http.request(
            UpdateRequestOptions,
            // catalog server response
            (decrementResponse) => {
              const responseData = [];

              // save response data in array
              decrementResponse.on("data", (chunk) => {
                responseData.push(chunk);
              });

              decrementResponse.on("end", () => {
                if (decrementResponse.statusCode == 200) {
                  const endTime = process.hrtime(startTime); // calculate the time
                  console.log(
                    `Time taken From server: ${endTime[0]}s ${
                      endTime[1] / 1000000
                    }ms`
                  );
                  res.status(200).json({
                    message: `Bought book \'${responseObject.title}\' successfully`, // Item bought successfully
                  });
                }
              });
            }
          );
          updateRequest.on("error", (error) => {
            //error in catalog server update
            res
              .status(500)
              .json({ error: "Error Update item quantity: " + error.message });
          });
          updateRequest.end();
        } else if (orderRes.statusCode === 404) {
          var size = checkCacheSize(itemID, -1); // Check and apply cache size limit
          if (size) {
            cache.set(itemID, -1);
          }
          cache.keys().forEach((key) => console.log(key));
          const endTime = process.hrtime(startTime); // calculate the time
          console.log(
            `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
          );
          res.status(404).json({
            message: ` ${responseObject.message} `, // Item not found
          });
        } else {
          var size = checkCacheSize(itemID, responseObject); // Check and apply cache size limit
          if (size) {
            cache.set(itemID, responseObject);
          }
          const endTime = process.hrtime(startTime); // calculate the time
          console.log(
            `Time taken From server: ${endTime[0]}s ${endTime[1] / 1000000}ms`
          );
          res.status(400).json({
            message: "Item out of stock", // Item out of stock
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
// api to delete from cache when update on database
app.delete("/invalidate/:itemId", (req, res) => {
  const { itemId } = req.params;
  var flag = false;
  console.log("inside delete");
  console.log("//////////////");
  cache.keys().forEach((key) => {
    if (key == itemId) {
      flag = true;
    }
  });

  if (flag) {
    console.log("before delete");
    cache.keys().forEach((key) => console.log(key));
    const removed = cache.del(itemId);
    console.log("after delete");
    cache.keys().forEach((key) => console.log(key));

    if (removed) {
      res.status(200).json({
        response: true,
      });
    } else {
      res.status(404).json({
        response: false,
      });
    }
  } else {
    res.status(200).json({
      response: true,
    });
  }
});

app.listen(port, () => {
  //here the server running on port 8000
  console.log(`Server is running on port ${port}`);
});
