#!/bin/bash

docker-compose down
docker rm container.rdp-client
docker rmi image.rdp-client

echo "Exit Successfully."