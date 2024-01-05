#!/bin/bash

# Array to store server paths
server_paths=("frontend-server.js")

# Start Node.js servers in Git Bash instances
for server_path in "${server_paths[@]}"; do
    start "" "D:\Git\git-bash.exe" -c "nodemon $server_path"
done
