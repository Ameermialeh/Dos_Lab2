# Use an official Node.js runtime as a parent image
FROM node:14

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install your application's dependencies
RUN npm install

COPY . . 
# Expose the port the app runs on
EXPOSE 8001
# WORKDIR /app/src
# Define the command to run your application
CMD ["npm", "run" ,"start-dev"]
