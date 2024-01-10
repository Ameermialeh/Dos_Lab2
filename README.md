To run the project:
first install node_modules in replication1 file,frontend-server file and replication2 file

write on terminal 
cd .\frontend-server\
npm install
cd ../
cd .\replication1\catalog-server  
npm install
cd ../
cd .\order-server\
npm install
cd ../
cd ../
cd .\replication2\catalog-server     
npm install
cd ../
cd .\order-server\
npm install
cd ../
cd ../

run# docker-compose build // to build the 3 images
run# docker images // to show you 3 images 
run# docker network create --subnet=172.18.0.0/16 internal-network  //to create network
run# docker-compose up //to run the images

then u can test the servers on postman or the edge browser:
http://192.168.0.6:8000/info/
http://192.168.0.6:8000/search/
http://192.168.0.6:8000/purchse/
