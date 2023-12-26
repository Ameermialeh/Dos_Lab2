const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");

const app = express();
const port = 8002; // port server order http://172.18.0.8:8002

app.use(bodyParser.json());

// catalog server http://172.18.0.7:8001
const catalogServerOptions = {
  hostname: "172.18.0.7",
  port: 8001,
};

//in order server just purchase api
// the api called by frontend server and then send response to frontend
// http://172.18.0.8:8002/purchase/itemID
app.post("/purchase/:itemID", (req, res) => {
  const { itemID } = req.params; //get item id obj or item name

  //call catalog server to chick if the item is in stock
  const catalogRequest = http.get(
    `http://${catalogServerOptions.hostname}:${catalogServerOptions.port}/purchase/${itemID}`,
    //response from server catalog
    (catalogResponse) => {
      let data = "";

      //save response in 'data' as String
      catalogResponse.on("data", (chunk) => {
        data += chunk;
      });

      catalogResponse.on("end", () => {
        const catalogData = JSON.parse(data); //convert from String to json

        //if item not found
        if (catalogResponse.statusCode == 404) {
          return res.status(404).json({ message: catalogData.message }); //item not found
        }

        // Check if the item is in stock
        if (!catalogData || catalogData.quantity <= 0) {
          return res.status(400).json({ message: "Item out of stock" }); // "Item out of stock"
        }
        // if found in stock send PUT query to catalog server to update on item quantity decrement by one
        //call catalog service http://172.18.0.8:8002/update/itemID
        const decrementRequestOptions = {
          hostname: catalogServerOptions.hostname,
          port: catalogServerOptions.port,
          path: `/update/${itemID}`,
          method: "PUT",
        };
        const decrementRequest = http.request(
          decrementRequestOptions,
          // catalog server response
          (decrementResponse) => {
            const responseData = [];

            // save response data in array
            decrementResponse.on("data", (chunk) => {
              responseData.push(chunk);
            });

            decrementResponse.on("end", () => {
              const responseText = responseData.join("");
              const responseObject = JSON.parse(responseText); //convert response to json

              if (decrementResponse.statusCode == 404) {
                //item not found
                res.status(404).json({ message: responseObject.message });
              } else if (decrementResponse.statusCode == 400) {
                //item out of stock
                res.status(400).json({ message: responseObject.message });
              } else {
                res.status(200).json({
                  message: `Bought book \'${responseObject.title}\' successfully`, // title here is item name
                });
              }
            });
          }
        );
        decrementRequest.on("error", (error) => {
          //error in catalog server update
          res
            .status(500)
            .json({ error: "Error Update item quantity: " + error.message });
        });
        decrementRequest.end();
      });
    }
  );

  catalogRequest.on("error", (error) => {
    //error in catalog server
    res
      .status(500)
      .json({ error: "Error querying catalog server: " + error.message });
  });

  catalogRequest.end();
});

app.listen(port, () => {
  //here the server running on port 8002
  console.log(`Server is running on port ${port}`);
});
