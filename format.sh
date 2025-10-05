#!/bin/bash

# Check if Prettier is installed globally, if not, use the local version
if ! command -v prettier &> /dev/null
then
  echo "Prettier not found globally, using local version"
  npx prettier --write .
else
  echo "Formatting with global Prettier"
  prettier --write .
fi

echo "Formatting complete!"